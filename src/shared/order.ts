import { z } from "zod";
import { uuid, type Snapshot, type Task, type Subtask } from "./model";
export const orderPatch = z
  .object({
    kind: z.enum(["task", "subtask"]),
    scopeId: uuid,
    anchorId: uuid,
    anchorVersion: z.number().int().min(0),
    side: z.enum(["before", "after"]),
    done: z.boolean().optional(),
  })
  .strict();
export type OrderPatch = z.infer<typeof orderPatch>;
export function ordered<T extends { id: string; position?: number }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id),
  );
}
export function initializeOrder(s: Snapshot) {
  for (const list of s.lists) {
    const rows = s.tasks
      .filter((t) => t.listId === list.id)
      .sort(
        (a, b) =>
          a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
      );
    rows.forEach((t, i) => {
      t.position ??= i + 1;
      t.orderVersion ??= 0;
    });
  }
  const children = [...(s.subtasks || [])].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  children.forEach((c, i) => {
    c.position ??= i + 1;
    c.orderVersion ??= 0;
  });
}
export function scopeRows(
  s: Snapshot,
  p: Pick<OrderPatch, "kind" | "scopeId">,
): (Task | Subtask)[] {
  return ordered<Task | Subtask>(
    p.kind === "task"
      ? s.tasks.filter((t) => t.listId === p.scopeId)
      : (s.subtasks || []).filter((c) => c.taskId === p.scopeId),
  );
}
// Move only the requested ID: invisible siblings retain their relative order.
export function relocate<T extends { id: string }>(
  rows: T[],
  id: string,
  anchor: string,
  side: "before" | "after",
): T[] {
  const moving = rows.find((r) => r.id === id);
  if (!moving || id === anchor || !rows.some((r) => r.id === anchor))
    return rows;
  const result = rows.filter((r) => r.id !== id);
  result.splice(
    result.findIndex((r) => r.id === anchor) + Number(side === "after"),
    0,
    moving,
  );
  return result;
}
export function projectOrder(s: Snapshot, id: string, p: OrderPatch) {
  const rows = scopeRows(s, p);
  const moving = rows.find((r) => r.id === id),
    anchor = rows.find((r) => r.id === p.anchorId);
  if (!moving || !anchor || moving.deleted || anchor.deleted) return;
  if (p.kind === "task" && (moving.done !== p.done || anchor.done !== p.done))
    return;
  relocate(rows, id, p.anchorId, p.side).forEach((r, i) => {
    r.position = i + 1;
  });
  moving.orderVersion = (moving.orderVersion || 0) + 1;
}
