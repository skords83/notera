import { expect, type Page, type BrowserContext } from "@playwright/test";

export async function subtaskDragChecks(
  page: Page,
  context: BrowserContext,
  other: Page,
) {
  const item = (p: Page, title: string) =>
    p.locator(".task-item").filter({
      has: p.locator(".task-content > span").getByText(title, { exact: true }),
    });
  const source = () => item(page, "Quelle verschieben");
  const target = () => item(page, "Ziel verschieben");
  await page.setViewportSize({ width: 1360, height: 900 });
  // Previous menu acceptance leaves the step in the source, expanded.
  await page.getByText("Ziel verschieben", { exact: true }).click();
  for (const title of ["Anker A", "Versteckt erledigt", "Anker B"]) {
    await page.getByLabel("Neue Unteraufgabe", { exact: true }).fill(title);
    await page.getByLabel("Neue Unteraufgabe", { exact: true }).press("Enter");
  }
  await page
    .getByRole("button", { name: "Versteckt erledigt erledigen", exact: true })
    .click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  const drag = async (destination: ReturnType<typeof target>, offset = 0.5) => {
    const handle = source().locator(".subtask-row .sort-handle").first();
    await handle.scrollIntoViewIfNeeded();
    const from = (await handle.boundingBox())!;
    const to = (await destination.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * offset, {
      steps: 10,
    });
  };
  if (
    (await target()
      .locator(".subtask-toggle")
      .getAttribute("aria-expanded")) === "true"
  )
    await target().locator(".subtask-toggle").click();
  // Closed target highlights and opens on dwell; Escape restores disclosure.
  await drag(target());
  await expect(target()).toHaveClass(/transfer-hover/);
  await expect(target().getByText("Anker A", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(target().locator(".subtask-row").first()).not.toBeVisible();
  await expect(
    source().getByText("Schritt verschieben", { exact: true }),
  ).toBeVisible();
  // Mouse append to title, then restore source using the existing menu alternative.
  await drag(target());
  await page.mouse.up();
  await target().locator(".subtask-toggle").click();
  await expect(target().locator(".subtask-title").last()).toHaveText(
    "Schritt verschieben",
  );
  const restore = async () => {
    await target()
      .locator(".subtask-row")
      .filter({ hasText: "Schritt verschieben" })
      .locator(".sort-handle")
      .click();
    await page
      .getByRole("button", {
        name: "Zu anderer Aufgabe verschieben",
        exact: true,
      })
      .click();
    await page
      .getByRole("radio", { name: "Quelle verschieben", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Verschieben", exact: true })
      .click();
    await expect(
      source().getByText("Schritt verschieben", { exact: true }),
    ).toBeVisible();
  };
  await restore();
  // Dropping outside and touch cancellation leave the source unchanged.
  await drag(target());
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(
    source().getByText("Schritt verschieben", { exact: true }),
  ).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const touchDrag = async () => {
    const from = (await source()
      .locator(".subtask-row .sort-handle")
      .boundingBox())!;
    const to = (await target().locator(".task-row").boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x + 20, y: from.y + 20 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: to.x + to.width / 2, y: to.y + 20 }],
    });
    await expect(target()).toHaveClass(/transfer-hover/);
  };
  await touchDrag();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(
    source().getByText("Schritt verschieben", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".order-ghost")).toHaveCount(0);
  await touchDrag();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    target().getByText("Schritt verschieben", { exact: true }),
  ).toBeVisible();
  await restore();
  await cdp.detach();
  // Precise placement with a hidden completed sibling and persisted offline queue.
  await context.setOffline(true);
  const anchor = target()
    .locator(".subtask-row")
    .filter({ hasText: "Anker B" });
  await drag(anchor, 0.15);
  await expect(anchor).toHaveClass(/insert-before/);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const b = (await anchor.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + 4);
      await expect(anchor).toHaveClass(/insert-before/);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/drag-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.mouse.up();
  await expect(target().locator(".subtask-title")).toHaveText([
    "Anker A",
    "Schritt verschieben",
    "Anker B",
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: "Listen öffnen", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Verschiebeprüfung/ })
    .first()
    .click();
  await target().locator(".subtask-toggle").click();
  await expect(target().locator(".subtask-title")).toHaveText([
    "Anker A",
    "Schritt verschieben",
    "Anker B",
  ]);
  await context.setOffline(false);
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
    timeout: 30000,
  });
  await expect(
    item(other, "Ziel verschieben").getByText("Schritt verschieben", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Erledigte zeigen", { exact: true }).check();
  await expect(target().locator(".subtask-title")).toHaveText([
    "Anker A",
    "Versteckt erledigt",
    "Schritt verschieben",
    "Anker B",
  ]);
  await page.getByLabel("Erledigte zeigen", { exact: true }).uncheck();
  await page.setViewportSize({ width: 1360, height: 900 });
}
