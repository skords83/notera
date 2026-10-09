import {
  randomBytes,
  randomUUID,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { Database, change } from "./db";
const scrypt = promisify(rawScrypt);
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 1024)
    throw new Error("Passwort muss 12–1024 Zeichen lang sein.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  const result = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(result, Buffer.from(key, "hex"));
}
export const tokenHash = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export async function createUser(
  db: Database,
  username: string,
  name: string,
  password: string,
  timezone = "Europe/Berlin",
) {
  if (!/^[a-z0-9._-]{2,40}$/.test(username) || !name.trim() || name.length > 80)
    throw new Error(
      "Benutzername: 2–40 Kleinbuchstaben/Ziffern/._-; Anzeigename: 1–80 Zeichen.",
    );
  new Intl.DateTimeFormat("de", { timeZone: timezone });
  const hash = await hashPassword(password);
  const id = randomUUID();
  const inbox = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO users(id,username,name,password,timezone) VALUES($1,$2,$3,$4,$5)",
      [id, username, name.trim(), hash, timezone],
    );
    await tx.query(
      "INSERT INTO lists(id,owner_id,inbox,name) VALUES($1,$2,true,$3)",
      [inbox, id, "Eingang"],
    );
    await tx.query("INSERT INTO memberships VALUES($1,$2)", [inbox, id]);
    await change(tx, "list", inbox);
  });
  return id;
}
