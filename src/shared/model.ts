import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { listColorSchema, type ListColor } from "./listColors";
export const TITLE_MAX = 240;
export const uuid = z.string().uuid();
export const LIST_NAME_MAX = 80;
export const listName = z
  .string()
  .trim()
  .min(
    1,
    "Bitte gib einen Listennamen ein, der nicht nur aus Leerzeichen besteht.",
  )
  .max(LIST_NAME_MAX, "Der Listenname darf höchstens 80 Zeichen lang sein.");
export const listPatch = z
  .object({
    name: listName,
    color: listColorSchema,
    members: z.array(uuid).max(20),
    deleted: z.boolean(),
  })
  .partial()
  .strict();
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return Temporal.PlainDate.from(v).toString() === v;
    } catch {
      return false;
    }
  }, "Ungültiges Datum");
export const dueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), date: day }).strict(),
  z
    .object({
      kind: z.literal("time"),
      local: z.string(),
      timezone: z.string(),
    })
    .strict()
    .superRefine((v, c) => {
      try {
        Temporal.ZonedDateTime.from(`${v.local}[${v.timezone}]`, {
          disambiguation: "reject",
        });
      } catch {
        c.addIssue({
          code: "custom",
          message:
            "Uhrzeit oder Zeitzone ungültig; bei Zeitumstellung eindeutige Uhrzeit wählen.",
        });
      }
    }),
]);
export const taskPatch = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    notes: z.string().max(20000),
    links: z
      .array(
        z
          .string()
          .url()
          .max(2048)
          .refine((v) => /^https?:\/\//i.test(v), "Nur HTTP/HTTPS-Links"),
      )
      .max(20),
    listId: uuid,
    assignee: uuid.nullable(),
    due: dueSchema.nullable(),
    done: z.boolean(),
    deleted: z.boolean(),
  })
  .partial()
  .strict();
export const prefPatch = z
  .object({
    today: day.nullable(),
    starred: z.boolean(),
    hideOverdue: day.nullable(),
  })
  .partial()
  .strict();
export type TaskData = {
  title: string;
  notes: string;
  links: string[];
  listId: string;
  assignee: string | null;
  due: z.infer<typeof dueSchema> | null;
  done: boolean;
  deleted: boolean;
  completedAt: string | null;
};
export type Task = TaskData & {
  id: string;
  version: number;
  updatedAt: string;
  createdBy: string;
};
export type Preference = {
  today: string | null;
  starred: boolean;
  hideOverdue: string | null;
  version: number;
};
export type List = {
  id: string;
  ownerId: string;
  color?: ListColor; // Optional for pre-upgrade offline snapshots.
  inbox: boolean;
  name: string;
  version: number;
  members: string[];
};
export type User = {
  id: string;
  username: string;
  name: string;
  timezone: string;
};
export type Snapshot = {
  userId?: string;
  cursor: number;
  reset: boolean;
  lists: List[];
  tasks: Task[];
  preferences: Record<string, Preference>;
  users: User[];
};
export const mutationSchema = z
  .object({
    key: uuid,
    device: uuid,
    entity: z.enum(["task", "preference", "list"]),
    id: uuid,
    version: z.number().int().min(0),
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();
export type Mutation = z.infer<typeof mutationSchema>;
export function today(zone = "Europe/Berlin") {
  return Temporal.Now.plainDateISO(zone).toString();
}
export function dueDay(due: Task["due"], zone: string) {
  if (!due) return null;
  return due.kind === "date"
    ? due.date
    : Temporal.ZonedDateTime.from(`${due.local}[${due.timezone}]`, {
        disambiguation: "reject",
      })
        .withTimeZone(zone)
        .toPlainDate()
        .toString();
}
export function todaySection(
  t: Task,
  p: Preference | undefined,
  date: string,
  zone: string,
) {
  const d = dueDay(t.due, zone);
  if (d && d < date) return p?.hideOverdue === date ? null : "Überfällig";
  if (d === date || p?.today === date) return "Heute";
  if (p?.today && p.today < date) return "Nicht geschafft";
  return null;
}
