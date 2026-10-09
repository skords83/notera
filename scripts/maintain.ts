import { Database } from "../src/server/db";
import { maintain } from "../src/server/domain";
const db = new Database();
try {
  await db.migrate();
  console.log(
    `${await maintain(db, Number(process.env.TRASH_DAYS || 30))} Aufgaben endgültig bereinigt.`,
  );
} finally {
  await db.close();
}
