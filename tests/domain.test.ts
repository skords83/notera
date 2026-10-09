import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { mutate, snapshot, maintain } from "../src/server/domain";
import { backup, restore } from "../src/server/backup";
import { makeApp } from "../src/server/app";
import {
  dueSchema,
  dueDay,
  todaySection,
  type Task,
} from "../src/shared/model";
let db: Database;
let dir: string;
let a: string, b: string, inbox: string, otherInbox: string;
const device = randomUUID();
const mutation = (
  entity: "task" | "list" | "preference",
  id: string,
  patch: Record<string, unknown>,
  version = 0,
) => ({ key: randomUUID(), device, entity, id, patch, version });
async function snap(user = a, cursor = 0) {
  return snapshot(db, user, cursor, device);
}
before(async () => {
  dir = await mkdtemp(tmpdir() + "/notera-test-");
  process.env.DATA_DIR = dir + "/db";
  db = new Database();
  await db.migrate();
  a = await createUser(db, "sven", "Sven", "test-only-password-123");
  b = await createUser(db, "sandra", "Sandra", "test-only-password-456");
  inbox = (await snap()).lists[0].id;
  otherInbox = (await snap(b)).lists[0].id;
});
after(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});
test("privacy, sharing, assignment and revocation apply at mutation and sync boundaries", async () => {
  const privateId = randomUUID();
  await mutate(
    db,
    a,
    mutation("task", privateId, {
      title: "  Privater Gedanke  ",
      listId: inbox,
    }),
  );
  assert.equal(
    (await snap()).tasks.find((t) => t.id === privateId)?.title,
    "Privater Gedanke",
  );
  assert.equal((await snap(b)).tasks.length, 0);
  await assert.rejects(
    mutate(db, b, mutation("task", privateId, { notes: "attack" }, 1)),
    { status: 403 },
  );
  await assert.rejects(
    mutate(
      db,
      b,
      mutation("task", randomUUID(), { title: "attack", listId: inbox }),
    ),
    { status: 403 },
  );
  await assert.rejects(
    mutate(db, a, mutation("list", inbox, { members: [a, b] }, 1)),
    { status: 400 },
  );
  const list = randomUUID();
  await mutate(
    db,
    a,
    mutation("list", list, { name: "Gemeinsam", members: [a, b] }),
  );
  const id = randomUUID();
  const create = mutation("task", id, {
    title: "Gemeinsame Aufgabe",
    listId: list,
    assignee: b,
  });
  await mutate(db, a, create);
  assert.equal((await snap(b)).tasks.length, 1);
  await mutate(db, b, mutation("task", id, { done: true }, 1));
  assert.equal((await snap()).tasks.find((t) => t.id === id)?.done, true);
  await assert.rejects(
    mutate(db, b, mutation("list", list, { members: [b] }, 1)),
    { status: 403 },
  );
  await assert.rejects(
    mutate(db, b, mutation("task", id, { listId: inbox }, 2)),
    { status: 403 },
  );
  await mutate(db, a, mutation("list", list, { members: [a] }, 1));
  assert.equal((await snap(b)).tasks.length, 0);
  assert.equal((await snap()).tasks.find((t) => t.id === id)?.assignee, null);
  await assert.rejects(
    mutate(db, b, mutation("task", id, { notes: "revoked" }, 2)),
    { status: 403 },
  );
  await assert.rejects(
    mutate(db, a, mutation("task", id, { assignee: b }, 3)),
    { status: 400 },
  );
});
test("idempotency and field merging do not duplicate or silently overwrite", async () => {
  const id = randomUUID();
  const create = mutation("task", id, { title: "Start", listId: inbox });
  const first = await mutate(db, a, create);
  assert.deepEqual(await mutate(db, a, create), first);
  assert.equal((await snap()).tasks.filter((t) => t.id === id).length, 1);
  await assert.rejects(
    mutate(db, a, {
      ...create,
      patch: { ...create.patch, title: "altered key" },
    }),
    { status: 409 },
  );
  await Promise.all([
    mutate(db, a, mutation("task", id, { title: "Neuer Titel" }, 1)),
    mutate(
      db,
      a,
      mutation("task", id, { notes: "Notiz vom anderen Gerät" }, 1),
    ),
  ]);
  const current = (await snap()).tasks.find((t) => t.id === id)!;
  assert.equal(current.title, "Neuer Titel");
  assert.equal(current.notes, "Notiz vom anderen Gerät");
  await assert.rejects(
    mutate(db, a, mutation("task", id, { title: "Konkurrierend" }, 1)),
    { status: 409 },
  );
  await mutate(db, a, mutation("task", id, { deleted: true }, current.version));
  await assert.rejects(
    mutate(
      db,
      a,
      mutation("task", id, { notes: "Offline-Änderung" }, current.version),
    ),
    { status: 409 },
  );
  assert.equal((await snap()).tasks.find((t) => t.id === id)?.deleted, true);
  await mutate(
    db,
    a,
    mutation("task", id, { deleted: false }, current.version + 1),
  );
  assert.equal((await snap()).tasks.find((t) => t.id === id)?.deleted, false);
});
test("personal today selection and flags never alter the other member", async () => {
  const list = randomUUID(),
    id = randomUUID();
  await mutate(
    db,
    a,
    mutation("list", list, { name: "Planung", members: [b] }),
  );
  await mutate(
    db,
    a,
    mutation("task", id, {
      title: "Termin",
      listId: list,
      due: { kind: "date", date: "2026-10-09" },
    }),
  );
  await mutate(
    db,
    a,
    mutation("preference", id, { today: "2026-10-09", starred: true }),
  );
  assert.equal((await snap()).preferences[id].today, "2026-10-09");
  assert.equal((await snap(b)).preferences[id], undefined);
  const t = (await snap()).tasks.find((t) => t.id === id)!;
  assert.equal(
    todaySection(
      t,
      (await snap()).preferences[id],
      "2026-10-09",
      "Europe/Berlin",
    ),
    "Heute",
  );
});
test("validation rejects empty titles, invalid assignment, dangerous URLs and ambiguous times", async () => {
  for (const title of ["   ", "x".repeat(241)])
    await assert.rejects(
      mutate(db, a, mutation("task", randomUUID(), { title, listId: inbox })),
    );
  await assert.rejects(
    mutate(
      db,
      a,
      mutation("task", randomUUID(), {
        title: "X",
        listId: inbox,
        assignee: b,
      }),
    ),
    { status: 400 },
  );
  await assert.rejects(
    mutate(
      db,
      a,
      mutation("task", randomUUID(), {
        title: "X",
        listId: inbox,
        links: ["javascript:alert(1)"],
      }),
    ),
  );
  assert.equal(
    dueSchema.safeParse({ kind: "date", date: "2026-02-30" }).success,
    false,
  );
  for (const local of ["2026-03-29T02:30", "2026-10-25T02:30"])
    assert.equal(
      dueSchema.safeParse({ kind: "time", local, timezone: "Europe/Berlin" })
        .success,
      false,
    );
  for (const zone of [
    "Europe/Berlin",
    "Pacific/Honolulu",
    "Pacific/Kiritimati",
  ])
    assert.equal(
      dueDay({ kind: "date", date: "2026-03-29" }, zone),
      "2026-03-29",
    );
});
test("move is a structural conflict and validates both source and target", async () => {
  const id = randomUUID(),
    list = randomUUID();
  await mutate(db, a, mutation("list", list, { name: "Ziel" }));
  await mutate(db, a, mutation("task", id, { title: "X", listId: inbox }));
  await mutate(db, a, mutation("task", id, { notes: "new" }, 1));
  await assert.rejects(
    mutate(db, a, mutation("task", id, { listId: list }, 1)),
    { status: 409 },
  );
  await mutate(db, a, mutation("task", id, { listId: list }, 2));
  await assert.rejects(
    mutate(db, a, mutation("task", id, { notes: "offline" }, 2)),
    { status: 409 },
  );
  await assert.rejects(
    mutate(db, a, mutation("task", id, { listId: otherInbox }, 3)),
    { status: 403 },
  );
});
test("trash retention preserves independent tombstones and expires old cursors", async () => {
  const id = randomUUID();
  await mutate(db, a, mutation("task", id, { title: "Alt", listId: inbox }));
  await mutate(db, a, mutation("task", id, { deleted: true }, 1));
  await db.query(
    "UPDATE tasks SET deleted_at=now()-interval '31 days' WHERE id=$1",
    [id],
  );
  await maintain(db);
  assert.equal(
    (await snap()).tasks.find((t) => t.id === id),
    undefined,
  );
  assert.equal(
    (
      await db.query(
        "SELECT entity FROM changes WHERE entity_id=$1 ORDER BY cursor DESC",
        [id],
      )
    ).rows[0].entity,
    "tombstone",
  );
  await assert.rejects(
    mutate(db, a, mutation("task", id, { notes: "stale" }, 2)),
    { status: 410 },
  );
  await db.query("UPDATE changes SET changed_at=now()-interval '91 days'");
  await maintain(db);
  assert.equal((await snap(a, 0)).reset, true);
});
test("backup restores into a fresh PostgreSQL engine and survives a database reopen", async () => {
  const archive = await backup(db);
  const before = await snap();
  await db.close();
  db = new Database();
  assert.equal((await snap()).tasks.length, before.tasks.length);
  process.env.DATA_DIR = dir + "/restored";
  const fresh = new Database();
  await fresh.migrate();
  await restore(fresh, archive);
  const restored = await snapshot(fresh, a, 0, device);
  assert.deepEqual(restored.tasks, before.tasks);
  assert.deepEqual(restored.lists, before.lists);
  await assert.rejects(restore(fresh, archive), /frischen/);
  await fresh.close();
  process.env.DATA_DIR = dir + "/db";
});
test("HTTP requires sessions, enforces CSRF origin, and protects login with rate limiting", async () => {
  const app = await makeApp(db, {
    origin: "https://notera.test",
    serve: false,
  });
  try {
    assert.equal(
      (await app.inject({ url: `/api/sync?cursor=0&device=${device}` }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: { username: "sven", password: "test-only-password-123" },
        })
      ).statusCode,
      403,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "https://notera.test" },
      payload: { username: "sven", password: "test-only-password-123" },
    });
    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers["set-cookie"]);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    const session = cookie.split(";")[0];
    assert.equal(
      (await app.inject({ url: "/api/me", headers: { cookie: session } }))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/mutations",
          headers: { origin: "https://evil.test", cookie: session },
          payload: mutation("task", randomUUID(), {
            title: "X",
            listId: inbox,
          }),
        })
      ).statusCode,
      403,
    );
    await app.inject({
      method: "POST",
      url: "/api/logout",
      headers: { origin: "https://notera.test", cookie: session },
      payload: {},
    });
    assert.equal(
      (await app.inject({ url: "/api/me", headers: { cookie: session } }))
        .statusCode,
      401,
    );
    for (let n = 0; n < 10; n++)
      await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin: "https://notera.test" },
        payload: { username: "none", password: "wrong" },
      });
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin: "https://notera.test" },
          payload: { username: "none", password: "wrong" },
        })
      ).statusCode,
      429,
    );
  } finally {
    await app.close();
  }
});
