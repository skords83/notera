import "fake-indexeddb/auto";
import { openDB } from "idb";
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
    const colorList = randomUUID();
    await assert.rejects(
      store.enqueue("list", colorList, { name: "Farben", color: "invalid" }),
    );
    await store.enqueue("list", colorList, {
      name: "Farben",
      members: [user, other],
      color: "sage",
    });
    await store.enqueue("list", colorList, { color: "ochre" });
    store = await load("color-reload");
    await store.init();
    assert.equal(
      store.projected().lists.find((l) => l.id === colorList)?.color,
      "ochre",
    );
    online = true;
    await store.sync();
    assert.equal(store.getState().queue.length, 0);
    assert.equal(
      (await snapshot(db, other, 0, randomUUID())).lists.find(
        (l) => l.id === colorList,
      )?.color,
      "ochre",
    );
    online = false;
    await store.enqueue("list", colorList, { color: "teal" });
    const colorVersion = store
      .projected()
      .lists.find((l) => l.id === colorList)!.version;
    await mutate(db, user, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "list",
      id: colorList,
      version: colorVersion,
      patch: { name: "Umbenannt" },
    });
    online = true;
    await store.sync();
    assert.equal(store.status(), "Konflikt");
    const pendingColor = store
      .getState()
      .queue.find((q) => q.id === colorList)!;
    assert.deepEqual(pendingColor.patch, { color: "teal" });
    await store.resolveConflict(pendingColor.key);
    await store.sync();
    const colored = (await snapshot(db, other, 0, randomUUID())).lists.find(
      (l) => l.id === colorList,
    )!;
    assert.equal(colored.color, "teal");
    assert.equal(colored.name, "Umbenannt");
    assert.deepEqual(new Set(colored.members), new Set([user, other]));
    await store.logout();
    await store.login("sven", "test-password-offline");
    assert.equal(
      store.projected().lists.find((l) => l.id === colorList)?.color,
      "teal",
    );

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
    // A new parent and its children survive reload; completion and undo stay atomic.
    online = false;
    const subParent = randomUUID(),
      childA = randomUUID(),
      childB = randomUUID();
    await store.enqueue("task", subParent, {
      title: "Offline parent",
      listId: inbox,
    });
    await store.enqueue("subtask", childA, {
      taskId: subParent,
      title: "First",
    });
    await store.enqueue("subtask", childA, { title: "Edited offline" });
    await store.enqueue("subtask", childB, {
      taskId: subParent,
      title: "Second",
    });
    await store.enqueue("subtask", childB, { done: true });
    const completionKey = await store.enqueue("completion", subParent, {
      action: "complete",
      openIds: [childA],
    });
    await store.enqueue("completion", subParent, {
      action: "undo",
      key: completionKey,
    });
    assert.equal(
      store.projected().tasks.find((t) => t.id === subParent)?.done,
      false,
    );
    assert.equal(
      store.projected().subtasks?.find((c) => c.id === childA)?.done,
      false,
    );
    assert.equal(
      store.projected().subtasks?.find((c) => c.id === childB)?.done,
      true,
    );
    store = await load("subtasks-reload");
    await store.init();
    online = true;
    loseResponse = true;
    await store.sync();
    await store.sync();
    assert.deepEqual(store.getState().queue, []);
    assert.equal(
      store.projected().subtasks?.find((c) => c.id === childA)?.title,
      "Edited offline",
    );
    assert.equal(
      store.projected().subtasks?.find((c) => c.id === childA)?.done,
      false,
    );
    assert.equal(
      store.projected().subtasks?.find((c) => c.id === childB)?.done,
      true,
    );
    online = false;
    await store.enqueue("subtask", childA, { title: "Local title" });
    const cVersion = store
      .projected()
      .subtasks!.find((c) => c.id === childA)!.version;
    await mutate(db, user, {
      key: randomUUID(),
      device: randomUUID(),
      entity: "subtask",
      id: childA,
      version: cVersion,
      patch: { title: "Remote title" },
    });
    online = true;
    await store.sync();
    assert.equal(store.status(), "Konflikt");
    assert.equal(
      store.getState().queue[0].detail.current.title,
      "Remote title",
    );
    await store.resolveConflict(store.getState().queue[0].key);
    assert.equal(store.getState().queue.length, 0);
    assert.equal(
      store.projected().subtasks?.find((c) => c.id === childA)?.title,
      "Local title",
    );

    // Client validation retains the form's responsibility: no invalid mutation is enqueued.
    online = false;
    for (const name of ["   ", "\t \n", "x".repeat(81)])
      await assert.rejects(
        store.enqueue("list", randomUUID(), { name }),
        /Listenname/,
      );
    assert.equal(store.getState().queue.length, 0);
    // A persisted request from an older client still reaches the server and must not disappear.
    const rejectedList = randomUUID(),
      waitingTask = randomUUID();
    const storage = await openDB("notera-v1", 1);
    const saved = await storage.get("state", "active");
    saved.queue.push({
      entity: "list",
      id: rejectedList,
      version: 0,
      key: randomUUID(),
      device: saved.device,
      patch: { name: "   " },
      base: {},
    });
    await storage.put("state", saved, "active");
    storage.close();
    store = await load("legacy-invalid-list");
    await store.init();
    await store.enqueue("task", waitingTask, {
      title: "Gedanke in neuer Liste",
      listId: rejectedList,
    });
    await store.enqueue("preference", waitingTask, { starred: true });
    online = true;
    await store.sync();
    assert.equal(
      store.getState().queue.length,
      3,
      "server rejection and dependent tasks must remain",
    );
    assert.match(store.getState().queue[0].error!, /Leerzeichen/);
    assert.equal(store.status(), "Fehler");
    await store.sync();
    assert.equal(store.getState().queue.length, 3);
    store = await load("rejected-list-reloaded");
    await store.init();
    assert.equal(
      store.getState().queue.length,
      3,
      "rejection must survive reload",
    );
    await store.correctNewList(store.getState().queue[0].key, {
      name: "  Korrigierte Liste  ",
    });
    assert.equal(store.getState().queue.length, 0);
    assert.equal(
      store.projected().lists.find((l) => l.id === rejectedList)?.name,
      "Korrigierte Liste",
    );
    assert.equal(
      store.projected().tasks.find((t) => t.id === waitingTask)?.listId,
      rejectedList,
    );
    assert.equal(store.projected().preferences[waitingTask]?.starred, true);
    // Normal offline list creation is trimmed, reloadable and synchronized exactly once.
    online = false;
    const offlineList = randomUUID();
    await store.enqueue("list", offlineList, {
      name: "  Offline-Liste  ",
      members: [other],
    });
    assert.equal(store.getState().queue[0].patch.name, "Offline-Liste");
    store = await load("offline-list-reload");
    await store.init();
    online = true;
    await store.sync();
    await store.sync();
    assert.equal(
      store.projected().lists.filter((l) => l.id === offlineList).length,
      1,
    );
    assert.equal(store.getState().queue.length, 0);
    assert.ok(
      (await snapshot(db, other, 0, randomUUID())).lists.some(
        (l) => l.id === offlineList,
      ),
    );
    // A valid local name can still be rejected for other server validation reasons.
    online = false;
    const denied = randomUUID();
    await store.enqueue("list", denied, {
      name: "Server lehnt ab",
      members: [randomUUID()],
    });
    const dependent = randomUUID();
    await store.enqueue("task", dependent, {
      title: "Abhängig",
      listId: denied,
    });
    online = true;
    await store.sync();
    assert.equal(store.getState().queue.length, 2);
    assert.equal(store.status(), "Fehler");
    await store.discard(store.getState().queue[0].key);
    assert.equal(store.getState().queue.length, 0);
    assert.ok(!store.projected().lists.some((l) => l.id === denied));
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
    await store.enqueue("list", list, { name: "Kein Besitzrecht" });
    const privatePending = randomUUID();
    await store.enqueue("task", privatePending, {
      title: "Auch lokal entfernen",
      listId: list,
    });
    await store.enqueue("preference", privatePending, { starred: true });
    await store.enqueue("subtask", randomUUID(), {
      taskId: privatePending,
      title: "Entzug entfernt Kind",
    });
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
