import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { mutate, snapshot, maintain } from "../src/server/domain";
import type { Mutation } from "../src/shared/model";

export async function conversionScenarios(db: Database, peer = db) {
  const user = await createUser(
    db,
    `convert-${randomUUID().slice(0, 8)}`,
    "Convert",
    "isolated-conversion-password",
  );
  const other = await createUser(
    db,
    `peer-${randomUUID().slice(0, 8)}`,
    "Peer",
    "isolated-conversion-password",
  );
  const device = randomUUID();
  const command = (
    entity: Mutation["entity"],
    id: string,
    patch: Record<string, unknown>,
    version = 0,
  ): Mutation => ({ entity, id, patch, version, key: randomUUID(), device });
  const run = (
    entity: Mutation["entity"],
    id: string,
    patch: Record<string, unknown>,
    version = 0,
  ) => mutate(db, user, command(entity, id, patch, version));
  const snap = () => snapshot(db, user, 0, device);
  const list = randomUUID();
  await run("list", list, { name: "Shared conversion", members: [other] });
  const create = async (patch = {}) => {
    const id = randomUUID();
    await run("task", id, { title: "Preserved title", listId: list, ...patch });
    return id;
  };
  const target = await create({ done: true });
  const anchor = randomUUID();
  await run("subtask", anchor, {
    taskId: target,
    title: "Existing",
    done: true,
  });
  // Existing subtask creation reopens even with done=true: explicitly complete target.
  await run(
    "task",
    target,
    { done: true },
    (await snap()).tasks.find((t) => t.id === target)!.version,
  );
  const source = await create();
  const convert = async (id: string, to = target) => {
    const s = await snap();
    return command(
      "taskConvert",
      id,
      {
        targetId: to,
        targetVersion: s.tasks.find((t) => t.id === to)!.version,
      },
      s.tasks.find((t) => t.id === id)!.version,
    );
  };
  const first = await convert(source);
  const result = await mutate(db, user, first);
  assert.deepEqual(
    await mutate(db, user, first),
    result,
    "response loss replays receipt",
  );
  let s = await snap();
  assert.ok(!s.tasks.some((t) => t.id === source));
  assert.equal(s.subtasks.filter((t) => t.id === source).length, 1);
  const step = s.subtasks.find((t) => t.id === source)!;
  assert.equal(step.taskId, target);
  assert.equal(step.title, "Preserved title");
  assert.equal(step.done, false);
  assert.ok(step.position > s.subtasks.find((t) => t.id === anchor)!.position);
  assert.equal(s.tasks.find((t) => t.id === target)!.done, false);
  assert.ok(s.conversionReceipts.includes(first.key));
  assert.ok(s.convertedTasks.some((t) => t.id === source));
  assert.deepEqual(
    (await db.query("SELECT data FROM tasks WHERE id=$1", [source])).rows[0]
      .data,
    {},
    "structural marker is not an archive",
  );
  const shared = await snapshot(peer, other, 0, randomUUID());
  assert.deepEqual(
    shared.subtasks.find((t) => t.id === source),
    step,
  );
  // All stale task entities, including version-zero recreation and explicit restore.
  for (const [entity, patch, version] of [
    ["task", { title: "stale edit" }, 1],
    ["task", { deleted: false }, 1],
    ["task", { title: "recreate", listId: list }, 0],
    ["completion", { action: "complete", openIds: [] }, 1],
    ["completion", { action: "reopen" }, 1],
    ["completion", { action: "undo", key: first.key }, 1],
    ["preference", { starred: true }, 0],
    [
      "order",
      {
        kind: "task",
        scopeId: list,
        anchorId: target,
        anchorVersion: 0,
        side: "before",
        done: false,
      },
      0,
    ],
  ] as const)
    await assert.rejects(run(entity, source, patch, version), { status: 409 });
  await assert.rejects(mutate(db, user, { ...first, key: randomUUID() }), {
    status: 409,
  });
  // An old subtask mutation cannot act on the newly occupied identity either.
  await assert.rejects(
    run("subtask", source, { title: "old", taskId: target }, 0),
    { status: 409 },
  );
  const doneTarget = await create({ done: true });
  const doneSource = await create({ done: true });
  const completionCommand = command(
    "completion",
    doneSource,
    { action: "complete", openIds: [] },
    1,
  );
  const completion = await mutate(db, user, completionCommand);
  const doneCommand = await convert(doneSource, doneTarget);
  const completionTime = (await snap()).tasks.find(
    (t) => t.id === doneSource,
  )!.completedAt;
  await mutate(db, user, doneCommand);
  s = await snap();
  assert.equal(s.subtasks.find((t) => t.id === doneSource)!.done, true);
  assert.equal(
    s.subtasks.find((t) => t.id === doneSource)!.completedAt,
    completionTime,
  );
  assert.equal(s.subtasks.find((t) => t.id === doneSource)!.createdBy, user);
  assert.equal(s.tasks.find((t) => t.id === doneTarget)!.done, true);
  assert.ok(completion.before);
  await assert.rejects(
    run(
      "completion",
      doneSource,
      { action: "undo", key: completionCommand.key },
      doneCommand.version,
    ),
    { status: 409 },
  );
  // Receipts stay intact; they do not enable undo against the old main task.
  assert.ok(
    (
      await db.query(
        "SELECT result FROM mutations WHERE user_id=$1 AND result->>'taskId'=$2",
        [user, doneSource],
      )
    ).rows.length,
  );
  const withChild = await create();
  const child = randomUUID();
  await run("subtask", child, { taskId: withChild, title: "Keep history" });
  await assert.rejects(
    mutate(db, user, await convert(withChild)),
    /eigene Unteraufgaben/,
  );
  await run("subtask", child, { deleted: true, taskId: withChild }, 1);
  await assert.rejects(
    mutate(db, user, await convert(withChild)),
    /entfernte Unteraufgaben/,
  );
  for (const [patch, label] of [
    [{ notes: " " }, "Notizen"],
    [{ links: ["https://example.com"] }, "Links"],
    [{ due: { kind: "date", date: "2026-11-16" } }, "Termin"],
    [{ assignee: other }, "Zuweisung"],
  ] as const) {
    const id = await create(patch);
    await assert.rejects(
      mutate(db, user, await convert(id)),
      new RegExp(label),
    );
    assert.ok((await snap()).tasks.some((t) => t.id === id));
  }
  const privateData = await create();
  await mutate(
    db,
    other,
    command("preference", privateData, { starred: true }),
  );
  await assert.rejects(
    mutate(db, user, await convert(privateData)),
    /persönliche Auswahl/,
  );
  await mutate(
    db,
    other,
    command("preference", privateData, { starred: false }, 1),
  );
  await db.query(
    "INSERT INTO reminders(id,user_id,task_id,remind_at) VALUES($1,$2,$3,now())",
    [randomUUID(), other, privateData],
  );
  await assert.rejects(
    mutate(db, user, await convert(privateData)),
    /Erinnerungen/,
  );
  const staleSource = await create();
  const staleCommand = await convert(staleSource);
  await run("task", staleSource, { notes: "Concurrent content" }, 1);
  await assert.rejects(mutate(db, user, staleCommand), { status: 409 });
  const staleTarget = await create();
  const targetCommand = await convert(staleTarget);
  await run(
    "task",
    target,
    { title: "Target changed" },
    (await snap()).tasks.find((t) => t.id === target)!.version,
  );
  await assert.rejects(mutate(db, user, targetCommand), { status: 409 });
  const otherList = (await snapshot(db, other, 0, device)).lists.find(
    (l) => l.inbox,
  )!.id;
  const crossTarget = randomUUID();
  await mutate(
    db,
    other,
    command("task", crossTarget, { title: "Other list", listId: otherList }),
  );
  await assert.rejects(
    run(
      "taskConvert",
      staleTarget,
      { targetId: crossTarget, targetVersion: 1 },
      1,
    ),
    { status: 403 },
  );
  const ownInbox = (await snap()).lists.find((l) => l.inbox)!.id;
  const sameAccessOtherList = randomUUID();
  await run("task", sameAccessOtherList, {
    title: "Other own list",
    listId: ownInbox,
  });
  await assert.rejects(
    run(
      "taskConvert",
      staleTarget,
      { targetId: sameAccessOtherList, targetVersion: 1 },
      1,
    ),
    { status: 409 },
  );
  await assert.rejects(
    run(
      "taskConvert",
      staleTarget,
      { targetId: staleTarget, targetVersion: 1 },
      1,
    ),
    { status: 409 },
  );
  const raced = await create();
  const race = await convert(raced);
  const results = await Promise.allSettled([
    mutate(db, user, race),
    mutate(peer, other, { ...race, key: randomUUID() }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await snap()).subtasks.filter((c) => c.id === raced).length, 1);
  // Revocation is checked before receipt replay, including successful lost-response conversion.
  await run("list", list, { members: [user] }, 1);
  await assert.rejects(mutate(peer, other, { ...first, key: randomUUID() }), {
    status: 403,
  });
  await run("list", list, { members: [user, other] }, 2);
  const otherSource = await create();
  const otherCommand = await convert(otherSource);
  await mutate(peer, other, otherCommand);
  await run("list", list, { members: [user] }, 3);
  await assert.rejects(mutate(peer, other, otherCommand), { status: 403 });
  assert.ok(
    !(await snapshot(peer, other, 0, device)).convertedTasks.some(
      (t) => t.id === otherSource,
    ),
  );
  await db.query(
    "UPDATE tasks SET deleted_at=now()-interval '60 days' WHERE id=$1",
    [source],
  );
  await maintain(db);
  assert.ok(
    (await snap()).convertedTasks.some((t) => t.id === source),
    "maintenance retains permanent anti-resurrection marker",
  );
  return { user, device, source, target };
}
