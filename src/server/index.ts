import { Database } from "./db";
import { makeApp } from "./app";
import { maintain } from "./domain";
const db = new Database();
await db.migrate();
const app = await makeApp(db);
await app.listen({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
});
console.log(`Notera: ${process.env.APP_ORIGIN || "http://localhost:3000"}`);
const timer = setInterval(
  () =>
    maintain(db, Number(process.env.TRASH_DAYS || 30)).catch(() =>
      console.error("Papierkorb-Bereinigung fehlgeschlagen."),
    ),
  3600000,
);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await app.close();
    await db.close();
    process.exit(0);
  });
