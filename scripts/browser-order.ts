import { expect, type Page, type BrowserContext } from "@playwright/test";
import { addTask } from "./browser-tasks";
export async function orderChecks(
  page: Page,
  context: BrowserContext,
  sandra: Page,
) {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Sortierprüfung");
  await page.getByLabel("Sandra", { exact: true }).check();
  await page
    .getByRole("button", { name: "Liste anlegen", exact: true })
    .last()
    .click();
  const synced = () =>
    expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
      timeout: 30000,
    });
  await synced();
  await page
    .getByRole("button", { name: /Sortierprüfung/ })
    .first()
    .click();
  const titles = [
    "Reihenfolge A mit einem langen Titel " + "und weiterem Text ".repeat(5),
    "Reihenfolge B",
    "Reihenfolge C",
  ];
  for (const title of titles) await addTask(page, title.trim());
  const a = titles[0].trim(),
    b = titles[1],
    c = titles[2];
  const item = (title: string) =>
    page.locator(".task-item").filter({
      has: page
        .locator(".task-content > span")
        .getByText(title, { exact: true }),
    });
  const rows = () =>
    page.locator(".task-row .task-content > span").allTextContents();
  const menu = async (title: string) => {
    const button = item(title).locator(".task-row > .task-actions > button");
    await button.focus();
    await button.press("Enter");
  };
  await menu(a);
  await expect(
    page.getByRole("button", { name: `${a}: Nach oben`, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Unteraufgabe hinzufügen", exact: true })
    .press("Enter");
  const childNames = [
    "Langer Unteraufgabentitel " + "mitZusammenhängendenWörtern".repeat(3),
    "Zweiter Schritt",
    "Dritter Schritt",
  ];
  for (const title of childNames) {
    const input = item(a).getByLabel("Neue Unteraufgabe", { exact: true });
    await input.fill(title);
    await input.press("Enter");
    await expect(input).toHaveValue("");
  }
  await item(a)
    .getByLabel("Neue Unteraufgabe", { exact: true })
    .press("Escape");
  await synced();
  await menu(c);
  await expect(
    page.getByRole("button", { name: `${c}: Nach unten`, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: `${c}: Nach oben`, exact: true })
    .press("Enter");
  await synced();
  await expect.poll(rows).toEqual([a, c, b]);
  await expect(
    item(c).locator(".task-row > .task-actions > button"),
  ).toBeFocused();
  await menu(c);
  await page
    .getByRole("button", { name: `${c}: Nach oben`, exact: true })
    .press("Enter");
  await synced();
  await expect.poll(rows).toEqual([c, a, b]);
  // Dragging a group is isolated from checkbox, disclosure and detail opening.
  const startDrag = async (
    source: ReturnType<typeof item>,
    target: ReturnType<typeof item>,
    after = true,
  ) => {
    const handle = source.locator(
      ":scope > .task-row > .task-actions > .sort-handle",
    );
    await handle.scrollIntoViewIfNeeded();
    const from = (await handle.boundingBox())!,
      to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 20, after ? to.y + to.height - 2 : to.y + 2, {
      steps: 8,
    });
  };
  await startDrag(item(a), item(b));
  await expect(page.locator(".order-ghost .subtask-row")).toHaveCount(3);
  await expect(item(b)).toHaveClass(/insert-after/);
  await page.screenshot({
    path: "test-results/order-drag-group.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(rows).toEqual([c, a, b]);
  await expect(page.locator(".order-ghost")).toHaveCount(0);
  await expect(item(a).locator(".subtask-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await startDrag(item(a), item(b));
  await page.mouse.move(10, 450);
  await page.mouse.up();
  await expect.poll(rows).toEqual([c, a, b]);
  await startDrag(item(c), item(b));
  await page.mouse.up();
  await synced();
  await expect.poll(rows).toEqual([a, b, c]);
  const children = item(a).locator(".subtask-row");
  await children
    .nth(2)
    .getByRole("button", {
      name: `Aktionen für „${childNames[2]}“`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: `${childNames[2]}: Nach oben`, exact: true })
    .click();
  await synced();
  await expect
    .poll(() => children.locator(".subtask-title").allTextContents())
    .toEqual([childNames[0], childNames[2], childNames[1]]);
  await item(a).locator(".task-content").click();
  const dialog = page.getByRole("dialog");
  await expect
    .poll(() => dialog.locator(".subtask-title").allTextContents())
    .toEqual([childNames[0], childNames[2], childNames[1]]);
  const handle = dialog.locator(".subtask-row").nth(2).locator(".sort-handle"),
    first = dialog.locator(".subtask-row").first();
  const from = (await handle.boundingBox())!,
    to = (await first.boundingBox())!;
  await page.mouse.move(from.x + 16, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x + 16, to.y + 2, { steps: 8 });
  await page.mouse.up();
  await synced();
  await expect
    .poll(() => dialog.locator(".subtask-title").allTextContents())
    .toEqual([childNames[1], childNames[0], childNames[2]]);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect
    .poll(() => children.locator(".subtask-title").allTextContents())
    .toEqual([childNames[1], childNames[0], childNames[2]]);
  // Same child order after completion; open/done parent boundaries are independent.
  await children.first().locator(".check-hit").click();
  await synced();
  await expect
    .poll(() => children.locator(".subtask-title").allTextContents())
    .toEqual([childNames[1], childNames[0], childNames[2]]);
  await item(b).locator(".task-row > .check-hit").click();
  await synced();
  await menu(a);
  await page
    .getByRole("button", { name: `${a}: Nach unten`, exact: true })
    .click();
  await synced();
  await expect.poll(rows).toEqual([c, a]);
  await page.getByLabel("Erledigte zeigen", { exact: true }).check();
  await menu(b);
  await expect(
    page.getByRole("button", { name: `${b}: Nach oben`, exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: `${b}: Nach unten`, exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await item(b).locator(".task-row > .check-hit").click();
  await synced();
  await expect.poll(rows).toEqual([b, c, a]);
  await page.getByLabel("Erledigte zeigen", { exact: true }).uncheck();
  // Local pending moves survive offline reload and synchronize to another member.
  await context.setOffline(true);
  await menu(a);
  await page
    .getByRole("button", { name: `${a}: Nach oben`, exact: true })
    .click();
  await expect.poll(rows).toEqual([b, a, c]);
  await page.reload();
  await page
    .getByRole("button", { name: /Sortierprüfung/ })
    .first()
    .click();
  await expect.poll(rows).toEqual([b, a, c]);
  await context.setOffline(false);
  await synced();
  await sandra.setViewportSize({ width: 1360, height: 900 });
  await sandra
    .getByRole("button", { name: /Sortierprüfung/ })
    .first()
    .click();
  await expect
    .poll(() =>
      sandra.locator(".task-row .task-content > span").allTextContents(),
    )
    .toEqual([b, a, c]);
  await item(a).locator(".subtask-toggle").click();
  // All six actual browser layouts, with open menu and expanded long titles.
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [1360, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await menu(a);
      await expect(
        page.getByRole("button", { name: `${a}: Nach oben`, exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/order-${theme}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      const titleX = await children
        .first()
        .locator(".subtask-title")
        .evaluate(
          (el) =>
            el.getBoundingClientRect().left +
            parseFloat(getComputedStyle(el).paddingLeft),
        );
      const addX = await item(a)
        .locator(".subtask-add-trigger")
        .evaluate(
          (el) =>
            el.getBoundingClientRect().left +
            parseFloat(getComputedStyle(el).paddingLeft),
        );
      expect(Math.abs(titleX - addX)).toBeLessThanOrEqual(1);
      await item(a).locator(".task-content").click();
      await page.screenshot({
        path: `test-results/order-detail-${theme}-${width}.png`,
        fullPage: true,
      });
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await dialog
        .getByRole("button", { name: "Schließen", exact: true })
        .click();
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // Search and system views offer no parent sorting.
  const search = page.getByLabel("Aufgaben suchen", { exact: true });
  await search.fill("Reihenfolge");
  await expect(
    page.locator(".task-row > .task-actions > .sort-handle"),
  ).toHaveCount(0);
  await search.fill("");
  for (const name of ["Heute", "Geplant", "Alle", "Markiert", "Papierkorb"]) {
    await page
      .getByRole("button", { name: new RegExp("^" + name) })
      .first()
      .click();
    await expect(
      page.locator(".task-row > .task-actions > .sort-handle"),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: /Sortierprüfung/ })
    .first()
    .click();
  for (let n = 0; n < 24; n++)
    await addTask(page, `Scroll-Aufgabe ${String(n).padStart(2, "0")}`);
  const beforeScroll = await rows();
  const scrollHandle = item(b).locator(
    ".task-row > .task-actions > .sort-handle",
  );
  await scrollHandle.scrollIntoViewIfNeeded();
  const initialScroll = await page.evaluate(() => scrollY),
    box = (await scrollHandle.boundingBox())!;
  await page.mouse.move(box.x + 22, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + 22, 890, { steps: 8 });
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(initialScroll + 100);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await rows()).toEqual(beforeScroll);
  // Touch emulation verifies native scrolling away from the grip and tap-menu access.
  const touch = await context.browser()!.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    storageState: await context.storageState({ indexedDB: true }),
  });
  try {
    const mobile = await touch.newPage();
    await mobile.goto(page.url());
    await mobile
      .getByRole("button", { name: "Listen öffnen", exact: true })
      .tap();
    await mobile
      .getByRole("button", { name: /Sortierprüfung/ })
      .first()
      .tap();
    const mobileRows = mobile.locator(".task-row .task-content > span");
    await expect(mobileRows).toHaveCount(27);
    const mobileItem = mobile
      .locator(".task-item")
      .filter({ has: mobile.getByText(b, { exact: true }) });
    await mobileItem.locator(".task-row > .task-actions > button").tap();
    await mobile
      .getByRole("button", { name: `${b}: Nach unten`, exact: true })
      .tap();
    await expect
      .poll(() => mobileRows.allTextContents())
      .toEqual([a, b, c, ...beforeScroll.slice(3)]);
    const cdp = await touch.newCDPSession(mobile);
    const beforeTouch = await mobile.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 680 }],
    });
    for (let y = 650; y >= 250; y -= 40)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => mobile.evaluate(() => scrollY))
      .toBeGreaterThan(beforeTouch + 100);
    await expect(mobile.locator(".order-ghost")).toHaveCount(0);
    const cancelHandle = mobile
      .locator(".task-row > .task-actions > .sort-handle")
      .first();
    await cancelHandle.scrollIntoViewIfNeeded();
    const cancelBox = (await cancelHandle.boundingBox())!,
      beforeCancel = await mobileRows.allTextContents();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cancelBox.x + 22, y: cancelBox.y + 22 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: cancelBox.x + 22, y: cancelBox.y + 95 }],
    });
    await expect(mobile.locator(".order-ghost")).toHaveCount(1);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(mobile.locator(".order-ghost")).toHaveCount(0);
    expect(await mobileRows.allTextContents()).toEqual(beforeCancel);
  } finally {
    await touch.close();
  }
}
