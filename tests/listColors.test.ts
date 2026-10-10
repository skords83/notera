import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { backup, restore } from "../src/server/backup";
import {
  listColorStyle,
  normalizeListColor,
  listColors,
} from "../src/shared/listColors";

test("legacy and unknown colors retain safe theme-aware presentation", () => {
  for (const value of [undefined, null, "unknown", "__proto__"]) {
    assert.equal(normalizeListColor(value), "auto");
    assert.equal(listColorStyle(value)["--list-dark"], "var(--purple)");
    assert.equal(listColorStyle(value, true)["--list-light"], "var(--green)");
  }
  for (const color of listColors)
    assert.equal(normalizeListColor(color.id), color.id);
});

test("migration upgrades existing lists and restores old/new backups including colors", async () => {
  const dir = await mkdtemp("/tmp/notera-colors-");
  process.env.DATA_DIR = dir + "/source";
  const db = new Database();
  let target: Database | undefined;
  try {
    const initial = await readFile(
      new URL("../migrations/001_initial.sql", import.meta.url),
      "utf8",
    );
    for (const sql of initial
      .replace(/--[^\n]*/g, "")
      .split(";")
      .filter((s) => s.trim()))
      await db.query(sql);
    await createUser(db, "old", "Alt", "test-password-old-123");
    const old = await backup(db);
    await db.migrate();
    assert.equal(
      (await db.query("SELECT color FROM lists")).rows[0].color,
      "auto",
    );
    process.env.DATA_DIR = dir + "/old-restore";
    target = new Database();
    await target.migrate();
    await restore(target, old);
    assert.equal(
      (await target.query("SELECT color FROM lists")).rows[0].color,
      "auto",
    );
    await target.close();
    target = undefined;
    await db.query("UPDATE lists SET color='terracotta'");
    const current = await backup(db);
    process.env.DATA_DIR = dir + "/new-restore";
    target = new Database();
    await target.migrate();
    await restore(target, current);
    assert.equal(
      (await target.query("SELECT color FROM lists")).rows[0].color,
      "terracotta",
    );
    await assert.rejects(target.query("UPDATE lists SET color='invalid'"));
  } finally {
    await target?.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
