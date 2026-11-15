import { expect, type Page, type BrowserContext } from "@playwright/test";
import { addTask } from "./browser-tasks";

/** Disposable users only. Real Chromium, touch input; not a physical device test. */
export async function taskConversionChecks(
  page: Page,
  context: BrowserContext,
  other: Page,
) {
  const synced = () =>
    expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
      timeout: 30000,
    });
  const item = (p: Page, title: string) =>
    p.locator(".task-item").filter({
      has: p.locator(".task-content > span").getByText(title, { exact: true }),
    });
  const detail = page.locator(".detail-panel");
  const dialog = page.locator(".transfer-dialog");
  await page.setViewportSize({ width: 1360, height: 900 });
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Umwandlungsprüfung");
  await page.getByLabel("Sandra", { exact: true }).check();
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .last()
    .click();
  await synced();
  await page
    .getByRole("button", { name: /Umwandlungsprüfung/ })
    .first()
    .click();
  await page.getByLabel("Erledigte zeigen", { exact: true }).uncheck();
  for (const title of [
    "Filterprojekt",
    "Offene Hauptaufgabe",
    "Erledigte Hauptaufgabe",
    "Ziel erledigt",
    "Mit Notiz",
  ])
    await addTask(page, title);
  await item(page, "Filterprojekt").locator(".task-content").click();
  for (const title of [
    "Erster Schritt",
    "Mittlerer Schritt",
    "Letzter Schritt",
  ]) {
    await detail.getByLabel("Neue Unteraufgabe", { exact: true }).fill(title);
    await detail
      .getByLabel("Neue Unteraufgabe", { exact: true })
      .press("Enter");
    await expect(
      detail.getByLabel("Neue Unteraufgabe", { exact: true }),
    ).toHaveValue("");
  }
  await detail
    .getByRole("button", { name: "Mittlerer Schritt erledigen", exact: true })
    .focus();
  await detail
    .getByRole("button", { name: "Mittlerer Schritt erledigen", exact: true })
    .press("Space");
  await expect(
    detail.getByRole("button", {
      name: "Letzter Schritt erledigen",
      exact: true,
    }),
  ).toBeFocused();
  await expect(detail.locator(".subtask-title")).toHaveText([
    "Erster Schritt",
    "Letzter Schritt",
  ]);
  await expect(detail.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  await expect(detail.getByRole("progressbar")).toHaveAttribute(
    "aria-valuemax",
    "3",
  );
  await synced();
  const saved = async () => {
    const s = await (
      await page.request.get(
        new URL(
          `/api/sync?cursor=0&device=${crypto.randomUUID()}`,
          page.url(),
        ).toString(),
      )
    ).json();
    return s.subtasks.filter((c: any) =>
      ["Erster Schritt", "Mittlerer Schritt", "Letzter Schritt"].includes(
        c.title,
      ),
    );
  };
  const before = await saved();
  await detail
    .getByLabel("Erledigte Unteraufgaben zeigen", { exact: true })
    .check();
  await expect(detail.locator(".subtask-title")).toHaveText([
    "Erster Schritt",
    "Mittlerer Schritt",
    "Letzter Schritt",
  ]);
  await detail
    .getByLabel("Erledigte Unteraufgaben zeigen", { exact: true })
    .uncheck();
  await detail.getByRole("button", { name: "Schließen", exact: true }).click();
  const filter = item(page, "Filterprojekt");
  await filter.locator(".subtask-toggle").click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel("Erledigte zeigen", { exact: true }).tap();
      await expect(filter.locator(".subtask-title")).toHaveText([
        "Erster Schritt",
        "Mittlerer Schritt",
        "Letzter Schritt",
      ]);
      await page.getByLabel("Erledigte zeigen", { exact: true }).tap();
      await expect(filter.locator(".subtask-title")).toHaveText([
        "Erster Schritt",
        "Letzter Schritt",
      ]);
      await filter.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/filter-${theme}-${width}.png`,
        fullPage: true,
      });
      await filter.locator(".task-content").tap();
      await detail
        .getByLabel("Erledigte Unteraufgaben zeigen", { exact: true })
        .tap();
      await expect(detail.locator(".subtask-title")).toHaveCount(3);
      expect(await detail.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/filter-detail-${theme}-${width}.png`,
        fullPage: true,
      });
      await detail.locator(":scope > .task-actions > button").tap();
      const menu = detail.locator(":scope > .task-actions .task-actions-popup");
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      await menu
        .getByRole("button", {
          name: "Als Unteraufgabe verschieben",
          exact: true,
        })
        .tap();
      await expect(dialog.getByRole("alert")).toContainText(
        "eigene Unteraufgaben",
      );
      await dialog
        .getByLabel("Aufgabe suchen", { exact: true })
        .press("Escape");
      await expect(detail).toBeVisible();
      await detail
        .getByLabel("Erledigte Unteraufgaben zeigen", { exact: true })
        .tap();
      await detail
        .getByRole("button", { name: "Schließen", exact: true })
        .tap();
    }
  }
  expect(await saved()).toEqual(before); // filter changes no server data or order.
  await page.setViewportSize({ width: 1360, height: 900 });
  // Local blocker is concrete and keeps all children; menu remains discoverable.
  await filter.locator(".task-row > .task-actions > button").click();
  await page
    .getByRole("button", { name: "Als Unteraufgabe verschieben", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("eigene Unteraufgaben");
  await expect(
    dialog.getByRole("button", { name: "Verschieben", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await item(page, "Mit Notiz").locator(".task-content").click();
  await detail
    .getByRole("textbox", { name: "Notizen", exact: true })
    .fill("Erhalten bleiben");
  await detail.getByRole("button", { name: "Speichern", exact: true }).click();
  await synced();
  await item(page, "Mit Notiz")
    .locator(".task-row > .task-actions > button")
    .click();
  await page
    .getByRole("button", { name: "Als Unteraufgabe verschieben", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Notizen");
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  // Complete source and target; a done step leaves a done target done.
  for (const title of ["Erledigte Hauptaufgabe", "Ziel erledigt"])
    await item(page, title).locator(".task-row > .check-hit").click();
  await page.getByLabel("Erledigte zeigen", { exact: true }).check();
  await synced();
  await item(page, "Erledigte Hauptaufgabe").locator(".task-content").click();
  await detail.locator(":scope > .task-actions > button").focus();
  await detail.locator(":scope > .task-actions > button").press("Enter");
  await detail
    .getByRole("button", { name: "Als Unteraufgabe verschieben", exact: true })
    .click();
  await dialog
    .getByLabel("Aufgabe suchen", { exact: true })
    .fill("Ziel erledigt");
  await dialog
    .getByRole("radio", { name: "Ziel erledigt", exact: true })
    .focus();
  await dialog
    .getByRole("radio", { name: "Ziel erledigt", exact: true })
    .press("Space");
  await dialog
    .getByRole("button", { name: "Verschieben", exact: true })
    .press("Enter");
  await expect(detail).toHaveCount(0);
  await synced();
  await expect(item(page, "Erledigte Hauptaufgabe")).toHaveCount(0);
  await expect(
    item(page, "Ziel erledigt").locator(".task-row > .check-hit"),
  ).toHaveAttribute("aria-pressed", "true");
  // Overview conversion via touch, including offline reload and shared account sync.
  await page.setViewportSize({ width: 320, height: 900 });
  await item(page, "Offene Hauptaufgabe")
    .locator(".task-row > .task-actions > button")
    .tap();
  await page
    .getByRole("button", { name: "Als Unteraufgabe verschieben", exact: true })
    .tap();
  await dialog
    .getByLabel("Aufgabe suchen", { exact: true })
    .fill("Ziel erledigt");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
        true,
      );
      await expect(
        dialog.getByRole("button", { name: "Verschieben", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/convert-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await context.setOffline(true);
  await dialog.getByRole("radio", { name: "Ziel erledigt", exact: true }).tap();
  await dialog.getByRole("button", { name: "Verschieben", exact: true }).tap();
  await expect(item(page, "Offene Hauptaufgabe")).toHaveCount(0);
  await expect(
    item(page, "Ziel erledigt").locator(".task-row > .check-hit"),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await page.getByRole("button", { name: "Listen öffnen", exact: true }).tap();
  await page
    .getByRole("button", { name: /Umwandlungsprüfung/ })
    .first()
    .tap();
  await item(page, "Ziel erledigt").locator(".subtask-toggle").tap();
  await expect(
    item(page, "Ziel erledigt").getByText("Offene Hauptaufgabe", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
  await synced();
  await other
    .getByRole("button", { name: /Umwandlungsprüfung/ })
    .first()
    .click();
  await expect(item(other, "Offene Hauptaufgabe")).toHaveCount(0);
  await item(other, "Ziel erledigt").locator(".subtask-toggle").click();
  await expect(
    item(other, "Ziel erledigt").getByText("Offene Hauptaufgabe", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await other.getByLabel("Erledigte zeigen", { exact: true }).check();
  await expect(
    item(other, "Ziel erledigt").getByText("Erledigte Hauptaufgabe", {
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1360, height: 900 });
  // Another member's private preference is checked on the server, then shown as a conflict.
  await addTask(page, "Mit fremder Markierung");
  await other.getByText("Mit fremder Markierung", { exact: true }).click();
  await other
    .locator(".detail-panel")
    .getByRole("button", { name: "Markieren", exact: true })
    .click();
  await other
    .locator(".detail-panel")
    .getByRole("button", { name: "Schließen", exact: true })
    .click();
  await expect(other.locator("button.sync")).toHaveText("Synchronisiert");
  await item(page, "Mit fremder Markierung")
    .locator(".task-row > .task-actions > button")
    .click();
  await page
    .getByRole("button", { name: "Als Unteraufgabe verschieben", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog
    .getByLabel("Aufgabe suchen", { exact: true })
    .fill("Ziel erledigt");
  await dialog
    .getByRole("radio", { name: "Ziel erledigt", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Verschieben", exact: true })
    .click();
  await expect(page.locator("button.sync")).toHaveText("Konflikt");
  await page.getByRole("button", { name: /Änderungen prüfen/ }).click();
  const conflict = page.getByRole("dialog", {
    name: "Änderungen prüfen",
    exact: true,
  });
  await expect(conflict).toContainText("persönliche Auswahl");
  await expect(conflict).toContainText("Mit fremder Markierung");
  await conflict
    .getByRole("button", { name: "Serverfassung behalten", exact: true })
    .click();
  await conflict
    .getByRole("button", { name: "Schließen", exact: true })
    .click();
  await expect(item(page, "Mit fremder Markierung")).toBeVisible();
}
