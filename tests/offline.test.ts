import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { makeApp } from "../src/server/app";
import { mutate, snapshot } from "../src/server/domain";

test("persistent offline queue: reload, retries, session expiry, conflicts and access revocation", async () => {
  const dir = await mkdtemp(tmpdir() + "/notera-offline-");
  process.env.DATA_DIR = dir + "/db";
  const db = new Database();
  await db.migrate();
  const user = await createUser(db, "sven", "Sven", "test-password-offline");
  const other = await createUser(
    db,
    "sandra",
    "Sandra",
    "test-password-sandra",
  );
  const app = await makeApp(db, { origin: "http://notera.test", serve: false });
  let online = true;
  let cookie = "";
  let loseResponse = false;
  let rejectServer = false;
  Object.defineProperty(globalThis, "navigator", {
    value: {
      get onLine() {
        return online;
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    configurable: true,
  });
  Object.defineProperty(globalThis, "EventSource", {
    value: class {
      onmessage: any;
      onerror: any;
      close() {}
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: undefined,
    configurable: true,
  });
  const originalFetch = globalThis.fetch;
  const originalInterval = globalThis.setInterval;
  globalThis.setInterval = ((...args: any[]) => {
    const timer = (originalInterval as any)(...args);
    timer.unref();
    return timer;
  }) as any;
  globalThis.fetch = async (path: any, options: any = {}) => {
    if (!online) throw new TypeError("offline");
    if (rejectServer && path === "/api/mutations")
      return new Response(
        JSON.stringify({ error: "Test server unavailable" }),
        { status: 503 },
      );
    const response = await app.inject({
      method: options.method || "GET",
      url: path,
      headers: { ...options.headers, origin: "http://notera.test", cookie },
      payload: options.body,
    });
    const setCookie = response.headers["set-cookie"];
    if (setCookie) cookie = String(setCookie).split(";")[0];
    if (loseResponse && path === "/api/mutations") {
      loseResponse = false;
      throw new TypeError("response lost after commit");
    }
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const load = async (suffix: string) =>
      (await import(
        `../src/client/store.ts?${suffix}`
      )) as typeof import("../src/client/store");
    let store = await load("initial");
    await store.init();
    await store.login("sven", "test-password-offline");
    const inbox = store.projected().lists.find((l) => l.inbox)!.id;
    online = false;
    const id = randomUUID();
    await store.enqueue("task", id, {
      title: "Offline angelegt",
      listId: inbox,
    });
    await store.enqueue("task", id, { notes: "Offline ergänzt" });
    await store.enqueue("task", id, { done: true });
    assert.equal(store.getState().queue.length, 3);
    assert.equal(store.projected().tasks.find((t) => t.id === id)?.done, true);
    // Reload the client module; the only retained application state is IndexedDB.
    store = await load("reloaded");
    await store.init();
    assert.equal(store.getState().queue.length, 3);
    assert.equal(
      store.projected().tasks.find((t) => t.id === id)?.notes,
      "Offline ergänzt",
    );
    online = true;
    loseResponse = true;
    await store.sync();
    assert.equal(store.getState().queue.length, 3);
    await store.sync();
    assert.equal(store.getState().queue.length, 0);
    const server = (await snapshot(db, user, 0, randomUUID())).tasks.filter(
      (t) => t.id === id,
    );
    assert.equal(server.length, 1);
    assert.equal(server[0].done, true);
    assert.equal(server[0].notes, "Offline ergänzt");
    online = false;
    await store.enqueue("task", id, { title: "Noch nicht synchronisiert" });
    online = true;
    rejectServer = true;
    await store.sync();
    assert.equal(store.getState().queue.length, 1);
    assert.match(store.status(), /^Fehler/);
    rejectServer = false;
    await db.query("DELETE FROM sessions");
    await store.sync();
    assert.equal(store.status(), "Anmeldung erforderlich");
    assert.equal(store.getState().queue.length, 1);
    await store.login("sven", "test-password-offline");
    assert.equal(store.getState().queue.length, 0);
    online = false;
    const version = store.projected().tasks.find((t) => t.id === id)!.version;
    await store.enqueue("task", id, { title: "Meine Fassung" });
    await mutate(db, user, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "task",
      id,
      version,
      patch: { title: "Andere Fassung" },
    });
    online = true;
    await store.sync();
    assert.equal(store.status(), "Konflikt");
    assert.equal(store.getState().queue[0].patch.title, "Meine Fassung");
    assert.equal(
      store.getState().queue[0].detail.current.title,
      "Andere Fassung",
    );
    await store.resolveConflict(store.getState().queue[0].key);
    assert.equal(store.getState().queue.length, 0);
    online = false;
    await store.enqueue("task", id, { notes: "Bearbeitet während Löschung" });
    await mutate(db, user, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "task",
      id,
      version: store.projected().tasks.find((t) => t.id === id)!.version,
      patch: { deleted: true },
    });
    online = true;
    await store.sync();
    assert.equal(store.status(), "Konflikt");
    await assert.rejects(
      store.resolveConflict(store.getState().queue[0].key),
      /wiederherstellen/,
    );
    await store.resolveConflict(store.getState().queue[0].key, true);
    assert.equal(store.getState().queue.length, 0);
    assert.equal(
      store.projected().tasks.find((t) => t.id === id)?.deleted,
      false,
    );
    // Advancing an earlier queued field must not hide a remote conflict in a later field.
    online = false;
    const beforeQueue = store.projected().tasks.find((t) => t.id === id)!;
    await store.enqueue("task", id, { title: "Queued title" });
    await store.enqueue("task", id, { notes: "Queued notes" });
    await mutate(db, user, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "task",
      id,
      version: beforeQueue.version,
      patch: { notes: "Remote notes" },
    });
    online = true;
    await store.sync();
    assert.equal(store.status(), "Konflikt");
    assert.equal(store.getState().queue.length, 1);
    assert.equal(store.getState().queue[0].patch.notes, "Queued notes");
    assert.equal(
      (await snapshot(db, user, 0, randomUUID())).tasks.find((t) => t.id === id)
        ?.notes,
      "Remote notes",
    );
    await store.discard(store.getState().queue[0].key);
    // Shared list is owned by Sandra. Revocation must purge both cache and pending access.
    const list = randomUUID(),
      shared = randomUUID();
    await mutate(db, other, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "list",
      id: list,
      version: 0,
      patch: { name: "Geteilt", members: [user] },
    });
    await mutate(db, other, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "task",
      id: shared,
      version: 0,
      patch: { title: "Privat nach Entzug", listId: list },
    });
    await store.sync();
    online = false;
    await store.enqueue("task", shared, { notes: "queued" });
    await mutate(db, other, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "list",
      id: list,
      version: 1,
      patch: { members: [] },
    });
    online = true;
    await store.sync();
    assert.equal(store.getState().queue.length, 0);
    assert.equal(
      store.projected().tasks.find((t) => t.id === shared),
      undefined,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalInterval;
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
