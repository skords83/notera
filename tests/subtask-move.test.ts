import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { Database } from "../src/server/db";
import { backup, restore } from "../src/server/backup";
import { snapshot } from "../src/server/domain";
import { subtaskMoveScenarios } from "./subtask-move-scenarios";

test("atomic subtask moves, stale actions, concurrent moves and backup/restore", async () => {
  const dir = await mkdtemp("/tmp/notera-move-");
  process.env.DATA_DIR = dir + "/db";
  const db = new Database();
  let restored: Database | undefined;
  try {
    await db.migrate();
    const { user, child, parent, device } = await subtaskMoveScenarios(db);
    const path = await backup(db);
    process.env.DATA_DIR = dir + "/restored";
    restored = new Database();
    await restored.migrate();
    await restore(restored, path);
    const s = await snapshot(restored, user, 0, device);
    assert.equal(s.subtasks.find((c) => c.id === child)!.taskId, parent);
    assert.equal(s.subtasks.filter((c) => c.id === child).length, 1);
    assert.ok(s.moveReceipts!.length > 0);
  } finally {
    await db.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
