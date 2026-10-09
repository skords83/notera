import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { Database } from "../src/server/db";
import { trustedProxyAddresses } from "../src/server/proxy";
import { makeApp } from "../src/server/app";
let db: Database, dir: string;
before(async () => {
  dir = await mkdtemp("/tmp/notera-proxy-");
  process.env.DATA_DIR = dir + "/db";
  db = new Database();
  await db.migrate();
});
after(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});
const origin = "https://notera.test";
test("different clients behind a trusted proxy have separate login budgets", async () => {
  const app = await makeApp(db, {
    origin,
    serve: false,
    trustedProxies: "10.90.0.2/32",
  });
  const attempt = (ip: string) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      remoteAddress: "10.90.0.2",
      headers: { origin, "x-forwarded-for": ip },
      payload: { username: "nobody", password: "wrong" },
    });
  try {
    for (let i = 0; i < 10; i++)
      assert.equal((await attempt("198.51.100.1")).statusCode, 401);
    assert.equal((await attempt("198.51.100.1")).statusCode, 429);
    assert.equal((await attempt("198.51.100.2")).statusCode, 401);
  } finally {
    await app.close();
  }
});

test("a direct client cannot rotate freely supplied forwarding headers to bypass the limit", async () => {
  const app = await makeApp(db, {
    origin,
    serve: false,
    trustedProxies: "10.90.0.2",
  });
  try {
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/login",
        remoteAddress: "198.51.100.10",
        headers: {
          origin,
          "x-forwarded-for": `203.0.113.${i}, 10.90.0.2`,
          "x-real-ip": `192.0.2.${i}`,
          forwarded: `for=192.0.2.${i}`,
        },
        payload: { username: "nobody", password: "wrong" },
      });
      assert.equal(r.statusCode, i < 10 ? 401 : 429);
    }
  } finally {
    await app.close();
  }
});
test("trusted multi-hop chains stop at the nearest untrusted client, ignoring spoofed leftmost addresses", async () => {
  const app = await makeApp(db, {
    origin,
    serve: false,
    trustedProxies: "10.90.0.2/32, 2001:db8:90::2/128",
  });
  try {
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/login",
        remoteAddress: "::ffff:10.90.0.2",
        headers: {
          origin,
          "x-forwarded-for": `203.0.113.${i}, 198.51.100.20, 2001:db8:90::2`,
        },
        payload: { username: "nobody", password: "wrong" },
      });
      assert.equal(r.statusCode, i < 10 ? 401 : 429);
    }
  } finally {
    await app.close();
  }
});
test("unconfigured proxies do not gain trust; a proxy with no forwarding header shares its own budget", async () => {
  const app = await makeApp(db, { origin, serve: false, trustedProxies: "" });
  try {
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/login",
        remoteAddress: "10.90.0.2",
        headers: { origin, "x-forwarded-for": `198.51.100.${i}` },
        payload: { username: "nobody", password: "wrong" },
      });
      assert.equal(r.statusCode, i < 10 ? 401 : 429);
    }
  } finally {
    await app.close();
  }
});
test("proxy configuration rejects blanket trust and malformed networks", () => {
  assert.equal(trustedProxyAddresses("  "), false);
  assert.deepEqual(trustedProxyAddresses("10.90.0.2, 2001:db8::2/128"), [
    "10.90.0.2",
    "2001:db8::2/128",
  ]);
  for (const invalid of [
    "true",
    "false",
    "1",
    "*",
    "0.0.0.0/0",
    "::/0",
    "10.0.0.2/33",
    "::1/129",
    "127.0.0.1,",
    "loopback",
    "10.0.0.2/nope",
  ])
    assert.throws(() => trustedProxyAddresses(invalid), /TRUSTED_PROXIES/);
});
