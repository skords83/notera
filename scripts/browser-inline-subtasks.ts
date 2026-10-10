import { expect, type Page, type BrowserContext } from "@playwright/test";
import { addTask } from "./browser-tasks";

/** Existing signed-in contexts, disposable database from browser-test.ts only. */
export async function inlineSubtaskChecks(
  page: Page,
  context: BrowserContext,
  other: Page,
) {
  const title =
    "Inline Schatzsuche " + "mit sehr langem Titel ".repeat(6).trim();
  const childTitle =
    "Hinweise " + "mitLangenZusammenhängendenWörtern".repeat(4);
  const item = page
    .locator(".task-item")
    .filter({ has: page.getByText(title, { exact: true }) });
  const children = item.locator(".inline-subtasks");
  const toggle = item.locator(".subtask-toggle");
  const progress = item.locator(".task-progress");
  const dialog = page.getByRole("dialog");
  const synced = () =>
    expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
      timeout: 30000,
    });
  await addTask(page, title);
  await expect(toggle).toHaveCount(0);
  await expect(children).toHaveCount(0);
  await expect(item.locator(".task-content small")).toBeHidden();
  const actions = item.getByRole("button", {
    name: `Aktionen für „${title}“`,
    exact: true,
  });
  await actions.focus();
  await actions.press("Enter");
  await page
    .getByRole("button", { name: "Unteraufgabe hinzufügen", exact: true })
    .press("Enter");
  const firstInput = children.getByLabel("Neue Unteraufgabe", { exact: true });
  await expect(firstInput).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await firstInput.fill("Verwerfen");
  await firstInput.press("Escape");
  await expect(children).toHaveCount(0);
  await expect(toggle).toHaveCount(0);
  await expect(actions).toBeFocused();
  await actions.click();
  await page
    .getByRole("button", { name: "Unteraufgabe hinzufügen", exact: true })
    .click();
  await firstInput.fill("   ");
  await firstInput.press("Enter");
  await expect(children.getByRole("alert")).toContainText("Leerzeichen");
  await expect(firstInput).toHaveValue("   ");
  await expect(firstInput).toHaveAttribute("aria-invalid", "true");
  await expect(dialog).toHaveCount(0);
  await firstInput.fill(childTitle);
  await firstInput.press("Enter");
  await expect(firstInput).toHaveValue("");
  await expect(firstInput).toBeFocused();
  await expect(children.locator(".subtask-row")).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(progress).toHaveCount(0);
  await firstInput.press("Escape");
  await toggle.click();
  await item.locator(".task-content").click();
  // The section is directly after the title, with no form nested in another form.
  const titleLabel = dialog.locator(":scope > label").first();
  expect(
    await titleLabel.evaluate((el) =>
      el.nextElementSibling?.classList.contains("subtasks"),
    ),
  ).toBe(true);
  await expect(page.locator("form form")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(children).toBeHidden();
  await expect(progress).toHaveText("0 von 1 erledigt");
  expect(await toggle.getAttribute("aria-controls")).toBe(
    await children.locator("..").getAttribute("id"),
  );
  await toggle.focus();
  await toggle.press("Enter");
  await expect(children).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(progress).toHaveCount(0);
  await toggle.press("Space");
  await expect(children).toBeHidden();
  await expect(dialog).toHaveCount(0);
  await progress.press("Enter");
  await expect(children).toBeVisible();
  await children
    .getByRole("button", { name: `${childTitle} erledigen`, exact: true })
    .focus();
  await children
    .getByRole("button", { name: `${childTitle} erledigen`, exact: true })
    .press("Space");
  await expect(progress).toHaveCount(0);
  await expect(item.locator(".task-row > .check-hit")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(children.locator(".subtask-title")).toHaveClass(/completed/);
  await synced();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(dialog).toHaveCount(0);

  await children
    .getByRole("button", { name: "+ Unteraufgabe", exact: true })
    .focus();
  await children
    .getByRole("button", { name: "+ Unteraufgabe", exact: true })
    .press("Enter");
  const input = children.getByLabel("Neue Unteraufgabe", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("   ");
  await input.press("Enter");
  await expect(children.getByRole("alert")).toContainText("Leerzeichen");
  await expect(input).toHaveValue("   ");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("Verstecke auswählen");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(progress).toHaveCount(0);
  await input.fill("Nicht anlegen");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(
    children.getByRole("button", { name: "+ Unteraufgabe", exact: true }),
  ).toBeFocused();
  await expect(children).not.toContainText("Nicht anlegen");
  await expect(dialog).toHaveCount(0);

  // Parent checkbox keeps its own confirmation and undo semantics.
  await item.locator(".task-row > .check-hit").click();
  await expect(dialog).toHaveAccessibleName("Alle Schritte erledigen?");
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(children).toBeVisible();
  await item.locator(".task-row > .check-hit").click();
  await dialog
    .getByRole("button", { name: "Alles erledigen", exact: true })
    .click();
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(children).toBeVisible();
  await expect(progress).toHaveCount(0);
  await synced();

  // Multiple rows may stay expanded independently.
  await addTask(page, "Zweites Inline-Vorhaben");
  const second = page.locator(".task-item").filter({
    has: page.getByText("Zweites Inline-Vorhaben", { exact: true }),
  });
  await second.locator(".task-content").click();
  await dialog
    .getByLabel("Neue Unteraufgabe", { exact: true })
    .fill("Zweiter Schritt");
  await dialog.getByLabel("Neue Unteraufgabe", { exact: true }).press("Enter");
  await expect(dialog.locator(".subtask-row")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await second.locator(".subtask-toggle").click();
  await expect(children).toBeVisible();
  await expect(second.locator(".inline-subtasks")).toBeVisible();

  // A remote child edit must update both views without resetting the notes draft.
  const syncTitle = "Entwurf bei Synchronisation behalten";
  await addTask(page, syncTitle);
  const syncItem = page
    .locator(".task-item")
    .filter({ has: page.getByText(syncTitle, { exact: true }) });
  await syncItem.locator(".task-content").click();
  await dialog
    .getByLabel("Neue Unteraufgabe", { exact: true })
    .fill("Remote Schritt");
  await dialog.getByLabel("Neue Unteraufgabe", { exact: true }).press("Enter");
  await expect(dialog.locator(".subtask-row")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await syncItem.locator(".task-content").click();
  await dialog
    .getByRole("textbox", { name: "Notizen", exact: true })
    .fill("Noch ungespeicherte Notiz");
  await dialog
    .getByLabel("Links", { exact: false })
    .fill("https://example.com/ungespeichert");
  await other.reload();
  const remoteItem = other
    .locator(".task-item")
    .filter({ has: other.getByText(syncTitle, { exact: true }) });
  const originalRemoteItem = other
    .locator(".task-item")
    .filter({ has: other.getByText(title, { exact: true }) });
  await expect(remoteItem.locator(".task-progress")).toHaveText(
    "0 von 1 erledigt",
  );
  await remoteItem.locator(".subtask-toggle").click();
  await remoteItem
    .getByRole("button", { name: "Remote Schritt erledigen", exact: true })
    .click();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  await expect(dialog.locator(".subtasks h3 small")).toHaveText(
    "Alle 1 erledigt",
  );
  await expect(
    dialog.getByRole("textbox", { name: "Notizen", exact: true }),
  ).toHaveValue("Noch ungespeicherte Notiz", { timeout: 30000 });
  await expect(remoteItem.locator(".task-progress")).toHaveCount(0);
  await expect(remoteItem.locator(".subtask-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await synced();

  await context.setOffline(true);
  await children
    .getByRole("button", { name: "+ Unteraufgabe", exact: true })
    .click();
  await input.fill("Schatz offline besorgen");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(progress).toHaveCount(0);
  await input.press("Escape");
  await children
    .getByRole("button", {
      name: "Schatz offline besorgen erledigen",
      exact: true,
    })
    .click();
  await expect(progress).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await context.setOffline(false);
  await synced();
  await expect(originalRemoteItem.locator(".task-progress")).toHaveText(
    "2 von 3 erledigt",
    { timeout: 15000 },
  );
  await expect(children).toBeVisible();

  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await item.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const control of await item.locator("button:visible").all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      await page.screenshot({
        path: `test-results/inline-subtasks-${theme}-${width}.png`,
        fullPage: true,
      });
      await item.locator(".task-content").click();
      await expect(dialog.getByRole("progressbar")).toHaveAttribute(
        "aria-valuetext",
        "2 von 3 erledigt",
      );
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/detail-subtasks-top-${theme}-${width}.png`,
        fullPage: true,
      });
      await dialog
        .getByRole("button", { name: "Schließen", exact: true })
        .click();
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // Trash retains read access but permits no child writes.
  await item.locator(".task-content").click();
  await dialog
    .getByRole("button", { name: "In den Papierkorb", exact: true })
    .click();
  await synced();
  await page.getByRole("button", { name: /^Papierkorb/ }).click();
  await expect(children).toBeVisible();
  for (const control of await children.locator(".check-hit").all())
    await expect(control).toBeDisabled();
  await expect(
    children.getByRole("button", { name: "+ Unteraufgabe", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `${title} wiederherstellen`, exact: true })
    .click();
  await synced();
  await page.getByRole("button", { name: /^Eingang/ }).click();
  await expect(children).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(progress).toHaveText("2 von 3 erledigt");
}
