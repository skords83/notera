import { expect, type Page, type BrowserContext } from "@playwright/test";

/** Runs only against the disposable database started by browser-test.ts. */
export async function browserRegressions(page: Page, context: BrowserContext) {
  const dialog = page.getByRole("dialog");
  async function openLists() {
    const toggle = page.getByRole("button", {
      name: "Listen öffnen",
      exact: true,
    });
    if (
      (await toggle.isVisible()) &&
      (await page.locator("aside.sidebar.visible").count()) === 0
    )
      await toggle.click();
  }
  async function createList(name: string) {
    await openLists();
    await page
      .getByRole("button", { name: "Liste anlegen", exact: true })
      .click();
    await dialog.getByLabel("Name", { exact: true }).fill(name);
    await dialog
      .getByRole("button", { name: "Liste anlegen", exact: true })
      .click();
  }
  async function synced() {
    await expect(
      page.getByRole("button", { name: "Synchronisiert", exact: true }),
    ).toBeVisible({ timeout: 15000 });
  }
  async function navigate(name: string) {
    await openLists();
    await page
      .getByRole("navigation", { name: "Listen", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
  }
  for (const width of [1360, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await openLists();
    await page
      .getByRole("button", { name: "Liste anlegen", exact: true })
      .click();
    const name = dialog.getByLabel("Name", { exact: true });
    await name.fill("   ");
    await dialog
      .getByRole("button", { name: "Liste anlegen", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("Leerzeichen");
    await expect(name).toHaveValue("   ");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/list-error-${width}.png`,
      fullPage: true,
    });
    await name.fill(`  Testliste ${width}  `);
    await dialog
      .getByRole("button", { name: "Liste anlegen", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await navigate(`Testliste ${width}`);
    await synced();
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // Offline creation keeps its trimmed name through an actual page reload.
  await context.setOffline(true);
  await createList("  Offline-Projekt  ");
  await navigate("Offline-Projekt");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Offline-Projekt", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await synced();
  await navigate("Offline-Projekt");
  await expect(page.locator(".section-title")).toContainText("0 Aufgaben");
  // Reproduce a server-side validation rejection after client validation succeeded.
  let reject = true;
  await page.route("**/api/mutations", async (route) => {
    const body = route.request().postDataJSON();
    if (
      reject &&
      body.entity === "list" &&
      body.patch.name === "Abgelehnte Liste"
    ) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Die Liste konnte nicht angelegt werden. Bitte den Namen prüfen.",
        }),
      });
      return;
    }
    await route.continue();
  });
  await createList("Abgelehnte Liste");
  await expect(
    page.getByRole("button", { name: "Fehler", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Fehler", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fehler", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Liste korrigieren", exact: true })
    .click();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Abgelehnte Liste",
  );
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("  Korrigierte Liste  ");
  reject = false;
  await dialog
    .getByRole("button", { name: "Änderungen speichern", exact: true })
    .click();
  await synced();
  await page.unroute("**/api/mutations");
  await navigate("Korrigierte Liste");
  await page
    .getByLabel("Neue Aufgabe", { exact: true })
    .fill("Fokus und Rückgängig");
  await page.getByLabel("Neue Aufgabe", { exact: true }).press("Enter");
  await expect(
    page.getByText("Fokus und Rückgängig", { exact: true }),
  ).toBeVisible();
  await synced();
  await expect(page.locator(".section-title")).toContainText("1 Aufgabe");
  await page
    .getByRole("button", { name: /^Fokus und Rückgängig Korrigierte Liste/ })
    .click();
  await dialog.getByLabel("Fälligkeit").selectOption("date");
  await dialog.getByLabel("Datum", { exact: true }).fill("2026-03-29");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await synced();
  await expect(page.locator(".task-content")).toContainText("29. März 2026");
  await page.locator(".task-content").click();
  await dialog.getByLabel("Fälligkeit").selectOption("time");
  await dialog
    .getByLabel("Lokale Uhrzeit", { exact: true })
    .fill("2026-07-01T00:15");
  await dialog.getByLabel("Zeitzone", { exact: true }).fill("Europe/Berlin");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await synced();
  await expect(page.locator(".task-content")).toContainText(
    /1\. Juli 2026.*00:15.*MESZ/,
  );
  // Wide desktop alignment and keyboard focus; the input has one outer focus ring.
  await page.setViewportSize({ width: 1600, height: 1000 });
  const alignment = await page.evaluate(() =>
    [".topbar", ".heading", ".compose", ".section-title"].map(
      (selector) =>
        document.querySelector(selector)!.getBoundingClientRect().left,
    ),
  );
  expect(Math.max(...alignment) - Math.min(...alignment)).toBeLessThan(1);
  for (const width of [1360, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel("Neue Aufgabe", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    expect(
      await page
        .locator(".compose")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("solid");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/focus-date-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.clock.install();
  const toast = page.locator(".toast");
  await page
    .getByRole("button", {
      name: "Fokus und Rückgängig erledigen",
      exact: true,
    })
    .click();
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.clock.fastForward(9000);
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Rückgängig", exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(9000);
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(
    page.getByText("Fokus und Rückgängig", { exact: true }),
  ).toBeVisible();
  // An unrelated rerender does not restart the timer; a NEW completion does.
  await page.getByLabel("Erledigte zeigen", { exact: true }).check();
  await page
    .getByRole("button", {
      name: "Fokus und Rückgängig erledigen",
      exact: true,
    })
    .click();
  await expect(toast).toContainText("Erledigt");
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5000);
  await page
    .getByRole("button", {
      name: "Fokus und Rückgängig wieder öffnen",
      exact: true,
    })
    .click();
  await expect(toast).toContainText("Wieder geöffnet");
  await page.clock.fastForward(4000);
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Fokus und Rückgängig wieder öffnen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Fokus und Rückgängig wieder öffnen",
      exact: true,
    })
    .click();
  await expect(toast).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(8100);
  await expect(toast).toHaveCount(0);
  console.log(
    "Browser regressions passed: rejected-list correction/reload, offline lists, German dates, singular count, keyboard focus, alignment, hover/focus pause and undo both ways, 1360/360/320px.",
  );
}
