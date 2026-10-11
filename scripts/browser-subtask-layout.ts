import { expect, type Page } from "@playwright/test";
import { addTask } from "./browser-tasks";

/** Real UI fixtures in the browser runner's disposable database. */
export async function subtaskLayoutChecks(page: Page) {
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Home");
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .last()
    .click();
  const home = page.getByRole("button", { name: /^Home/ }).first();
  await home.click();
  const titles = [
    "Wohnzimmer für den Besuch vorbereiten",
    "Wochenende planen und gemeinsam Zeit für einen langen Ausflug mit der Familie finden",
    "Pflanzen gießen",
    "Bücher zurückbringen",
  ];
  const steps = [
    [
      "Tisch freiräumen",
      "Frische Blumen aufstellen",
      "Eine gemütliche Leseecke mit Decken und den Lieblingsbüchern der Kinder vorbereiten",
    ],
    ["Wetter prüfen", "Picknick einpacken"],
    ["Balkon und Küche"],
    [],
  ];
  for (const [index, title] of titles.entries()) {
    await addTask(page, title);
    const row = page
      .locator(".task-item")
      .filter({ has: page.getByText(title, { exact: true }) });
    await expect(row.locator(".task-content small")).toBeHidden();
    if (!steps[index].length) continue;
    await row
      .getByRole("button", { name: `Aktionen für „${title}“`, exact: true })
      .click();
    await row
      .getByRole("button", { name: "Unteraufgabe hinzufügen", exact: true })
      .click();
    const input = row.getByLabel("Neue Unteraufgabe", { exact: true });
    for (const step of steps[index]) {
      await input.fill(step);
      await input.press("Enter");
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
    }
    await input.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (index === 0)
      await row.locator(".inline-subtasks .check-hit").first().click();
    if (index === 2) await row.locator(".subtask-toggle").click();
  }
  const first = page
    .locator(".task-item")
    .filter({ has: page.getByText(titles[0], { exact: true }) });
  await first.locator(".task-content").click();
  const detail = page.getByRole("dialog");
  await detail
    .getByRole("button", { name: "Für heute auswählen", exact: true })
    .click();
  await detail.getByRole("button", { name: "Markieren", exact: true }).click();
  await detail.getByRole("button", { name: "Schließen", exact: true }).click();
  for (const view of ["Alle", "Heute", "Markiert"]) {
    await page
      .getByRole("button", { name: new RegExp(`^${view}`) })
      .first()
      .click();
    await expect(first.locator(".task-content small")).toContainText("Home");
  }
  await home.click();
  await expect(first.locator(".task-content small")).not.toContainText("Home");
  await page.getByLabel("Aufgaben suchen", { exact: true }).fill(titles[0]);
  await expect(first.locator(".task-content small")).toContainText("Home");
  await page.getByRole("button", { name: "Suche leeren", exact: true }).click();
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert");
  await expect(page.locator("button button")).toHaveCount(0);

  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const control of await page
        .locator(".task-item button:visible")
        .all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      await page.screenshot({
        path: `test-results/compact-groups-${theme}-${width}.png`,
        fullPage: true,
      });
      // Always-visible menu and keyboard focus on small screens too.
      const actions = first.locator(".task-actions > button");
      await actions.focus();
      await actions.press("Enter");
      await expect(
        first.getByRole("button", {
          name: "Unteraufgabe hinzufügen",
          exact: true,
        }),
      ).toBeFocused();
      await page.screenshot({
        path: `test-results/compact-menu-${theme}-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(actions).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  await page
    .getByRole("button", { name: /^Eingang/ })
    .first()
    .click();
}
