import { addTask as add, addTaskWithStorageContention } from "./browser-tasks";
import { colorChecks } from "./browser-colors";
/** Real-browser acceptance run; uses disposable accounts and a temporary database. */
import { chromium, expect, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { Database } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { makeApp } from "../src/server/app";
import { browserRegressions } from "./browser-regressions";
const dir = await mkdtemp(tmpdir() + "/notera-browser-");
process.env.DATA_DIR = dir + "/db";
delete process.env.DATABASE_URL;
const db = new Database();
await db.migrate();
const password = randomBytes(24).toString("hex");
await createUser(db, "sven", "Sven", password);
await createUser(db, "sandra", "Sandra", password);
const origin = "http://127.0.0.1:3217";
const app = await makeApp(db, { origin });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await app.listen({ host: "127.0.0.1", port: 3217 });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    headless: true,
  });
  await mkdir("test-results", { recursive: true });
  const a = await browser.newContext({
    viewport: { width: 1360, height: 900 },
  });
  const b = await browser.newContext();
  const page = await a.newPage();
  const sandra = await b.newPage();
  const page2 = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function login(p: Page, name: string) {
    await p.goto(origin);
    await p.getByLabel("Benutzername", { exact: true }).fill(name);
    await p.getByLabel("Passwort", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "Synchronisiert", exact: true }),
    ).toBeVisible();
  }
  await login(page, "sven");
  await login(sandra, "sandra");
  await login(page2, "sven");
  await colorChecks(page, sandra, a);
  await addTaskWithStorageContention(page, "Privater Gedanke");
  await page.reload();
  await expect(
    page.getByText("Privater Gedanke", { exact: true }),
  ).toBeVisible();
  await expect(
    sandra.getByText("Privater Gedanke", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Gemeinsam");
  await page.getByLabel("Sandra", { exact: true }).check();
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Synchronisiert", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Gemeinsam", exact: false })
    .first()
    .click();
  await add(page, "Gemeinsame Aufgabe");
  await expect(
    sandra.getByRole("button", { name: "Gemeinsam", exact: false }).first(),
  ).toBeVisible({ timeout: 15000 });
  await sandra
    .getByRole("button", { name: "Gemeinsam", exact: false })
    .first()
    .click();
  await expect(
    sandra.getByText("Gemeinsame Aufgabe", { exact: true }),
  ).toBeVisible();
  await sandra
    .getByRole("button", { name: "Gemeinsame Aufgabe erledigen", exact: true })
    .click();
  await expect(
    page.getByText("Gemeinsame Aufgabe", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  await page.getByRole("button", { name: /^Eingang/ }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Synchronisiert", exact: true }),
  ).toBeVisible();
  await a.setOffline(true);
  await page
    .getByLabel("Neue Aufgabe", { exact: true })
    .fill("Offline gespeichert");
  await page.getByLabel("Neue Aufgabe", { exact: true }).press("Enter");
  await expect(
    page.getByText("Offline gespeichert", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Offline gespeichert", { exact: true }),
  ).toBeVisible();
  await a.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Synchronisiert", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page2.getByText("Offline gespeichert", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await add(page, "Langer Titel " + "mit viel Text ".repeat(15));
  for (const theme of ["dark", "light"]) {
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    await page.locator("dialog select").selectOption(theme);
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `test-results/${theme}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1360, height: 900 });
  }
  await browserRegressions(page, a);
  expect(errors).toEqual([]);
  console.log(
    "Browserchecks bestanden: private/geteilte Listen, zwei Browserkonten, Reload, Offline-Reload, Abgleich, 320/360/Desktop ohne Überbreite. Screenshots in test-results/. Sichtprüfung und echte Android-Abnahme separat.",
  );
} catch (error) {
  await mkdir("test-results", { recursive: true });
  for (const [index, page] of (
    browser?.contexts().flatMap((c) => c.pages()) || []
  ).entries()) {
    await page
      .screenshot({ path: `test-results/failure-${index}.png`, fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await app.close();
  await db.close();
  await rm(dir, { recursive: true, force: true });
}
