import { expect, type Page, type BrowserContext } from "@playwright/test";
export async function colorChecks(
  page: Page,
  member: Page,
  context: BrowserContext,
) {
  const sync = async () => {
    await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
      timeout: 30000,
    });
  };
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Farbauswahl");
  await page.getByLabel("Sandra", { exact: true }).check();
  await page.getByRole("radio", { name: "Salbei", exact: true }).check();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await sync();
  await page
    .getByRole("navigation", { name: "Listen", exact: true })
    .getByRole("button", { name: /Farbauswahl/ })
    .click();
  await member
    .getByRole("navigation", { name: "Listen", exact: true })
    .getByRole("button", { name: /Farbauswahl/ })
    .click();
  await expect(
    member.getByRole("button", { name: "Liste verwalten", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Liste verwalten", exact: true })
    .click();
  await page.getByRole("radio", { name: "Petrol", exact: true }).check();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page
    .getByRole("button", { name: "Liste verwalten", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Salbei", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const colorPatches: unknown[] = [];
  const observe = (request: import("@playwright/test").Request) => {
    if (request.url().endsWith("/api/mutations") && request.method() === "POST")
      colorPatches.push(request.postDataJSON().patch);
  };
  page.on("request", observe);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Liste verwalten", exact: true })
    .click();
  await page.getByRole("radio", { name: "Petrol", exact: true }).check();
  await page
    .getByRole("button", { name: "Änderungen speichern", exact: true })
    .click();
  await expect(page.locator(".heading-color")).toHaveCSS(
    "background-color",
    "rgb(141, 191, 192)",
  );
  await page.reload();
  await expect(
    page
      .getByRole("navigation", { name: "Listen", exact: true })
      .getByRole("button", { name: /Farbauswahl/ })
      .locator(".dot"),
  ).toHaveCSS("background-color", "rgb(141, 191, 192)");
  await context.setOffline(false);
  await sync();
  await expect(member.locator(".heading-color")).toHaveCSS(
    "background-color",
    "rgb(141, 191, 192)",
  );
  page.off("request", observe);
  expect(colorPatches).toContainEqual({ color: "teal" });
  expect(colorPatches.every((p) => Object.keys(p as object).length === 1)).toBe(
    true,
  );
  for (const theme of ["dark", "light"]) {
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    await page.locator("dialog select").selectOption(theme);
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      // Reload returns to Eingang; open creation so this also tests narrow navigation.
      if (
        !(await page
          .getByRole("button", { name: "Liste anlegen", exact: true })
          .isVisible())
      )
        await page
          .getByRole("button", { name: "Listen öffnen", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Liste anlegen", exact: true })
        .click();
      const radio = page.getByRole("radio", {
        name: "Automatisch",
        exact: true,
      });
      await radio.focus();
      await radio.press("ArrowRight");
      await expect(
        page.getByRole("radio", { name: "Salbei", exact: true }),
      ).toBeChecked();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/colors-${theme}-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Abbrechen", exact: true })
        .click();
      await page.setViewportSize({ width: 1360, height: 900 });
    }
  }
  await page.reload();
  await sync();
}
