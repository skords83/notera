import { Database, one } from "./db";
export const tables = [
  "users",
  "lists",
  "memberships",
  "tasks",
  "subtasks",
  "preferences",
  "sync_clock",
  "changes",
  "mutations",
  "devices",
  "reminders",
  "push_subscriptions",
] as const;
export async function backup(db: Database) {
  return db.transaction(async (tx) => {
    const data: Record<string, unknown[]> = {};
    for (const table of tables)
      data[table] = (await tx.query(`SELECT * FROM ${table}`)).rows;
    return {
      format: "notera-3",
      createdAt: new Date().toISOString(),
      tables: data,
    };
  });
}
export async function restore(db: Database, input: any) {
  if (
    !["notera-1", "notera-2", "notera-3"].includes(input?.format) ||
    !input.tables ||
    tables.some(
      (t) =>
        !(
          t === "subtasks" &&
          input.format === "notera-1" &&
          input.tables[t] === undefined
        ) && !Array.isArray(input.tables[t]),
    )
  )
    throw new Error("Ungültiges Sicherungsformat.");
  await db.transaction(async (tx) => {
    const existing = await one(tx, "SELECT count(*) AS n FROM users");
    if (Number(existing.n) > 0)
      throw new Error("Wiederherstellung nur in einer frischen Datenbank.");
    await tx.query("DELETE FROM sync_clock");
    for (const table of tables) {
      const cols = (
        await tx.query(
          "SELECT column_name,data_type FROM information_schema.columns WHERE table_name=$1 AND table_schema=$2",
          [table, "public"],
        )
      ).rows;
      const allowed = new Map(cols.map((c) => [c.column_name, c.data_type]));
      for (const row of input.tables[table] || []) {
        const keys = Object.keys(row);
        if (keys.some((k) => !allowed.has(k)))
          throw new Error("Unbekannte Spalte in Sicherung.");
        const values = keys.map((k) =>
          allowed.get(k) === "jsonb" ? JSON.stringify(row[k]) : row[k],
        );
        await tx.query(
          `INSERT INTO ${table} (${keys.map((k) => '"' + k + '"').join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
          values,
        );
      }
    }
    if (input.format !== "notera-3") {
      await tx.query(
        "WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY list_id ORDER BY updated_at,id) AS n FROM tasks) UPDATE tasks SET position=ranked.n FROM ranked WHERE tasks.id=ranked.id",
      );
      await tx.query(
        "WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY task_id ORDER BY created_at,id) AS n FROM subtasks) UPDATE subtasks SET position=ranked.n FROM ranked WHERE subtasks.id=ranked.id",
      );
    }
  });
}
