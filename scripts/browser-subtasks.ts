import { expect, type Page, type BrowserContext } from "@playwright/test";
import { addTask } from "./browser-tasks";
export async function subtaskChecks(page: Page, context: BrowserContext) {
  await addTask(page, "Schatzsuche planen");
  await page.getByText("Schatzsuche planen", { exact: true }).click();
  const input = page.getByLabel("Neue Unteraufgabe", { exact: true });
  await input.fill("   ");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Leerzeichen");
  for (const title of [
    "Hinweise schreiben",
    "Verstecke auswählen",
    "Schatz besorgen",
  ]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
  }
  await page
    .getByRole("button", { name: "Hinweise schreiben bearbeiten", exact: true })
    .click();
  await page
    .getByLabel("Unteraufgabentitel bearbeiten")
    .fill("Hinweise vorbereiten");
  await page.getByLabel("Unteraufgabentitel bearbeiten").press("Enter");
  await page
    .getByRole("button", {
      name: "Hinweise vorbereiten erledigen",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Verstecke auswählen bearbeiten",
      exact: true,
    })
    .click();
  await page.getByLabel("Unteraufgabentitel bearbeiten").press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Verstecke auswählen bearbeiten",
      exact: true,
    }),
  ).toBeFocused();
  await expect(page.locator("dialog .subtasks h3")).toContainText("1 von 3");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("dialog .subtasks").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/subtasks-${theme}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page
          .locator("dialog")
          .evaluate((d) => d.scrollWidth <= d.clientWidth),
      ).toBe(true);
      for (const button of await page
        .locator("dialog .subtask-row > button")
        .all()) {
        const box = await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Schatzsuche planen erledigen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("2 offene Schritte");
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page
    .getByRole("button", { name: "Schatzsuche planen erledigen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Alles erledigen", exact: true })
    .click();
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Synchronisiert", exact: true }),
  ).toBeVisible();
  await page.getByText("Schatzsuche planen", { exact: true }).click();
  await expect(page.locator("dialog .subtasks h3")).toContainText("1 von 3");
  await page
    .getByRole("button", {
      name: "Hinweise vorbereiten wieder öffnen",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Schatz besorgen entfernen", exact: true })
    .click();
  await expect(page.locator("dialog .subtasks h3")).toContainText("0 von 2");
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Synchronisiert", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByLabel("Neue Aufgabe", { exact: true })
    .fill("Offline Vorhaben");
  await page.getByLabel("Neue Aufgabe", { exact: true }).press("Enter");
  await page.getByText("Offline Vorhaben", { exact: true }).click();
  await input.fill("Offline Schritt");
  await input.press("Enter");
  await page
    .getByRole("button", { name: "Offline Schritt erledigen", exact: true })
    .click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.reload();
  await page.getByText("Offline Vorhaben", { exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Offline Schritt wieder öffnen",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Synchronisiert", exact: true }),
  ).toBeVisible({ timeout: 15000 });
}
