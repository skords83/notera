import { Temporal } from "@js-temporal/polyfill";
import type { Task } from "./model";

export function taskCount(count: number, view: string): string {
  const noun = count === 1 ? "Aufgabe" : "Aufgaben";
  if (view === "Erledigt")
    return `${count} ${count === 1 ? "erledigte Aufgabe" : "erledigte Aufgaben"}`;
  return `${count} ${noun}${view === "Papierkorb" ? " im Papierkorb" : ""}`;
}

export function formatCalendarDate(date: string): string {
  // A PlainDate has no instant or timezone; never pass a date-only value to Date.
  return Temporal.PlainDate.from(date).toLocaleString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDue(due: Task["due"]): string | null {
  if (!due) return null;
  if (due.kind === "date") return formatCalendarDate(due.date);
  const zoned = Temporal.ZonedDateTime.from(`${due.local}[${due.timezone}]`, {
    disambiguation: "reject",
  });
  return (
    new Intl.DateTimeFormat("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: due.timezone,
      timeZoneName: "short",
    }).format(zoned.epochMilliseconds) + ` · ${due.timezone}`
  );
}
