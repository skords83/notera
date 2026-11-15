import type { Task, Snapshot } from "./model";
/** Local preflight. The server additionally checks every member's private data. */
export function conversionBlockers(task: Task, snapshot: Snapshot): string[] {
  const reasons: string[] = [];
  const children = (snapshot.subtasks || []).filter(
    (c) => c.taskId === task.id,
  );
  if (children.some((c) => !c.deleted))
    reasons.push(
      "eigene Unteraufgaben (keine weitere Verschachtelung möglich)",
    );
  else if (children.length) reasons.push("entfernte Unteraufgaben mit Verlauf");
  if (task.notes) reasons.push("Notizen");
  if (task.links?.length) reasons.push("Links");
  if (task.due) reasons.push("Termin");
  if (task.assignee) reasons.push("Zuweisung");
  const p = snapshot.preferences[task.id];
  if (p?.today || p?.starred || p?.hideOverdue)
    reasons.push("persönliche Auswahl oder Markierung");
  return reasons;
}
