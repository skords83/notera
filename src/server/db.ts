import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readFile } from "node:fs/promises";
export interface Query {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
export class Database implements Query {
  private pool?: pg.Pool;
  private lite?: PGlite;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(url = process.env.DATABASE_URL) {
    if (url) this.pool = new pg.Pool({ connectionString: url });
    else {
      const path = process.env.DATA_DIR || ".data/postgres";
      mkdirSync(dirname(path), { recursive: true });
      this.lite = new PGlite(path);
    }
  }
  async query<T = Record<string, any>>(
    sql: string,
    params: any[] = [],
  ): Promise<{ rows: T[] }> {
    return (
      this.pool
        ? await this.pool.query(sql, params)
        : await this.lite!.query(sql, params)
    ) as { rows: T[] };
  }
  async transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T> {
    const run = async () => {
      if (this.pool) {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT * FROM sync_clock WHERE id=1 FOR UPDATE");
          const result = await fn(client);
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }
      return this.lite!.transaction(async (tx) => fn(tx as Query));
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => {});
    return result;
  }
  async migrate() {
    const exists = await this.query(
      "SELECT to_regclass('public.schema_migrations') AS table",
    );
    if (!exists.rows[0].table) {
      const sql = await readFile(
        new URL("../../migrations/001_initial.sql", import.meta.url),
        "utf8",
      );
      if (this.pool) await this.pool.query(`BEGIN;${sql}COMMIT;`);
      else await this.lite!.exec(`BEGIN;${sql}COMMIT;`);
    }
  }
  async close() {
    await this.tail;
    if (this.pool) await this.pool.end();
    else await this.lite!.close();
  }
}
export async function one(tx: Query, sql: string, args: any[] = []) {
  return (await tx.query(sql, args)).rows[0];
}
export async function change(tx: Query, entity: string, id: string) {
  const row = await one(
    tx,
    "UPDATE sync_clock SET cursor=cursor+1 WHERE id=1 RETURNING cursor",
  );
  await tx.query(
    "INSERT INTO changes(cursor,entity,entity_id) VALUES($1,$2,$3)",
    [row.cursor, entity, id],
  );
  return Number(row.cursor);
}
