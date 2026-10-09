import { Database, one } from "./db";
export const tables = [
  "users",
  "lists",
  "memberships",
  "tasks",
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
      format: "notera-1",
      createdAt: new Date().toISOString(),
      tables: data,
    };
  });
}
export async function restore(db: Database, input: any) {
  if (
    input?.format !== "notera-1" ||
    !input.tables ||
    tables.some((t) => !Array.isArray(input.tables[t]))
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
      for (const row of input.tables[table]) {
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
  });
}
