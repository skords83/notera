import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { mutate, snapshot, maintain } from "../src/server/domain";
import { backup, restore } from "../src/server/backup";
import type { Mutation } from "../src/shared/model";

test("subtasks: independent edits, validation, inherited rights, atomic completion/undo and lifecycle", async () => {
  const dir = await mkdtemp("/tmp/notera-subtasks-");
  process.env.DATA_DIR = dir + "/db";
  const db = new Database();
  let target: Database | undefined;
  try {
    await db.migrate();
    await db.migrate();
    const a = await createUser(db, "one", "One", "isolated-test-password");
    const b = await createUser(db, "two", "Two", "isolated-test-password");
    const device = randomUUID();
    const snap = (u = a) => snapshot(db, u, 0, device);
    const command = (
      entity: Mutation["entity"],
      id: string,
      patch: Record<string, unknown>,
      version = 0,
    ): Mutation => ({ key: randomUUID(), device, entity, id, patch, version });
    const run = (
      entity: Mutation["entity"],
      id: string,
      patch: Record<string, unknown>,
      version = 0,
      user = a,
    ) => mutate(db, user, command(entity, id, patch, version));
    const inbox = (await snap()).lists[0].id;
    const otherInbox = (await snap(b)).lists[0].id;
    const id = randomUUID(),
      x = randomUUID(),
      y = randomUUID(),
      list = randomUUID();
    await run("task", id, { title: "Schatzsuche planen", listId: inbox });
    for (const title of ["", "   ", "x".repeat(241)])
      await assert.rejects(run("subtask", x, { taskId: id, title }));
    await assert.rejects(
      run("subtask", x, { taskId: id, title: "Privat" }, 0, b),
      { status: 403 },
    );
    await assert.rejects(
      run("subtask", x, { taskId: id, title: "Nesting", due: null }),
    );
    await run("subtask", x, { taskId: id, title: "  Hinweise schreiben  " });
    await assert.rejects(run("subtask", y, { taskId: x, title: "Nested" }), {
      status: 410,
    });
    await run("subtask", y, { taskId: id, title: "Verstecke auswählen" });
    assert.deepEqual(
      (await snap()).subtasks.map((c) => c.id),
      [x, y],
    );
    assert.equal((await snap()).subtasks[0].title, "Hinweise schreiben");
    assert.equal((await snap(b)).subtasks.length, 0);
    await run("list", list, { name: "Gemeinsam", members: [b] });
    await assert.rejects(run("task", id, { listId: otherInbox }, 1), {
      status: 403,
    });
    await run("task", id, { listId: list }, 1);
    assert.equal((await snap(b)).subtasks.length, 2);
    await Promise.all([
      run("subtask", x, { title: "Hinweise fertig" }, 1),
      run("subtask", y, { done: true }, 1, b),
    ]);
    await assert.rejects(run("subtask", x, { title: "Konflikt" }, 1, b), {
      status: 409,
    });
    await run("subtask", x, { done: true }, 1, b); // different field merges
    assert.equal((await snap()).tasks[0].done, false);
    await run("task", id, { done: true }, 2);
    await run("task", id, { done: false }, 3);
    assert.ok((await snap()).subtasks.every((c) => c.done));
    await run("task", id, { done: true }, 4);
    await run("subtask", x, { done: false }, 3);
    assert.equal((await snap()).tasks[0].done, false);
    await assert.rejects(run("task", id, { done: true }, 6), { status: 409 });
    const complete = command(
      "completion",
      id,
      { action: "complete", openIds: [x] },
      6,
    );
    await mutate(db, a, complete);
    await mutate(db, a, complete); // lost response retry is idempotent
    assert.ok((await snap()).subtasks.every((c) => c.done));
    await run("completion", id, { action: "undo", key: complete.key }, 7);
    assert.equal((await snap()).tasks[0].done, false);
    assert.equal((await snap()).subtasks.find((c) => c.id === x)?.done, false);
    assert.equal((await snap()).subtasks.find((c) => c.id === y)?.done, true);
    await assert.rejects(
      run("completion", id, { action: "complete", openIds: [] }, 8),
      { status: 409 },
    );
    assert.equal((await snap()).tasks[0].done, false);
    const second = command(
      "completion",
      id,
      { action: "complete", openIds: [x] },
      8,
    );
    await mutate(db, a, second);
    await run("subtask", x, { done: false }, 7);
    await assert.rejects(
      run("completion", id, { action: "undo", key: second.key }, 9),
      { status: 409 },
    );
    // New child reopens completed parent, even when submitted as done.
    await run("subtask", x, { done: true }, 8);
    let version = (await snap()).tasks[0].version;
    await run("task", id, { done: true }, version);
    const z = randomUUID();
    await run("subtask", z, { taskId: id, title: "Schatz besorgen" });
    assert.equal((await snap()).tasks[0].done, false);
    version = (await snap()).tasks[0].version;
    await run("task", id, { deleted: true }, version);
    assert.equal((await snap()).subtasks.length, 3);
    await assert.rejects(run("subtask", z, { title: "Trash edit" }, 1), {
      status: 409,
    });
    await run("task", id, { deleted: false }, version + 1);
    await run("subtask", z, { deleted: true }, 1);
    await assert.rejects(run("subtask", z, { title: "Cannot resurrect" }, 0), {
      status: 410,
    });
    const saved = await backup(db);
    process.env.DATA_DIR = dir + "/restored";
    target = new Database();
    await target.migrate();
    await restore(target, saved);
    assert.deepEqual(
      (await snapshot(target, a, 0, device)).subtasks,
      (await snap()).subtasks,
    );
    // Revocation before replay and move require current source/target rights.
    await run("list", list, { members: [] }, 1);
    await assert.rejects(run("subtask", x, { title: "Denied" }, 9, b), {
      status: 403,
    });
    assert.equal((await snap(b)).subtasks.length, 0);
    version = (await snap()).tasks[0].version;
    await run("task", id, { deleted: true }, version);
    await db.query(
      "UPDATE tasks SET deleted_at=now()-interval '31 days' WHERE id=$1",
      [id],
    );
    await maintain(db);
    assert.equal((await db.query("SELECT * FROM subtasks")).rows.length, 0);
    await assert.rejects(
      run("subtask", randomUUID(), { taskId: id, title: "No resurrection" }),
      { status: 410 },
    );
  } finally {
    await target?.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
