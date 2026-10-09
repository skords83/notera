import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
const [username, name, timezone = "Europe/Berlin"] = process.argv.slice(2);
if (!username || !name) {
  console.error(
    'Aufruf: npm run user:add -- benutzername "Anzeigename" [Zeitzone]\nPasswort interaktiv oder NOTERA_BOOTSTRAP_PASSWORD über ein Secret setzen.',
  );
  process.exit(1);
}
async function password() {
  if (process.env.NOTERA_BOOTSTRAP_PASSWORD)
    return process.env.NOTERA_BOOTSTRAP_PASSWORD;
  if (!stdin.isTTY)
    throw new Error("Interaktives Terminal oder Passwort-Secret erforderlich.");
  stdout.write("Neues Passwort (mindestens 12 Zeichen): ");
  stdin.setRawMode(true);
  stdin.resume();
  let text = "";
  return new Promise<string>((resolve, reject) => {
    const onData = (buf: Buffer) => {
      for (const char of buf.toString()) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Abgebrochen"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(text);
          return;
        }
        if (char === "\u007f") {
          text = text.slice(0, -1);
        } else if (char >= " ") text += char;
      }
    };
    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }
    stdin.on("data", onData);
  });
}
const db = new Database();
try {
  const secret = await password();
  await db.migrate();
  await createUser(db, username, name, secret, timezone);
  console.log(`Konto ${username} mit privatem Eingang angelegt.`);
} finally {
  await db.close();
}
