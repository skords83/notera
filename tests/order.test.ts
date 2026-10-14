import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Database } from "../src/server/db";
import { backup, restore } from "../src/server/backup";
import { snapshot } from "../src/server/domain";
import { createUser } from "../src/server/auth";
import { orderScenarios } from "./order-scenarios";

test("manual order: permissions, status, concurrency, stable IDs and replay", async () => {
  const dir = await mkdtemp("/tmp/notera-order-");
  process.env.DATA_DIR = dir + "/source";
  const db = new Database();
  let target: Database | undefined;
  try {
    await db.migrate();
    const { user, device } = await orderScenarios(db);
    const saved = await backup(db);
    assert.equal(saved.format, "notera-3");
    process.env.DATA_DIR = dir + "/restore";
    target = new Database();
    await target.migrate();
    await restore(target, saved);
    const source = await snapshot(db, user, 0, device),
      restored = await snapshot(target, user, 0, device);
    assert.deepEqual(restored.tasks, source.tasks);
    assert.deepEqual(restored.subtasks, source.subtasks);
    assert.deepEqual(restored.orderReceipts, source.orderReceipts);
  } finally {
    await target?.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("schema 004 deterministically migrates legacy data and legacy backups", async () => {
  const dir = await mkdtemp("/tmp/notera-order-upgrade-");
  process.env.DATA_DIR = dir + "/source";
  const db = new Database();
  let target: Database | undefined;
  try {
    for (const file of [
      "001_initial.sql",
      "002_list_colors.sql",
      "003_subtasks.sql",
    ]) {
      const sql = await readFile(
        new URL("../migrations/" + file, import.meta.url),
        "utf8",
      );
      for (const statement of sql
        .replace(/--[^\n]*/g, "")
        .split(";")
        .filter((s) => s.trim()))
        await db.query(statement);
    }
    const user = await createUser(
        db,
        "legacy",
        "Legacy",
        "legacy-order-password",
      ),
      list = (await db.query("SELECT id FROM lists")).rows[0].id;
    const ids = [
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000001",
    ];
    for (const id of ids) {
      await db.query(
        "INSERT INTO tasks(id,list_id,data,version,field_versions,created_by,updated_at) VALUES($1,$2,$3,1,'{}',$4,'2026-01-01')",
        [
          id,
          list,
          JSON.stringify({ title: id, done: false, deleted: false }),
          user,
        ],
      );
      await db.query(
        "INSERT INTO subtasks(id,task_id,data,version,field_versions,created_at) VALUES($1,$2,$3,1,'{}','2026-01-01')",
        [
          id,
          ids[0],
          JSON.stringify({ title: id, done: false, deleted: false }),
        ],
      );
    }
    const legacy = await backup(db);
    legacy.format = "notera-2";
    await db.migrate();
    await db.migrate();
    assert.deepEqual(
      (await db.query("SELECT id FROM tasks ORDER BY position")).rows.map(
        (r) => r.id,
      ),
      [...ids].sort(),
    );
    assert.deepEqual(
      (await db.query("SELECT id FROM subtasks ORDER BY position")).rows.map(
        (r) => r.id,
      ),
      [...ids].sort(),
    );
    process.env.DATA_DIR = dir + "/restore";
    target = new Database();
    await target.migrate();
    await restore(target, legacy);
    assert.deepEqual(
      (await target.query("SELECT id,position FROM tasks ORDER BY position"))
        .rows,
      (await db.query("SELECT id,position FROM tasks ORDER BY position")).rows,
    );
    assert.deepEqual(
      (await target.query("SELECT id,position FROM subtasks ORDER BY position"))
        .rows,
      (await db.query("SELECT id,position FROM subtasks ORDER BY position"))
        .rows,
    );
  } finally {
    await target?.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
