import {
  initializeOrder,
  ordered,
  relocate,
  orderPatch,
  projectOrder,
  scopeRows,
  type OrderPatch,
} from "../shared/order";
import { openDB } from "idb";
import {
  listPatch,
  listName,
  subtaskPatch,
  subtaskMovePatch,
  taskConvertPatch,
  completionPatch,
} from "../shared/model";
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
  notice?: string;
  noticeKind?: "success";
  user: User | null;
  snapshot: Snapshot;
  queue: Pending[];
  device: string;
  completions?: Record<string, any>;
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
let queuedDuringSync = false;
function syncQueued() {
  if (running) queuedDuringSync = true;
  else void sync();
}
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
export function projected(local: Local = state): Snapshot {
  const result = structuredClone(local.snapshot);
  initializeOrder(result);
  const blockedOrders = new Set<string>();
  result.subtasks ||= [];
  for (const m of local.queue) {
    if (m.status === 403 && !(m.entity === "list" && m.version === 0)) continue;
    if (
      result.convertedTasks?.some((t) => t.id === m.id) &&
      (m.entity === "task" ||
        m.entity === "preference" ||
        m.entity === "completion" ||
        (m.entity === "order" && m.patch.kind === "task"))
    )
      continue;
    if (m.entity === "taskConvert") {
      if (m.error || result.conversionReceipts?.includes(m.key)) continue;
      const source = result.tasks.find((t) => t.id === m.id && !t.deleted);
      const target = result.tasks.find(
        (t) => t.id === m.patch.targetId && !t.deleted,
      );
      if (
        !source ||
        !target ||
        source.id === target.id ||
        source.listId !== target.listId ||
        result.subtasks.some((c) => c.taskId === source.id)
      )
        continue;
      result.subtasks.push({
        id: source.id,
        taskId: target.id,
        title: source.title,
        done: source.done,
        completedAt: source.completedAt,
        createdBy: source.createdBy,
        deleted: false,
        version: source.version + 1,
        orderVersion: 1,
        createdAt: source.updatedAt,
        position:
          Math.max(
            0,
            ...result.subtasks
              .filter((c) => c.taskId === target.id)
              .map((c) => c.position || 0),
          ) + 1,
      });
      result.convertedTasks ||= [];
      result.convertedTasks.push({ id: source.id, listId: source.listId });
      result.tasks = result.tasks.filter((t) => t.id !== source.id);
      delete result.preferences[source.id];
      if (!source.done) {
        target.done = false;
        target.completedAt = null;
      }
      continue;
    }
    if (m.entity === "order") {
      if (result.orderReceipts?.includes(m.key)) continue;
      const p = orderPatch.parse(m.patch);
      const scope = p.kind + ":" + p.scopeId;
      if (m.error) blockedOrders.add(scope);
      if (!blockedOrders.has(scope)) projectOrder(result, m.id, p);
      continue;
    }
    if (m.entity === "subtaskMove") {
      if (m.error || result.moveReceipts?.includes(m.key)) continue;
      const child = result.subtasks.find((c) => c.id === m.id);
      const target = result.tasks.find(
        (t) => t.id === m.patch.targetId && !t.deleted,
      );
      const source = result.tasks.find(
        (t) => t.id === m.patch.sourceId && !t.deleted,
      );
      if (
        !child ||
        !target ||
        !source ||
        source.id === target.id ||
        source.listId !== target.listId ||
        child.taskId !== source.id
      )
        continue;
      child.position =
        Math.max(
          0,
          ...result.subtasks
            .filter((c) => c.taskId === target.id)
            .map((c) => c.position || 0),
        ) + 1;
      const placement = subtaskMovePatch.parse(m.patch).placement;
      if (placement) {
        const rows = ordered(
          result.subtasks.filter((c) => c.taskId === target.id),
        );
        if (!rows.some((c) => c.id === placement.anchorId && !c.deleted))
          continue;
        relocate(
          [...rows, child],
          child.id,
          placement.anchorId,
          placement.side,
        ).forEach((c, i) => {
          c.position = i + 1;
        });
      }
      child.taskId = target.id;
      child.orderVersion = (child.orderVersion || 0) + 1;
      if (!child.done) {
        target.done = false;
        target.completedAt = null;
      }
      continue;
    }
    if (m.entity === "subtask") {
      if (
        m.error ||
        (m.base?.conversionKey &&
          !result.convertedTasks?.some((t) => t.id === m.id))
      )
        continue;
      let child = result.subtasks.find((c) => c.id === m.id);
      const isNew = !child;
      if (!child) {
        child = {
          id: m.id,
          taskId: String(m.patch.taskId || m.base?.taskId || ""),
          title: "",
          done: false,
          deleted: false,
          version: 0,
          createdAt: String(m.base?.createdAt || ""),
        };
        child.position =
          Math.max(
            0,
            ...result.subtasks
              .filter((c) => c.taskId === child!.taskId)
              .map((c) => c.position || 0),
          ) + 1;
        child.orderVersion = 0;
        result.subtasks.push(child);
      }
      if (m.error || (m.base?.taskId && child.taskId !== m.base.taskId))
        continue;
      Object.assign(child, m.patch);
      const parent = result.tasks.find((t) => t.id === child.taskId);
      if (parent && !child.deleted && (isNew || m.patch.done === false)) {
        parent.done = false;
        parent.completedAt = null;
      }
    } else if (m.entity === "completion") {
      const parent = result.tasks.find((t) => t.id === m.id);
      if (!parent || m.error) continue;
      if (m.patch.action === "complete") {
        if (
          !(m.patch.openIds as string[]).every((id) =>
            result.subtasks!.some(
              (c) => c.id === id && c.taskId === m.id && !c.deleted,
            ),
          )
        )
          continue;
        parent.done = true;
        for (const c of result.subtasks)
          if (c.taskId === m.id && (m.patch.openIds as string[]).includes(c.id))
            c.done = true;
      } else if (m.patch.action === "reopen") {
        parent.done = false;
        parent.completedAt = null;
      } else {
        const before = m.base?.undoState as any;
        if (
          before &&
          (local.queue.some(
            (q) => q.key === m.patch.key && q.entity === "completion",
          ) ||
            (parent.version === before.version &&
              before.subtasks.every((v: any) =>
                result.subtasks!.some(
                  (c) => c.id === v.id && c.version === v.version,
                ),
              ))) &&
          !local.queue.some(
            (q) =>
              q.entity === "subtaskMove" &&
              (q.patch.sourceId === m.id || q.patch.targetId === m.id),
          ) &&
          before.subtasks.every((v: any) =>
            result.subtasks!.some((c) => c.id === v.id && c.taskId === m.id),
          )
        ) {
          parent.done = before.done;
          parent.completedAt = before.completedAt;
          for (const c of result.subtasks) {
            const prev = before.subtasks.find((v: any) => v.id === c.id);
            if (prev) c.done = prev.done;
          }
        }
      }
    } else if (m.entity === "task") {
      let t = result.tasks.find((t) => t.id === m.id);
      if (!t) {
        t = {
          id: m.id,
          version: 0,
          createdBy: local.user!.id,
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
      if (m.patch.listId && t.listId !== m.patch.listId) {
        t.position =
          Math.max(
            0,
            ...result.tasks
              .filter((r) => r.listId === m.patch.listId && r.id !== t!.id)
              .map((r) => r.position || 0),
          ) + 1;
        t.orderVersion = (t.orderVersion || 0) + Number(!!t.listId);
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
          ownerId: local.user!.id,
          members: [local.user!.id],
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
  if (entity === "list") {
    const parsed = listPatch.safeParse(patch);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    patch = parsed.data;
  }
  if (
    entity === "subtask" ||
    entity === "completion" ||
    entity === "subtaskMove" ||
    entity === "taskConvert"
  ) {
    const parsed = (
      entity === "subtask"
        ? subtaskPatch
        : entity === "taskConvert"
          ? taskConvertPatch
          : entity === "subtaskMove"
            ? subtaskMovePatch
            : completionPatch
    ).safeParse(patch);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    patch = parsed.data;
  }
  const accountId = state.user.id;
  const snap = projected();
  // Carry the intended parent through offline moves and conflict/discard flows.
  // The server only accepts taskId here when it equals the current parent.
  if (entity === "subtask" && !patch.taskId) {
    const child = snap.subtasks?.find((c) => c.id === id);
    if (child) patch = { ...patch, taskId: child.taskId };
  }
  const v =
    version ??
    (entity === "task" || entity === "completion" || entity === "taskConvert"
      ? snap.tasks.find((t) => t.id === id)?.version
      : entity === "subtask" || entity === "subtaskMove"
        ? snap.subtasks?.find((c) => c.id === id)?.version
        : entity === "list"
          ? snap.lists.find((t) => t.id === id)?.version
          : snap.preferences[id]?.version) ??
    0;
  const key = crypto.randomUUID();
  await update((s) => {
    if (s.user?.id !== accountId)
      throw new Error(
        "Konto wurde in einem anderen Tab gewechselt. Bitte neu laden.",
      );
    const object =
      entity === "task" || entity === "completion" || entity === "taskConvert"
        ? snap.tasks.find((t) => t.id === id)
        : entity === "subtask" || entity === "subtaskMove"
          ? snap.subtasks?.find((c) => c.id === id)
          : entity === "list"
            ? snap.lists.find((l) => l.id === id)
            : snap.preferences[id];
    s.queue.push({
      entity,
      id,
      patch,
      version: v,
      key,
      device: s.device,
      base: {
        ...(object || {}),
        ...(entity === "subtask" &&
        s.queue.some((q) => q.entity === "taskConvert" && q.id === id)
          ? {
              conversionKey: s.queue.find(
                (q) => q.entity === "taskConvert" && q.id === id,
              )!.key,
            }
          : {}),
        ...(entity === "subtaskMove" || entity === "taskConvert"
          ? { target: snap.tasks.find((t) => t.id === patch.targetId) }
          : {}),
        ...(entity === "completion"
          ? {
              subtasks: (snap.subtasks || []).filter(
                (c) => c.taskId === id && !c.deleted && !c.done,
              ),
              ...(patch.action === "undo"
                ? {
                    undoState:
                      s.completions?.[String(patch.key)] ||
                      s.queue.find((q) => q.key === patch.key)?.base,
                  }
                : {}),
            }
          : {}),
      },
    });
    return s;
  });
  syncStatus = navigator.onLine ? "Änderungen ausstehend" : "Offline";
  emit();
  syncQueued();
  return key;
}
export async function move(
  kind: "task" | "subtask",
  id: string,
  anchorId: string,
  side: "before" | "after",
) {
  const accountId = state.user?.id;
  await update((s) => {
    if (s.user?.id !== accountId)
      throw new Error("Konto wurde gewechselt. Bitte neu laden.");
    if (!s.user) throw new Error("Bitte anmelden.");
    const snap = projected(s);
    const row =
      kind === "task"
        ? snap.tasks.find((t) => t.id === id)
        : snap.subtasks?.find((c) => c.id === id);
    if (!row || row.deleted) throw new Error("Aufgabe nicht mehr vorhanden.");
    const scopeId = "listId" in row ? row.listId : row.taskId;
    if (kind === "subtask" && snap.tasks.find((t) => t.id === scopeId)?.deleted)
      throw new Error("Hauptaufgabe liegt im Papierkorb.");
    if (
      s.queue.some(
        (q) =>
          q.entity === "order" &&
          q.patch.kind === kind &&
          q.patch.scopeId === scopeId &&
          q.error,
      )
    )
      throw new Error(
        "Bitte zuerst den Sortierkonflikt unter Änderungen prüfen auflösen.",
      );
    const anchor = scopeRows(snap, { kind, scopeId }).find(
      (r) => r.id === anchorId,
    );
    if (
      !anchor ||
      anchor.deleted ||
      anchorId === id ||
      (kind === "task" && anchor.done !== row.done)
    )
      throw new Error("Keine passende Nachbaraufgabe.");
    const patch: OrderPatch = {
      kind,
      scopeId,
      anchorId,
      anchorVersion: anchor.orderVersion || 0,
      side,
      ...(kind === "task" ? { done: row.done } : {}),
    };
    s.queue.push({
      entity: "order",
      id,
      version: row.orderVersion || 0,
      key: crypto.randomUUID(),
      device: s.device,
      patch,
      base: { ...row, anchorTitle: anchor.title },
    });
    return s;
  });
  syncStatus = navigator.onLine ? "Änderungen ausstehend" : "Offline";
  emit();
  syncQueued();
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
    const previouslyKnown = new Set(s.snapshot.lists.map((l) => l.id));
    const locallyCreatedLists = new Set(
      s.queue
        .filter(
          (m) =>
            m.entity === "list" &&
            m.version === 0 &&
            !previouslyKnown.has(m.id) &&
            !(Number(m.base?.version) > 0),
        )
        .map((m) => m.id),
    );
    const oldTasks = new Map(s.snapshot.tasks.map((t) => [t.id, t]));
    for (const marker of s.snapshot.convertedTasks || [])
      oldTasks.set(marker.id, marker as Task);
    // Include local task ancestry so dependent edits/preferences are pruned on real revocation.
    for (const m of s.queue) {
      if (
        (m.entity === "task" || m.entity === "taskConvert") &&
        !oldTasks.has(m.id)
      ) {
        const listId = m.base?.listId || m.patch.listId;
        if (typeof listId === "string") oldTasks.set(m.id, { listId } as Task);
      }
    }
    const parents = new Map(
      (s.snapshot.subtasks || []).map((c) => [c.id, c.taskId]),
    );
    for (const m of s.queue)
      if (m.entity === "subtask" || m.entity === "subtaskMove")
        parents.set(
          m.id,
          String(m.base?.taskId || m.patch.taskId || parents.get(m.id) || ""),
        );
    let revoked = 0;
    s.queue = s.queue.filter((m) => {
      const list =
        m.entity === "order"
          ? m.patch.kind === "task"
            ? String(m.patch.scopeId)
            : oldTasks.get(String(m.patch.scopeId))?.listId
          : m.entity === "list"
            ? m.id
            : m.entity === "task"
              ? oldTasks.get(m.id)?.listId || String(m.patch.listId || "")
              : oldTasks.get(
                  m.entity === "subtask" || m.entity === "subtaskMove"
                    ? parents.get(m.id)!
                    : m.id,
                )?.listId;
      const keep = !list || allowed.has(list) || locallyCreatedLists.has(list);
      if (!keep) revoked++;
      return keep;
    });
    s.snapshot = snap;
    if (revoked) {
      delete s.noticeKind;
      s.notice =
        "Zugriff entzogen: ausstehende Änderungen wurden nicht übernommen; lokale Kopien und Queue-Einträge wurden entfernt.";
      syncStatus = s.notice;
    }
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
    queuedDuringSync = false;
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
        const obj =
          m.entity === "order"
            ? "order:" + m.patch.kind + ":" + m.patch.scopeId
            : m.entity + ":" + m.id;
        if (m.error || blocked.has(obj)) {
          blocked.add(obj);
          continue;
        }
        if (
          m.entity === "order" &&
          state.queue
            .slice(0, state.queue.indexOf(m))
            .some(
              (q) =>
                (q.entity === "order" &&
                  q.patch.kind === m.patch.kind &&
                  q.patch.scopeId === m.patch.scopeId) ||
                ((q.entity === "task" || q.entity === "subtask") &&
                  (q.id === m.id ||
                    q.id === m.patch.anchorId ||
                    q.id === m.patch.scopeId)),
            )
        )
          continue;
        const parentId =
          m.entity === "order" && m.patch.kind === "subtask"
            ? String(m.patch.scopeId)
            : m.entity === "subtask" || m.entity === "subtaskMove"
              ? String(m.base?.taskId || m.patch.taskId || "")
              : m.id;
        if (
          (m.entity === "subtask" ||
            m.entity === "completion" ||
            m.entity === "subtaskMove") &&
          state.queue.some(
            (q) =>
              q.entity === "task" &&
              (q.id === parentId ||
                (m.entity === "subtaskMove" && q.id === m.patch.targetId)) &&
              (q.version === 0 || q.error),
          )
        )
          continue;
        if (
          m.entity === "completion" &&
          (state.queue
            .slice(0, state.queue.indexOf(m))
            .some(
              (q) =>
                q.entity === "subtask" &&
                (q.base?.taskId === m.id || q.patch.taskId === m.id),
            ) ||
            (m.patch.action === "undo" &&
              state.queue.some((q) => q.key === m.patch.key)))
        )
          continue;
        if (
          state.queue
            .slice(0, state.queue.indexOf(m))
            .some(
              (q) =>
                q.entity === "subtaskMove" &&
                (q.id === m.id ||
                  q.patch.sourceId === parentId ||
                  q.patch.targetId === parentId ||
                  (m.entity === "order" && q.id === m.patch.anchorId)),
            )
        )
          continue;
        if (
          m.entity === "subtaskMove" &&
          state.queue
            .slice(0, state.queue.indexOf(m))
            .some(
              (q) =>
                q.id === m.id ||
                q.id === m.patch.sourceId ||
                q.id === m.patch.targetId ||
                (q.entity === "order" &&
                  (q.patch.scopeId === m.patch.sourceId ||
                    q.patch.scopeId === m.patch.targetId)),
            )
        )
          continue;
        const preceding = state.queue.slice(0, state.queue.indexOf(m));
        // A conversion is structural. Preserve causality across entity types and reloads.
        if (
          preceding.some(
            (q) =>
              q.entity === "taskConvert" &&
              (q.id === m.id ||
                q.patch.targetId === m.id ||
                q.id === parentId ||
                q.patch.targetId === parentId ||
                (m.entity === "order" &&
                  (q.id === m.patch.anchorId ||
                    q.patch.targetId === m.patch.anchorId))),
          )
        )
          continue;
        if (
          m.entity === "taskConvert" &&
          preceding.some(
            (q) =>
              q.id === m.id ||
              q.id === m.patch.targetId ||
              q.base?.taskId === m.id ||
              q.patch.taskId === m.id ||
              (q.entity === "subtaskMove" &&
                (q.patch.sourceId === m.id ||
                  q.patch.targetId === m.id ||
                  q.patch.targetId === m.patch.targetId)) ||
              (q.entity === "order" &&
                (q.patch.scopeId === m.id || q.id === m.patch.targetId)),
          )
        )
          continue;
        const pendingList = state.queue.find(
          (q) =>
            q.entity === "list" &&
            q.version === 0 &&
            (q.id === m.patch.listId ||
              q.id === m.base?.listId ||
              q.id ===
                projected().tasks.find((t) => t.id === parentId)?.listId),
        );
        if (m.entity !== "list" && pendingList) continue;
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
            if (result.before) {
              s.completions ||= {};
              s.completions[m.key] = result.before;
            }
            s.queue = s.queue.filter((q) => q.key !== m.key);
            const affected: { entity: Mutation["entity"]; id: string }[] = [
              {
                entity:
                  m.entity === "completion"
                    ? "task"
                    : m.entity === "subtaskMove"
                      ? "subtask"
                      : m.entity,
                id: m.id,
              },
            ];
            if (m.entity === "taskConvert") {
              affected.push(
                { entity: "subtask", id: m.id },
                { entity: "task", id: String(m.patch.targetId) },
              );
              s.noticeKind = "success";
              s.notice = "Aufgabe wurde als Unteraufgabe verschoben.";
            }
            if (m.entity === "subtaskMove") {
              affected.push(
                { entity: "task", id: String(m.patch.sourceId) },
                { entity: "task", id: String(m.patch.targetId) },
              );
              s.noticeKind = "success";
              s.notice = "Unteraufgabe wurde zur anderen Aufgabe verschoben.";
            }
            if (m.entity === "subtask")
              affected.push({ entity: "task", id: parentId });
            if (m.entity === "completion") {
              const ids =
                m.patch.action === "complete"
                  ? (m.patch.openIds as string[])
                  : ((m.base?.undoState as any)?.subtasks || []).map(
                      (c: any) => c.id,
                    );
              for (const id of ids) affected.push({ entity: "subtask", id });
            }
            for (const q of s.queue.filter(
              (q) => q.entity === "taskConvert" && !q.error,
            )) {
              const sameContent = (base: any, current: Task) =>
                base &&
                [
                  "title",
                  "notes",
                  "links",
                  "due",
                  "assignee",
                  "done",
                  "deleted",
                  "listId",
                ].every(
                  (k) =>
                    JSON.stringify(base[k]) ===
                    JSON.stringify((current as any)[k]),
                );
              const source = acknowledged.tasks.find((t) => t.id === q.id);
              const target = acknowledged.tasks.find(
                (t) => t.id === q.patch.targetId,
              );
              if (
                source &&
                m.entity === "task" &&
                m.id === q.id &&
                source.version === result.version &&
                source.version === q.version + 1 &&
                sameContent(q.base, source)
              )
                q.version = source.version;
              if (
                target &&
                target.version === result.parentVersions?.[target.id] &&
                target.version === Number(q.patch.targetVersion) + 1 &&
                sameContent(q.base?.target, target)
              )
                q.patch.targetVersion = target.version;
            }
            // Rebase only causally acknowledged local dependencies. Never rebase on a pull.
            for (const q of s.queue.filter(
              (q) => q.entity === "subtaskMove" && !q.error,
            )) {
              const c = acknowledged.subtasks?.find((c) => c.id === q.id);
              const t = acknowledged.tasks.find(
                (t) => t.id === q.patch.targetId,
              );
              const expectedChildVersion =
                m.entity === "completion"
                  ? result.stepVersions?.[q.id]
                  : (m.entity === "subtask" || m.entity === "subtaskMove") &&
                      m.id === q.id
                    ? result.version
                    : undefined;
              if (
                c &&
                c.version === expectedChildVersion &&
                (c.version === q.version + 1 ||
                  (m.entity === "subtaskMove" && m.id === q.id)) &&
                c.taskId === q.patch.sourceId
              )
                q.version = c.version;
              if (
                t &&
                t.version === result.parentVersions?.[t.id] &&
                t.version === Number(q.patch.targetVersion) + 1
              ) {
                const base = q.base?.target as Task | undefined;
                if (
                  base &&
                  [
                    "listId",
                    "deleted",
                    "title",
                    "notes",
                    "done",
                    "links",
                    "due",
                    "assignee",
                  ].every(
                    (k) =>
                      JSON.stringify((base as any)[k]) ===
                      JSON.stringify((t as any)[k]),
                  )
                )
                  q.patch.targetVersion = t.version;
              }
            }
            for (const item of affected.filter(
              (item) => item.entity !== "order",
            )) {
              const next = s.queue.find(
                (q) =>
                  q.id === item.id &&
                  (q.entity === item.entity ||
                    (item.entity === "subtask" && q.entity === "subtaskMove") ||
                    (item.entity === "task" && q.entity === "completion")),
              );
              if (!next || next.error || next.entity === "subtaskMove")
                continue;
              const current: any =
                item.entity === "task"
                  ? acknowledged.tasks.find((t) => t.id === item.id)
                  : item.entity === "subtask"
                    ? acknowledged.subtasks?.find((c) => c.id === item.id)
                    : item.entity === "list"
                      ? acknowledged.lists.find((l) => l.id === item.id)
                      : acknowledged.preferences[item.id];
              const keys = [
                ...new Set([
                  ...(next.entity === "completion"
                    ? ["done"]
                    : Object.keys(next.patch)),
                  ...(item.entity === "task"
                    ? ["listId", "deleted"]
                    : item.entity === "subtask"
                      ? ["taskId", "deleted"]
                      : []),
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
              if (changed.length || !current) {
                next.error =
                  "Zwischenzeitliche Änderung an einem nachfolgenden Offline-Schritt.";
                next.status = 409;
                next.detail = {
                  current,
                  fields: changed,
                  version: current?.version,
                };
              } else next.version = current.version;
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
              if (m.entity === "order") {
                const following = s.queue.slice(s.queue.indexOf(pending) + 1);
                for (const q of following) {
                  if (
                    q.entity === "order" &&
                    q.patch.kind === m.patch.kind &&
                    q.patch.scopeId === m.patch.scopeId &&
                    !q.error
                  ) {
                    q.error =
                      "Eine vorausgehende Sortieraktion wurde abgelehnt. Bitte auch diese Folgeaktion prüfen und die Position erneut wählen.";
                    q.status = 409;
                    q.detail = { causeKey: m.key };
                  }
                }
              }
            }
            return s;
          });
          blocked.add(obj);
        }
      }
      await pull();
      syncStatus = state.queue.some((q) => q.error)
        ? state.queue.some(
            (q) => q.error && (q.status === 409 || q.status === 410),
          )
          ? "Konflikt"
          : "Fehler"
        : state.queue.length
          ? "Änderungen ausstehend"
          : "Synchronisiert";
      connect();
      return true;
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
  const drain = async () => {
    // New local work may arrive after the send-loop snapshot. Drain it without
    // waiting for a timer or SSE. A failed request is never retried here.
    while (await perform()) {
      if (!queuedDuringSync || !navigator.onLine || !state.user) break;
    }
  };
  running = (
    navigator.locks ? navigator.locks.request("notera-sync", drain) : drain()
  ).finally(() => {
    running = null;
  });
  return running;
}
export async function discard(key: string) {
  await update((s) => {
    const rejected = s.queue.find((m) => m.key === key);
    if (
      rejected?.entity === "list" &&
      rejected.version === 0 &&
      !s.snapshot.lists.some((l) => l.id === rejected.id)
    ) {
      // Explicitly discarding a never-created list also discards its dependent local changes.
      const tasks = new Set(
        s.queue
          .filter(
            (m) =>
              m.entity === "task" &&
              (m.patch.listId === rejected.id ||
                m.base?.listId === rejected.id),
          )
          .map((m) => m.id),
      );
      s.queue = s.queue.filter(
        (m) =>
          m.id !== rejected.id &&
          !tasks.has(m.id) &&
          !(
            (m.entity === "subtask" || m.entity === "subtaskMove") &&
            tasks.has(String(m.base?.taskId || m.patch.taskId))
          ),
      );
    } else
      s.queue = s.queue.filter(
        (m) =>
          m.key !== key &&
          !(
            m.entity === "completion" &&
            m.patch.action === "undo" &&
            m.patch.key === key
          ),
      );
    return s;
  });
  await sync();
}
export async function correctNewList(
  key: string,
  patch: Record<string, unknown>,
) {
  const parsed = listPatch.safeParse(patch);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const name = listName.safeParse(parsed.data.name);
  if (!name.success)
    throw new Error("Bitte gib einen gültigen Listennamen ein.");
  await update((s) => {
    const rejected = s.queue.find((m) => m.key === key);
    if (
      !rejected ||
      rejected.entity !== "list" ||
      rejected.version !== 0 ||
      !rejected.error
    )
      throw new Error(
        "Diese Änderung wurde bereits bearbeitet. Bitte die Liste erneut öffnen.",
      );
    rejected.patch = { ...rejected.patch, ...parsed.data, name: name.data };
    rejected.key = crypto.randomUUID();
    delete rejected.error;
    delete rejected.status;
    delete rejected.detail;
    return s;
  });
  await sync();
}
export async function resolveConflict(key: string, restore = false) {
  const m = state.queue.find((q) => q.key === key);
  if (!m) return;
  if (
    m.entity === "order" ||
    m.entity === "subtaskMove" ||
    m.entity === "taskConvert"
  )
    throw new Error("Bitte die Aktion verwerfen und das Ziel erneut wählen.");
  const snapshot = state.snapshot;
  let version =
    m.entity === "task" || m.entity === "completion"
      ? snapshot.tasks.find((t) => t.id === m.id)?.version
      : m.entity === "subtask"
        ? snapshot.subtasks?.find((c) => c.id === m.id && !c.deleted)?.version
        : m.entity === "list"
          ? snapshot.lists.find((l) => l.id === m.id)?.version
          : snapshot.preferences[m.id]?.version;
  if (
    m.entity === "subtask" &&
    m.version === 0 &&
    version === undefined &&
    !snapshot.subtasks?.some((c) => c.id === m.id) &&
    snapshot.tasks.some((t) => t.id === m.patch.taskId && !t.deleted)
  )
    version = 0;
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
  if (
    m.entity === "subtask" &&
    snapshot.tasks.find((t) => t.id === (m.base?.taskId || m.patch.taskId))
      ?.deleted
  )
    throw new Error(
      "Hauptaufgabe zuerst im Papierkorb ausdrücklich wiederherstellen.",
    );
  if (m.entity === "completion")
    throw new Error(
      "Bitte diese Aktion verwerfen und an der Hauptaufgabe erneut bestätigen. Rückgängig-Konflikte erfordern eine bewusste manuelle Statusänderung.",
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

export async function dismissNotice() {
  await update((s) => {
    delete s.notice;
    return s;
  });
}
