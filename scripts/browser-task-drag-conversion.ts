import { expect, type Page } from "@playwright/test";
import { addTask } from "./browser-tasks";

export async function taskDragConversionChecks(page: Page, other: Page) {
  await page.setViewportSize({ width: 1360, height: 900 });
  for (const title of ["Drag Quelle", "Drag Ziel"]) await addTask(page, title);
  const item = (title: string) =>
    page.locator(".task-item").filter({
      has: page
        .locator(".task-content > span")
        .getByText(title, { exact: true }),
    });
  const source = item("Drag Quelle"),
    target = item("Drag Ziel");
  const start = async () => {
    await source.locator(".sort-handle").scrollIntoViewIfNeeded();
    const box = (await source.locator(".sort-handle").boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 32);
    await target
      .locator(".conversion-zone")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await target
      .locator(".conversion-zone")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    const zone = (await target.locator(".conversion-zone").boundingBox())!;
    await page.mouse.move(zone.x + zone.width / 2, zone.y + 15);
    await expect(target.locator(".conversion-zone")).toHaveClass(
      /conversion-hover/,
    );
    await expect(page.locator(".insert-before, .insert-after")).toHaveCount(0);
  };
  // Normal sorting remains available on the left edge of the same target.
  await source
    .locator(".sort-handle")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const handle = (await source.locator(".sort-handle").boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(handle.x + 20, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 20, targetBox.y + 2, { steps: 8 });
  await expect(target).toHaveClass(/insert-before/);
  await expect(page.locator(".conversion-hover")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await start();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(source).toHaveCount(1);
  await start();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(source).toHaveCount(1);
  // A source with non-transferable data is visibly blocked before release.
  await source.locator(".task-content").click();
  await page
    .getByRole("textbox", { name: "Notizen", exact: true })
    .fill("Nicht entfernen");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator(".detail-panel")).not.toBeVisible();
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
    timeout: 30000,
  });
  const from = (await source.locator(".sort-handle").boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 32);
  await target
    .locator(".conversion-zone")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const zone = (await target.locator(".conversion-zone").boundingBox())!;
  await page.mouse.move(zone.x + 20, zone.y + 15);
  await expect(target.locator(".conversion-zone")).toHaveClass(
    /conversion-blocked/,
  );
  await expect(target.locator(".conversion-preview")).toContainText("Notizen");
  await page.mouse.up();
  await expect(source).toHaveCount(1);
  await source.locator(".task-content").click();
  await page.getByRole("textbox", { name: "Notizen", exact: true }).fill("");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator(".detail-panel")).not.toBeVisible();
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
    timeout: 30000,
  });
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    await page.locator("dialog select").selectOption(theme);
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await start();
      await expect(target.locator(".subtask-toggle")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await page.screenshot({
        path: `test-results/task-drag-${theme}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  const cdp = await page.context().newCDPSession(page);
  await target.scrollIntoViewIfNeeded();
  const touchFrom = (await source.locator(".sort-handle").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchFrom.x + 20, y: touchFrom.y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchFrom.x + 20, y: touchFrom.y + 32 }],
  });
  await target
    .locator(".conversion-zone")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const touchZone = (await target.locator(".conversion-zone").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchZone.x + 20, y: touchZone.y + 15 }],
  });
  await expect(target.locator(".conversion-zone")).toHaveClass(
    /conversion-hover/,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(source).toHaveCount(1);
  await expect(page.locator(".order-ghost")).toHaveCount(0);
  await cdp.detach();
  await page.getByLabel("Erledigte zeigen", { exact: true }).check();
  await target
    .getByRole("button", { name: "Drag Ziel erledigen", exact: true })
    .click();
  await expect(target.locator(".task-row")).toHaveClass(/done/);
  await page.context().setOffline(true);
  await start();
  await page.mouse.up();
  await expect(source).toHaveCount(0);
  await target.locator(".subtask-toggle").click();
  await expect(target.locator(".subtask-title").last()).toHaveText(
    "Drag Quelle",
  );
  await expect(target.locator(".task-row")).not.toHaveClass(/done/);
  await page.reload();
  const openLists = page.getByRole("button", {
    name: "Listen öffnen",
    exact: true,
  });
  if (await openLists.isVisible()) await openLists.click();
  await page
    .getByRole("button", { name: /Umwandlungsprüfung/ })
    .first()
    .click();
  await expect(source).toHaveCount(0);
  await target.locator(".subtask-toggle").click();
  await expect(target.locator(".subtask-title").last()).toHaveText(
    "Drag Quelle",
  );
  await page.context().setOffline(false);
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
    timeout: 30000,
  });
  const otherTarget = other.locator(".task-item").filter({
    has: other
      .locator(".task-content > span")
      .getByText("Drag Ziel", { exact: true }),
  });
  await expect(otherTarget).toBeVisible({ timeout: 15000 });
  await otherTarget.locator(".subtask-toggle").click();
  await expect(otherTarget.locator(".subtask-title").last()).toHaveText(
    "Drag Quelle",
  );
  // Successful touch conversion appends behind the mouse-converted step.
  await addTask(page, "Touch Drag Quelle");
  const touchSource = item("Touch Drag Quelle");
  await touchSource.locator(".sort-handle").scrollIntoViewIfNeeded();
  const touchBox = (await touchSource.locator(".sort-handle").boundingBox())!;
  const input = await page.context().newCDPSession(page);
  await input.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchBox.x + 20, y: touchBox.y + 20 }],
  });
  await input.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchBox.x + 20, y: touchBox.y + 32 }],
  });
  await target
    .locator(".conversion-zone")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const dropBox = (await target.locator(".conversion-zone").boundingBox())!;
  await input.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: dropBox.x + 20, y: dropBox.y + 15 }],
  });
  await expect(target.locator(".conversion-zone")).toHaveClass(
    /conversion-hover/,
  );
  await input.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(touchSource).toHaveCount(0);
  await expect(target.locator(".subtask-title")).toHaveText([
    "Drag Quelle",
    "Touch Drag Quelle",
  ]);
  for (let index = 0; index < 8; index++)
    await addTask(page, `Randscroll ${index}`);
  const titlesBefore = await page
    .locator(".task-content > span")
    .allTextContents();
  await target
    .locator(".task-row .sort-handle")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const edgeHandle = (await target
    .locator(".task-row .sort-handle")
    .boundingBox())!;
  const beforeScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(edgeHandle.x + 20, edgeHandle.y + 20);
  await page.mouse.down();
  await page.mouse.move(edgeHandle.x + 20, 890);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(beforeScroll + 30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".task-content > span")).toHaveText(titlesBefore);
  // A swipe on ordinary task content scrolls without starting a drag.
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const beforeSwipe = await page.evaluate(() => scrollY);
  await input.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 140, y: 300 }],
  });
  for (const y of [350, 400, 450, 500, 550])
    await input.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 140, y }],
    });
  await input.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeLessThan(beforeSwipe);
  await expect(page.locator(".order-ghost")).toHaveCount(0);
  await expect(page.locator(".task-content > span")).toHaveText(titlesBefore);
  await input.detach();
}
