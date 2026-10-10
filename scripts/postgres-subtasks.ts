/** Run only inside the disposable CI Compose installation. Creates and drops its own databases. */
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { mutate, snapshot } from "../src/server/domain";
import { backup, restore } from "../src/server/backup";
if (process.env.NOTERA_CI_POSTGRES_CHECK !== "1" || !process.env.DATABASE_URL)
  throw new Error("Nur für explizit freigegebene CI-Testdatenbanken.");
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const names = [
  "notera_test_" + randomUUID().replaceAll("-", ""),
  "notera_test_" + randomUUID().replaceAll("-", ""),
];
const opened: Database[] = [];
const created: string[] = [];
try {
  for (const name of names) {
    await admin.query(`CREATE DATABASE ${name}`);
    created.push(name);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = "/" + name;
    opened.push(new Database(url.toString()));
  }
  const [source, target] = opened;
  const initial = await readFile(
    new URL("../migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  await source.query(initial);
  const user = await createUser(
    source,
    "ci",
    "CI",
    "isolated-postgres-test-password",
  );
  const listId = (await source.query("SELECT id FROM lists")).rows[0].id;
  const id = randomUUID(),
    child = randomUUID(),
    device = randomUUID();
  await mutate(source, user, {
    key: randomUUID(),
    device,
    entity: "task",
    id,
    version: 0,
    patch: { title: "Existing before upgrade", listId },
  });
  const old = (await source.query("SELECT * FROM tasks")).rows;
  await source.migrate();
  await source.migrate();
  assert.deepEqual((await source.query("SELECT * FROM tasks")).rows, old);
  await mutate(source, user, {
    key: randomUUID(),
    device,
    entity: "subtask",
    id: child,
    version: 0,
    patch: { title: "PostgreSQL step", taskId: id },
  });
  const key = randomUUID();
  await mutate(source, user, {
    key,
    device,
    entity: "completion",
    id,
    version: 1,
    patch: { action: "complete", openIds: [child] },
  });
  assert.equal(
    (await snapshot(source, user, 0, device)).subtasks[0].done,
    true,
  );
  await mutate(source, user, {
    key: randomUUID(),
    device,
    entity: "completion",
    id,
    version: 2,
    patch: { action: "undo", key },
  });
  const saved = await backup(source);
  await target.migrate();
  await restore(target, saved);
  assert.deepEqual(
    (await snapshot(target, user, 0, device)).subtasks,
    (await snapshot(source, user, 0, device)).subtasks,
  );
  assert.equal((await snapshot(target, user, 0, device)).tasks[0].done, false);
  console.log(
    "PostgreSQL: legacy upgrade, completion/undo and backup/restore passed in isolated databases.",
  );
} finally {
  for (const db of opened) await db.close();
  for (const name of created) await admin.query(`DROP DATABASE ${name}`);
  await admin.end();
}
