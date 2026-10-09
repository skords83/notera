import { openDB } from "idb";
import type {
  Mutation,
  Snapshot,
  User,
  Task,
  List,
  Preference,
} from "../shared/model";
export type Pending = Mutation & {
  base?: Record<string, unknown>;
  error?: string;
  detail?: any;
  status?: number;
};
export type Local = {
  user: User | null;
  snapshot: Snapshot;
  queue: Pending[];
  device: string;
};
const empty: Snapshot = {
  cursor: 0,
  reset: false,
  lists: [],
  tasks: [],
  preferences: {},
  users: [],
};
const database = openDB("notera-v1", 1, {
  upgrade(db) {
    db.createObjectStore("state");
  },
});
let state: Local = {
  user: null,
  snapshot: empty,
  queue: [],
  device: crypto.randomUUID(),
};
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("notera-state")
    : null;
channel?.addEventListener("message", async () => {
  state = (await (await database).get("state", "active")) || state;
  emit();
});
let listeners = new Set<() => void>();
let tail: Promise<unknown> = Promise.resolve();
let running: Promise<void> | null = null;
let events: EventSource | null = null;
export let syncStatus = "Laden …";
export function getState() {
  return state;
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function emit() {
  for (const fn of listeners) fn();
}
export function status() {
  return syncStatus;
}
async function update(fn: (s: Local) => Local) {
  const job = tail.then(async () => {
    const db = await database;
    const tx = db.transaction("state", "readwrite");
    const latest = (await tx.store.get("active")) || state;
    const next = fn(structuredClone(latest));
    await tx.store.put(next, "active");
    await tx.done;
    state = next;
    emit();
    channel?.postMessage("changed");
  });
  tail = job.catch(() => {});
  return job;
}
export async function init() {
  state = (await (await database).get("state", "active")) || state;
  emit();
  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", () => {
    syncStatus = "Offline";
    emit();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void sync();
  }, 30000);
  await sync();
}
export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}
export async function api(path: string, body?: unknown) {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(response.status, "Serverantwort nicht lesbar.");
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || "Verbindung fehlgeschlagen.",
      data.detail,
    );
  return data;
}
export async function login(username: string, password: string) {
  const user = (await api("/login", { username, password })) as User;
  if (state.user && state.user.id !== user.id && state.queue.length) {
    await api("/logout", {});
    throw new Error(
      "Auf diesem Gerät warten Änderungen eines anderen Kontos. Zuerst mit diesem Konto anmelden und synchronisieren.",
    );
  }
  await update((s) =>
    s.user?.id === user.id
      ? { ...s, user }
      : { user, snapshot: empty, queue: [], device: s.device },
  );
  await sync();
}
export async function logout() {
  if (state.queue.length)
    throw new Error(
      "Zuerst ausstehende Änderungen synchronisieren oder Konflikte auflösen.",
    );
  await api("/logout", {});
  events?.close();
  events = null;
  await update((s) => ({ ...s, user: null, snapshot: empty, queue: [] }));
}
export function projected(): Snapshot {
  const result = structuredClone(state.snapshot);
  for (const m of state.queue) {
    if (m.status === 403) continue;
    if (m.entity === "task") {
      let t = result.tasks.find((t) => t.id === m.id);
      if (!t) {
        t = {
          id: m.id,
          version: 0,
          createdBy: state.user!.id,
          updatedAt: new Date().toISOString(),
          title: "",
          notes: "",
          links: [],
          listId: "",
          assignee: null,
          due: null,
          done: false,
          deleted: false,
          completedAt: null,
        };
        result.tasks.push(t);
      }
      Object.assign(t, m.patch);
    } else if (m.entity === "preference") {
      result.preferences[m.id] = {
        ...(result.preferences[m.id] || {
          today: null,
          starred: false,
          hideOverdue: null,
          version: 0,
        }),
        ...m.patch,
      };
    } else {
      let l = result.lists.find((l) => l.id === m.id);
      if (!l) {
        l = {
          id: m.id,
          name: "",
          ownerId: state.user!.id,
          members: [state.user!.id],
          inbox: false,
          version: 0,
        };
        result.lists.push(l);
      }
      Object.assign(l, m.patch);
      if (m.patch.deleted)
        result.lists = result.lists.filter((l) => l.id !== m.id);
    }
  }
  return result;
}
export async function enqueue(
  entity: Mutation["entity"],
  id: string,
  patch: Record<string, unknown>,
  version?: number,
) {
  if (!state.user) throw new Error("Bitte anmelden.");
  const accountId = state.user.id;
  const snap = projected();
  const v =
    version ??
    (entity === "task"
      ? snap.tasks.find((t) => t.id === id)?.version
      : entity === "list"
        ? snap.lists.find((t) => t.id === id)?.version
        : snap.preferences[id]?.version) ??
    0;
  await update((s) => {
    if (s.user?.id !== accountId)
      throw new Error(
        "Konto wurde in einem anderen Tab gewechselt. Bitte neu laden.",
      );
    const object =
      entity === "task"
        ? snap.tasks.find((t) => t.id === id)
        : entity === "list"
          ? snap.lists.find((l) => l.id === id)
          : snap.preferences[id];
    s.queue.push({
      entity,
      id,
      patch,
      version: v,
      key: crypto.randomUUID(),
      device: s.device,
      base: object ? { ...object } : {},
    });
    return s;
  });
  syncStatus = navigator.onLine ? "Änderungen ausstehend" : "Offline";
  emit();
  void sync();
}
function connect() {
  if (events || !state.user) return;
  events = new EventSource("/api/events");
  events.onmessage = () => void sync();
  events.onerror = () => {
    events?.close();
    events = null;
  };
}
async function pull() {
  const snap = (await api(
    `/sync?cursor=${state.snapshot.cursor}&device=${state.device}`,
  )) as Snapshot;
  if (snap.userId !== state.user?.id)
    throw new ApiError(401, "Anderes Konto aktiv. Bitte erneut anmelden.");
  await update((s) => {
    if (snap.userId !== s.user?.id) return s;
    const allowed = new Set(snap.lists.map((l) => l.id));
    const locallyCreatedLists = new Set(
      s.queue
        .filter((m) => m.entity === "list" && m.version === 0 && !m.error)
        .map((m) => m.id),
    );
    const oldTasks = new Map(s.snapshot.tasks.map((t) => [t.id, t]));
    let revoked = 0;
    s.queue = s.queue.filter((m) => {
      const list =
        m.entity === "list"
          ? m.id
          : m.entity === "task"
            ? oldTasks.get(m.id)?.listId || String(m.patch.listId || "")
            : oldTasks.get(m.id)?.listId;
      const keep = !list || allowed.has(list) || locallyCreatedLists.has(list);
      if (!keep) revoked++;
      return keep;
    });
    s.snapshot = snap;
    if (revoked)
      syncStatus = "Zugriff entzogen: lokale Kopien und Änderungen entfernt.";
    return s;
  });
}
export async function sync() {
  if (running) return running;
  if (!state.user) {
    syncStatus = "Anmeldung erforderlich";
    emit();
    return;
  }
  if (!navigator.onLine) {
    syncStatus = "Offline";
    emit();
    return;
  }
  const perform = async () => {
    try {
      state = (await (await database).get("state", "active")) || state;
      syncStatus = "Synchronisieren …";
      emit();
      const me = await api("/me");
      if (me.id !== state.user?.id)
        throw new ApiError(401, "Anderes Konto aktiv.");
      await pull();
      const blocked = new Set<string>();
      for (const initial of [...state.queue]) {
        const m = state.queue.find((q) => q.key === initial.key);
        if (!m) continue;
        const obj = m.entity + ":" + m.id;
        if (m.error || blocked.has(obj)) {
          blocked.add(obj);
          continue;
        }
        try {
          const { error, detail, status, base, ...payload } = m;
          const result = await api("/mutations", payload);
          const acknowledged = (await api(
            `/sync?cursor=${state.snapshot.cursor}&device=${state.device}`,
          )) as Snapshot;
          if (acknowledged.userId !== state.user?.id)
            throw new ApiError(401, "Anderes Konto aktiv.");
          await update((s) => {
            if (acknowledged.userId !== s.user?.id) return s;
            s.snapshot = acknowledged;
            s.queue = s.queue.filter((q) => q.key !== m.key);
            const next = s.queue.find(
              (q) => q.entity === m.entity && q.id === m.id,
            );
            if (next && !next.error) {
              const current: any =
                m.entity === "task"
                  ? acknowledged.tasks.find((t) => t.id === m.id)
                  : m.entity === "list"
                    ? acknowledged.lists.find((l) => l.id === m.id)
                    : acknowledged.preferences[m.id];
              const keys = [
                ...new Set([
                  ...Object.keys(next.patch),
                  ...(m.entity === "task" ? ["listId", "deleted"] : []),
                ]),
              ];
              const changed = keys.filter(
                (k) =>
                  next.base &&
                  JSON.stringify(next.base[k]) !==
                    JSON.stringify(current?.[k]) &&
                  JSON.stringify(next.patch[k]) !==
                    JSON.stringify(current?.[k]),
              );
              if (changed.length) {
                next.error =
                  "Zwischenzeitliche Änderung an einem nachfolgenden Offline-Schritt.";
                next.status = 409;
                next.detail = {
                  current,
                  fields: changed,
                  version: result.version,
                };
              } else next.version = result.version;
            }
            return s;
          });
        } catch (e) {
          if (
            !(e instanceof ApiError) ||
            e.code === 401 ||
            e.code >= 500 ||
            e.code === 429
          )
            throw e;
          await update((s) => {
            const pending = s.queue.find((q) => q.key === m.key);
            if (pending) {
              pending.error = (e as Error).message;
              pending.detail = e.detail;
              pending.status = e.code;
            }
            return s;
          });
          blocked.add(obj);
        }
      }
      await pull();
      syncStatus = state.queue.some((q) => q.error)
        ? "Konflikt"
        : state.queue.length
          ? "Änderungen ausstehend"
          : "Synchronisiert";
      connect();
    } catch (e) {
      syncStatus =
        e instanceof ApiError && e.code === 401
          ? "Anmeldung erforderlich"
          : navigator.onLine
            ? "Fehler: " + (e as Error).message
            : "Offline";
      if (e instanceof ApiError && e.code === 401) {
        events?.close();
        events = null;
      }
    } finally {
      emit();
    }
  };
  running = (
    navigator.locks
      ? navigator.locks.request("notera-sync", perform)
      : perform()
  ).finally(() => {
    running = null;
  });
  return running;
}
export async function discard(key: string) {
  await update((s) => ({ ...s, queue: s.queue.filter((m) => m.key !== key) }));
  await sync();
}
export async function resolveConflict(key: string, restore = false) {
  const m = state.queue.find((q) => q.key === key);
  if (!m) return;
  const snapshot = state.snapshot;
  const version =
    m.entity === "task"
      ? snapshot.tasks.find((t) => t.id === m.id)?.version
      : m.entity === "list"
        ? snapshot.lists.find((l) => l.id === m.id)?.version
        : snapshot.preferences[m.id]?.version;
  if (version === undefined)
    throw new Error(
      "Objekt nicht mehr vorhanden. Lokalen Text kopieren und bei Bedarf eine neue Aufgabe anlegen.",
    );
  if (
    m.entity === "task" &&
    snapshot.tasks.find((t) => t.id === m.id)?.deleted &&
    m.patch.deleted !== false &&
    !restore
  )
    throw new Error(
      "Aufgabe zuerst im Papierkorb ausdrücklich wiederherstellen oder Text als neue Aufgabe sichern.",
    );
  await update((s) => {
    const p = s.queue.find((q) => q.key === key)!;
    p.key = crypto.randomUUID();
    p.version = version;
    if (restore) p.patch.deleted = false;
    delete p.error;
    delete p.detail;
    delete p.status;
    return s;
  });
  await sync();
}
