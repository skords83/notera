import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { Database } from "../src/server/db";
import { backup, restore } from "../src/server/backup";
import { snapshot } from "../src/server/domain";
import { conversionScenarios } from "./task-conversion-scenarios";

test("atomic identity-preserving task conversion, data protection, stale actions and backup", async () => {
  const dir = await mkdtemp("/tmp/notera-convert-");
  process.env.DATA_DIR = dir + "/db";
  const db = new Database();
  let restored: Database | undefined;
  try {
    await db.migrate();
    await db.migrate();
    const { user, device } = await conversionScenarios(db);
    const saved = await backup(db);
    assert.equal(saved.format, "notera-4");
    process.env.DATA_DIR = dir + "/restored";
    restored = new Database();
    await restored.migrate();
    await restore(restored, saved);
    const a = await snapshot(db, user, 0, device);
    const b = await snapshot(restored, user, 0, device);
    assert.deepEqual(
      b.convertedTasks.sort((a, b) => a.id.localeCompare(b.id)),
      a.convertedTasks.sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(b.subtasks, a.subtasks);
    assert.deepEqual(b.conversionReceipts.sort(), a.conversionReceipts.sort());
  } finally {
    await db.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
