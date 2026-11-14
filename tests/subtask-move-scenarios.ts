import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { mutate, snapshot } from "../src/server/domain";
import type { Mutation } from "../src/shared/model";

export async function subtaskMoveScenarios(db: Database, peer: Database = db) {
  const user = await createUser(
    db,
    `move-${randomUUID().slice(0, 8)}`,
    "Move",
    "isolated-move-password",
  );
  const other = await createUser(
    db,
    `other-${randomUUID().slice(0, 8)}`,
    "Other",
    "isolated-move-password",
  );
  const device = randomUUID();
  const snap = () => snapshot(db, user, 0, device);
  const command = (
    entity: Mutation["entity"],
    id: string,
    patch: Record<string, unknown>,
    version = 0,
  ): Mutation => ({ entity, id, patch, version, device, key: randomUUID() });
  const run = (
    entity: Mutation["entity"],
    id: string,
    patch: Record<string, unknown>,
    version = 0,
  ) => mutate(db, user, command(entity, id, patch, version));
  const list = (await snap()).lists[0].id;
  const mergeParent = randomUUID(),
    mergeChild = randomUUID();
  await run("task", mergeParent, { title: "Independent fields", listId: list });
  await run("subtask", mergeChild, { title: "Before", taskId: mergeParent });
  await run("subtask", mergeChild, { done: true, taskId: mergeParent }, 1);
  await run("subtask", mergeChild, { title: "After", taskId: mergeParent }, 1);
  assert.equal(
    (await snap()).subtasks.find((c) => c.id === mergeChild)!.done,
    true,
    "expected-parent guards preserve independent field merging",
  );
  const [source, target, third, child, anchor] = Array.from({ length: 5 }, () =>
    randomUUID(),
  );
  for (const id of [source, target, third])
    await run("task", id, { title: id, listId: list });
  await run("subtask", child, { title: "Move me", taskId: source });
  await run("subtask", anchor, { title: "First", taskId: target, done: true });
  await run("task", target, { done: true }, 1);
  const move = async (from = source, to = target) => {
    const s = await snap();
    return command(
      "subtaskMove",
      child,
      {
        sourceId: from,
        targetId: to,
        targetVersion: s.tasks.find((t) => t.id === to)!.version,
      },
      s.subtasks.find((c) => c.id === child)!.version,
    );
  };
  const first = await move();
  await assert.rejects(mutate(db, other, first), { status: 403 });
  const result = await mutate(db, user, first);
  assert.deepEqual(
    await mutate(db, user, first),
    result,
    "lost response retries exact receipt",
  );
  let s = await snap();
  assert.equal(s.subtasks.filter((c) => c.id === child).length, 1);
  assert.equal(s.subtasks.find((c) => c.id === child)!.taskId, target);
  assert.equal(s.subtasks.find((c) => c.id === child)!.title, "Move me");
  assert.equal(s.subtasks.find((c) => c.id === child)!.done, false);
  assert.ok(
    s.subtasks.find((c) => c.id === child)!.position >
      s.subtasks.find((c) => c.id === anchor)!.position,
  );
  assert.equal(s.tasks.find((t) => t.id === target)!.done, false);
  assert.equal(s.tasks.find((t) => t.id === source)!.done, false);
  await assert.rejects(run("subtask", child, { done: true }, 1), {
    status: 409,
  });
  await assert.rejects(
    run("order", child, {
      kind: "subtask",
      scopeId: source,
      anchorId: anchor,
      anchorVersion: 0,
      side: "before",
    }),
    { status: 409 },
  );
  await assert.rejects(run("subtask", child, { taskId: source }, 2), {
    status: 400,
  });
  // Two simultaneous moves can only have one winner, including independent callers.
  const a = await move(target, source),
    b = await move(target, third);
  const races = await Promise.allSettled([
    mutate(db, user, a),
    mutate(peer, user, b),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    races.filter((r) => r.status === "rejected" && r.reason.status === 409)
      .length,
    1,
  );
  s = await snap();
  assert.equal(s.subtasks.filter((c) => c.id === child).length, 1);
  const from = s.subtasks.find((c) => c.id === child)!.taskId;
  const complete = command(
    "completion",
    from,
    { action: "complete", openIds: [child] },
    s.tasks.find((t) => t.id === from)!.version,
  );
  await mutate(db, user, complete);
  s = await snap();
  await run(
    "task",
    target,
    { done: true },
    s.tasks.find((t) => t.id === target)!.version,
  );
  await mutate(db, user, await move(from, target));
  s = await snap();
  assert.equal(
    s.tasks.find((t) => t.id === target)!.done,
    true,
    "done step leaves completed target completed",
  );
  assert.equal(
    s.tasks.find((t) => t.id === from)!.done,
    true,
    "source status remains unchanged",
  );
  // A move out and back invalidates old undo even if done never changed.
  await mutate(db, user, await move(target, from));
  s = await snap();
  await assert.rejects(
    run(
      "completion",
      from,
      { action: "undo", key: complete.key },
      s.tasks.find((t) => t.id === from)!.version,
    ),
    { status: 409 },
  );
  assert.equal((await snap()).subtasks.find((c) => c.id === child)!.done, true);
  const foreignTarget = randomUUID();
  const foreignList = (await snapshot(db, other, 0, device)).lists[0].id;
  await mutate(
    db,
    other,
    command("task", foreignTarget, { title: "Private", listId: foreignList }),
  );
  await assert.rejects(
    mutate(
      db,
      user,
      command(
        "subtaskMove",
        child,
        { sourceId: from, targetId: foreignTarget, targetVersion: 1 },
        s.subtasks.find((c) => c.id === child)!.version,
      ),
    ),
    { status: 403 },
  );
  const vanished = randomUUID();
  await run("task", vanished, { title: "Vanished", listId: list });
  const vanishedMove = await move(from, vanished);
  await db.query("DELETE FROM tasks WHERE id=$1", [vanished]);
  await assert.rejects(mutate(db, user, vanishedMove), { status: 410 });
  // Sharing/revocation applies again before idempotent replay.
  const shared = randomUUID(),
    sharedA = randomUUID(),
    sharedB = randomUUID(),
    sharedChild = randomUUID();
  await run("list", shared, { name: "Shared moves", members: [other] });
  for (const id of [sharedA, sharedB])
    await run("task", id, { title: id, listId: shared });
  await run("subtask", sharedChild, { title: "Shared step", taskId: sharedA });
  const sharedMove = command(
    "subtaskMove",
    sharedChild,
    { sourceId: sharedA, targetId: sharedB, targetVersion: 1 },
    1,
  );
  await mutate(db, other, sharedMove);
  assert.equal(
    (await snapshot(db, other, 0, device)).subtasks.find(
      (c) => c.id === sharedChild,
    )!.taskId,
    sharedB,
  );
  await run("list", shared, { members: [] }, 1);
  await assert.rejects(mutate(db, other, sharedMove), { status: 403 });
  // Target version, trash, same-list and source trash are independently checked.
  const stale = await move(from, third);
  s = await snap();
  await run(
    "task",
    third,
    { title: "Changed" },
    s.tasks.find((t) => t.id === third)!.version,
  );
  await assert.rejects(mutate(db, user, stale), { status: 409 });
  s = await snap();
  await run(
    "task",
    third,
    { deleted: true },
    s.tasks.find((t) => t.id === third)!.version,
  );
  await assert.rejects(mutate(db, user, await move(from, third)), {
    status: 409,
  });
  const newList = randomUUID();
  await run("list", newList, { name: "Other list" });
  s = await snap();
  await run(
    "task",
    target,
    { listId: newList },
    s.tasks.find((t) => t.id === target)!.version,
  );
  await assert.rejects(mutate(db, user, await move(from, target)), {
    status: 409,
  });
  s = await snap();
  await run(
    "task",
    from,
    { deleted: true },
    s.tasks.find((t) => t.id === from)!.version,
  );
  await assert.rejects(mutate(db, user, await move(from, third)), {
    status: 409,
  });
  return { user, child, parent: from, device };
}
