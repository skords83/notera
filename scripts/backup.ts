import { readFile, writeFile } from "node:fs/promises";
import { Database } from "../src/server/db";
import { backup, restore } from "../src/server/backup";
const [mode, path] = process.argv.slice(2);
if (!path || !["backup", "restore"].includes(mode))
  throw new Error(
    "Dateipfad angeben: npm run backup -- /sicher/notera.json bzw. npm run restore -- /sicher/notera.json",
  );
const db = new Database();
try {
  await db.migrate();
  if (mode === "backup") {
    await writeFile(path, JSON.stringify(await backup(db)), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      "Sicherung geschrieben. Enthält private Daten und Passwort-Hashes.",
    );
  } else {
    await restore(db, JSON.parse(await readFile(path, "utf8")));
    console.log("Wiederhergestellt. Benutzer müssen sich erneut anmelden.");
  }
} finally {
  await db.close();
}
