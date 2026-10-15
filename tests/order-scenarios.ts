import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { mutate, snapshot } from "../src/server/domain";
import { ordered } from "../src/shared/order";
import type { Mutation } from "../src/shared/model";
/** The same domain scenario runs against PGlite and disposable PostgreSQL in CI. */
export async function orderScenarios(db: Database, peer: Database = db) {
  const a = await createUser(db, "order-a", "A", "isolated-order-password");
  const b = await createUser(db, "order-b", "B", "isolated-order-password");
  const outsider = await createUser(
    db,
    "order-c",
    "C",
    "isolated-order-password",
  );
  const device = randomUUID(),
    list = randomUUID();
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
    user = a,
  ) =>
    mutate(user === a ? db : peer, user, command(entity, id, patch, version));
  const snap = (user = a) => snapshot(db, user, 0, device);
  await run("list", list, { name: "Order", members: [b] });
  const ids = Array.from({ length: 5 }, () => randomUUID());
  for (const [index, id] of ids.entries())
    await run("task", id, { title: `Task ${index}`, listId: list });
  const sequence = async () =>
    ordered((await snap()).tasks.filter((t) => t.listId === list)).map(
      (t) => t.id,
    );
  assert.deepEqual(await sequence(), ids);
  const move = async (
    id: string,
    anchorId: string,
    side: "before" | "after",
    kind: "task" | "subtask" = "task",
  ) => {
    const s = await snap();
    const rows = kind === "task" ? s.tasks : s.subtasks;
    const row = rows.find((t) => t.id === id)!,
      anchor = rows.find((t) => t.id === anchorId)!;
    return command(
      "order",
      id,
      {
        kind,
        scopeId: kind === "task" ? list : ids[0],
        anchorId,
        anchorVersion: anchor.orderVersion,
        side,
        ...(kind === "task" ? { done: row.done } : {}),
      },
      row.orderVersion,
    );
  };
  // Beginning, middle, end; a member may reorder. Replays do not apply twice.
  const first = await move(ids[4], ids[0], "before");
  await mutate(db, b, first);
  await mutate(db, b, first);
  assert.deepEqual(await sequence(), [ids[4], ...ids.slice(0, 4)]);
  await mutate(db, a, await move(ids[4], ids[2], "after"));
  assert.deepEqual(await sequence(), [ids[0], ids[1], ids[2], ids[4], ids[3]]);
  await mutate(db, a, await move(ids[4], ids[3], "after"));
  assert.deepEqual(await sequence(), ids);
  await assert.rejects(
    mutate(db, outsider, await move(ids[4], ids[0], "before")),
    { status: 403 },
  );
  const foreign = (await snap(outsider)).lists.find((l) => l.inbox)!.id,
    foreignTask = randomUUID();
  await run(
    "task",
    foreignTask,
    { title: "Private", listId: foreign },
    0,
    outsider,
  );
  const foreignMove = await move(ids[4], ids[0], "before");
  foreignMove.patch.anchorId = foreignTask;
  await assert.rejects(mutate(db, a, foreignMove), { status: 409 });
  foreignMove.key = randomUUID();
  foreignMove.patch.scopeId = foreign;
  await assert.rejects(mutate(db, a, foreignMove), { status: 409 });
  const staleAnchor = await move(ids[4], ids[0], "before");
  await mutate(db, b, await move(ids[0], ids[1], "after"));
  await assert.rejects(mutate(db, a, staleAnchor), { status: 409 });
  await mutate(db, b, await move(ids[0], ids[1], "before"));
  const malformed = await move(ids[4], ids[0], "before");
  malformed.patch.title = "Must not edit";
  await assert.rejects(mutate(db, a, malformed));
  // A hidden completed task is retained. Completing/reopening changes no position.
  await run("task", ids[1], { done: true }, 1);
  const hiddenPosition = (await snap()).tasks.find(
    (t) => t.id === ids[1],
  )!.position;
  await mutate(db, a, await move(ids[2], ids[0], "before"));
  assert.deepEqual(await sequence(), [ids[2], ids[0], ids[1], ids[3], ids[4]]);
  const doneBefore = (await snap()).tasks.find((t) => t.id === ids[1])!;
  await run("task", ids[1], { done: false }, doneBefore.version);
  assert.equal(
    (await snap()).tasks.find((t) => t.id === ids[1])!.position,
    doneBefore.position,
  );
  assert.ok(hiddenPosition);
  // Concurrent field editing merges independently; conflicting moves are rejected.
  const left = await move(ids[4], ids[0], "before"),
    right = await move(ids[4], ids[3], "before");
  await Promise.all([
    mutate(db, a, left),
    run("task", ids[4], { notes: "Other member's text" }, 1, b),
  ]);
  await assert.rejects(mutate(db, b, right), { status: 409 });
  assert.equal(
    (await snap()).tasks.find((t) => t.id === ids[4])!.notes,
    "Other member's text",
  );
  // Unrelated simultaneous additions and deletions cannot get lost through a full-array overwrite.
  const extra = randomUUID(),
    pending = await move(ids[3], ids[0], "before");
  await Promise.all([
    mutate(db, a, pending),
    run("task", extra, { title: "Concurrent addition", listId: list }, 0, b),
    run("task", ids[2], { deleted: true }, 1, b),
  ]);
  assert.equal((await sequence()).at(-1), extra);
  assert.equal(
    (await snap()).tasks.find((t) => t.id === ids[2])!.deleted,
    true,
  );
  const deletedAnchor = await move(ids[3], ids[0], "before");
  await run("task", ids[0], { deleted: true }, 1);
  await assert.rejects(mutate(db, b, deletedAnchor), { status: 409 });
  const savedPosition = (await snap()).tasks.find(
    (t) => t.id === ids[0],
  )!.position;
  await run("task", ids[0], { deleted: false }, 2);
  assert.equal(
    (await snap()).tasks.find((t) => t.id === ids[0])!.position,
    savedPosition,
  );
  const statusRace = await move(ids[3], ids[0], "before");
  await run("task", ids[0], { done: true }, 3);
  await assert.rejects(mutate(db, a, statusRace), { status: 409 });
  await run("task", ids[0], { done: false }, 4);
  // Child order includes completed children and cannot cross parents.
  const children = Array.from({ length: 3 }, () => randomUUID());
  for (const id of children)
    await run("subtask", id, { title: "Child", taskId: ids[0] });
  await run("subtask", children[1], { done: true }, 1);
  await mutate(
    db,
    b,
    await move(children[2], children[0], "before", "subtask"),
  );
  const childSequence = () =>
    snap().then((s) =>
      ordered(s.subtasks.filter((c) => c.taskId === ids[0])).map((c) => c.id),
    );
  assert.deepEqual(await childSequence(), [
    children[2],
    children[0],
    children[1],
  ]);
  await run("subtask", children[1], { done: false }, 2);
  assert.deepEqual(await childSequence(), [
    children[2],
    children[0],
    children[1],
  ]);
  const foreignChild = randomUUID();
  await run("subtask", foreignChild, { title: "Other parent", taskId: ids[4] });
  const badChild = await move(children[1], children[0], "before", "subtask");
  badChild.patch.anchorId = foreignChild;
  await assert.rejects(mutate(db, a, badChild), { status: 409 });
  const removed = await move(children[1], children[0], "before", "subtask");
  await run("subtask", children[0], { deleted: true }, 1);
  await assert.rejects(mutate(db, a, removed), { status: 409 });
  // Existing list transfer appends and preserves child order. A moved anchor conflicts.
  const dest = randomUUID();
  await run("list", dest, { name: "Destination", members: [b] });
  const destinationTask = randomUUID();
  await run("task", destinationTask, { title: "Destination", listId: dest });
  const anchorMoved = await move(ids[3], ids[0], "before");
  const beforeTransfer = await childSequence();
  await run(
    "task",
    ids[0],
    { listId: dest },
    (await snap()).tasks.find((t) => t.id === ids[0])!.version,
  );
  assert.deepEqual(
    ordered((await snap()).tasks.filter((t) => t.listId === dest)).map(
      (t) => t.id,
    ),
    [destinationTask, ids[0]],
  );
  assert.deepEqual(await childSequence(), beforeTransfer);
  await assert.rejects(mutate(db, b, anchorMoved), { status: 409 });
  // Permission is checked even when replaying an already committed operation.
  await run("list", list, { members: [] }, 1);
  await assert.rejects(mutate(db, b, first), { status: 403 });
  return { user: a, device };
}
