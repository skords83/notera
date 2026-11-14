import { expect, type Page, type BrowserContext } from "@playwright/test";
import { addTask } from "./browser-tasks";

export async function subtaskMoveChecks(
  page: Page,
  context: BrowserContext,
  other: Page,
) {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Verschiebeprüfung");
  await page.getByLabel("Sandra", { exact: true }).check();
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .last()
    .click();
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert");
  await page
    .getByRole("button", { name: /Verschiebeprüfung/ })
    .first()
    .click();
  for (const title of [
    "Quelle verschieben",
    "Ziel verschieben",
    "Papierkorbziel",
  ])
    await addTask(page, title);
  const item = (p: Page, title: string) =>
    p.locator(".task-item").filter({
      has: p.locator(".task-content > span").getByText(title, { exact: true }),
    });
  await page.getByText("Papierkorbziel", { exact: true }).click();
  await page
    .getByRole("button", { name: /Papierkorb/ })
    .last()
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.getByText("Quelle verschieben", { exact: true }).click();
  await page
    .getByLabel("Neue Unteraufgabe", { exact: true })
    .fill("Schritt verschieben");
  await page.getByLabel("Neue Unteraufgabe", { exact: true }).press("Enter");
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert");
  const menu = () =>
    page.locator("dialog .subtask-row .task-actions > button").click();
  await menu();
  await page
    .getByRole("button", {
      name: "Zu anderer Aufgabe verschieben",
      exact: true,
    })
    .click();
  const dialog = page.locator(".transfer-dialog");
  await expect(dialog.getByRole("radio")).toHaveCount(1);
  await dialog.getByLabel("Aufgabe suchen").fill("fehlt");
  await expect(
    dialog.getByText("Keine passende Aufgabe gefunden."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await menu();
  await page
    .getByRole("button", {
      name: "Zu anderer Aufgabe verschieben",
      exact: true,
    })
    .click();
  await dialog.getByLabel("Aufgabe suchen").press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("dialog.detail-panel")).toBeVisible();
  await menu();
  await page
    .getByRole("button", {
      name: "Zu anderer Aufgabe verschieben",
      exact: true,
    })
    .click();
  await dialog.getByLabel("Aufgabe suchen").fill("Ziel");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/move-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // Radio choice, confirmation and cancellation are native keyboard controls.
  await dialog.getByRole("radio", { name: "Ziel verschieben" }).focus();
  await dialog.getByRole("radio", { name: "Ziel verschieben" }).press("Space");
  await dialog
    .getByRole("button", { name: "Verschieben", exact: true })
    .focus();
  await dialog
    .getByRole("button", { name: "Verschieben", exact: true })
    .press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(
    other.getByRole("button", { name: /Verschiebeprüfung/ }).first(),
  ).toBeVisible();
  await other
    .getByRole("button", { name: /Verschiebeprüfung/ })
    .first()
    .click();
  await item(other, "Ziel verschieben").locator(".subtask-toggle").click();
  await expect(
    item(other, "Ziel verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    item(other, "Quelle verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toHaveCount(0);
  // Move in overview using touch-sized controls, persisted while offline.
  await page.setViewportSize({ width: 320, height: 900 });
  await item(page, "Ziel verschieben").locator(".subtask-toggle").tap();
  const row = item(page, "Ziel verschieben").locator(".subtask-row");
  await row.locator(".task-actions > button").tap();
  await page
    .getByRole("button", {
      name: "Zu anderer Aufgabe verschieben",
      exact: true,
    })
    .tap();
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).tap();
  await row.locator(".task-actions > button").tap();
  await page
    .getByRole("button", {
      name: "Zu anderer Aufgabe verschieben",
      exact: true,
    })
    .tap();
  await context.setOffline(true);
  await dialog.getByRole("radio", { name: "Quelle verschieben" }).tap();
  await dialog.getByRole("button", { name: "Verschieben", exact: true }).tap();
  await item(page, "Quelle verschieben").locator(".subtask-toggle").tap();
  await expect(
    item(page, "Quelle verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Listen öffnen", exact: true }).tap();
  await page
    .getByRole("button", { name: /Verschiebeprüfung/ })
    .first()
    .tap();
  await item(page, "Quelle verschieben").locator(".subtask-toggle").tap();
  await expect(
    item(page, "Quelle verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
    timeout: 30000,
  });
  await item(other, "Quelle verschieben").locator(".subtask-toggle").click();
  await expect(
    item(other, "Quelle verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    item(other, "Ziel verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1360, height: 900 });
}
