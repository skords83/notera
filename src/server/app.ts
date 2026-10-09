import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import staticFiles from "@fastify/static";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z, ZodError } from "zod";
import { Database, one } from "./db";
import { tokenHash, verifyPassword, hashPassword } from "./auth";
import { mutate, snapshot, DomainError } from "./domain";
import { uuid } from "../shared/model";
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}
export async function makeApp(
  db: Database,
  {
    origin = process.env.APP_ORIGIN || "http://localhost:3000",
    serve = true,
  } = {},
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 128 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  app.decorateRequest("userId", "");
  const dummy = await hashPassword(randomBytes(24).toString("hex"));
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin)
      throw new DomainError(403, "Ungültiger Ursprung. APP_ORIGIN prüfen.");
    if (req.url === "/api/login" || req.url === "/api/health") return;
    const session = req.cookies.notera;
    const user = session
      ? await one(
          db,
          "SELECT user_id FROM sessions WHERE token=$1 AND expires_at>now()",
          [tokenHash(session)],
        )
      : null;
    if (!user)
      throw new DomainError(
        401,
        "Bitte erneut anmelden. Ausstehende Änderungen bleiben auf diesem Gerät.",
      );
    req.userId = user.user_id;
  });
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ZodError)
      return reply
        .code(400)
        .send({ error: err.issues.map((e) => e.message).join(" ") });
    if (err instanceof DomainError)
      return reply
        .code(err.status)
        .send({ error: err.message, detail: err.detail });
    if (err.statusCode)
      return reply
        .code(err.statusCode)
        .send({
          error:
            err.statusCode === 429
              ? "Zu viele Versuche. Bitte später erneut versuchen."
              : "Anfrage ungültig.",
        });
    console.error("Serverfehler", err.code || err.name);
    reply
      .code(500)
      .send({ error: "Serverfehler. Deine Eingabe bleibt erhalten." });
  });
  app.get("/api/health", async () => {
    await db.query("SELECT 1");
    return { ok: true };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const { username, password } = z
        .object({
          username: z.string().max(40),
          password: z.string().max(1024),
        })
        .parse(req.body);
      const u = await one(db, "SELECT * FROM users WHERE username=$1", [
        username.toLowerCase(),
      ]);
      const valid = await verifyPassword(password, u?.password || dummy);
      if (!u || !valid)
        throw new DomainError(401, "Benutzername oder Passwort falsch.");
      const token = randomBytes(32).toString("base64url");
      await db.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '30 days')",
        [tokenHash(token), u.id],
      );
      reply.setCookie("notera", token, {
        httpOnly: true,
        secure: origin.startsWith("https:"),
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 86400,
      });
      return {
        id: u.id,
        username: u.username,
        name: u.name,
        timezone: u.timezone,
      };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    await db.query("DELETE FROM sessions WHERE token=$1", [
      tokenHash(req.cookies.notera || ""),
    ]);
    reply.clearCookie("notera", { path: "/" });
    return { ok: true };
  });
  app.get("/api/me", async (req) =>
    one(db, "SELECT id,username,name,timezone FROM users WHERE id=$1", [
      req.userId,
    ]),
  );
  app.get("/api/sync", async (req) => {
    const q = z
      .object({ cursor: z.coerce.number().int().min(0), device: uuid })
      .parse(req.query);
    return snapshot(db, req.userId, q.cursor, q.device);
  });
  app.post("/api/mutations", async (req) => mutate(db, req.userId, req.body));
  // Events contain only a cursor; task contents always pass through authenticated sync.
  const streams = new Set<import("node:http").ServerResponse>();
  app.get("/api/events", async (req, reply) => {
    reply.hijack();
    const raw = reply.raw;
    streams.add(raw);
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    raw.write(": connected\n\n");
    let stopped = false;
    let last = "";
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const session = await one(
          db,
          "SELECT token FROM sessions WHERE token=$1 AND expires_at>now()",
          [tokenHash(req.cookies.notera || "")],
        );
        if (!session) {
          raw.end();
          return;
        }
        const row = await one(db, "SELECT cursor FROM sync_clock WHERE id=1");
        if (String(row.cursor) !== last) {
          last = String(row.cursor);
          raw.write(`id: ${last}\ndata: ${last}\n\n`);
        } else raw.write(": heartbeat\n\n");
      } catch {
        raw.end();
      } finally {
        busy = false;
      }
    }, 2000);
    raw.on("close", () => {
      stopped = true;
      clearInterval(timer);
      streams.delete(raw);
    });
  });
  app.addHook("preClose", async () => {
    for (const s of streams) s.end();
  });
  if (serve && existsSync(resolve("dist/index.html"))) {
    await app.register(staticFiles, { root: resolve("dist"), maxAge: 0 });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Nicht gefunden." })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
