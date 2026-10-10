import { expect, type Page } from "@playwright/test";

/** A previous global sync label is not an acknowledgement of this submission. */
export async function addTask(page: Page, title: string) {
  const input = page.getByLabel("Neue Aufgabe", { exact: true });
  await input.fill(title);
  const confirmed = page.waitForResponse((response) => {
    const request = response.request();
    if (
      !request.url().endsWith("/api/mutations") ||
      request.method() !== "POST"
    )
      return false;
    const mutation = request.postDataJSON();
    return (
      mutation.entity === "task" &&
      mutation.version === 0 &&
      mutation.patch.title === title.trim()
    );
  });
  const [response] = await Promise.all([confirmed, input.press("Enter")]);
  expect(response.ok(), await response.text()).toBe(true);
  // Rendering happens after the queue's IndexedDB transaction commits.
  await expect(page.getByText(title.trim(), { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(page.locator("button.sync")).toHaveText("Synchronisiert", {
    timeout: 30000,
  });
}

/** Simulate another tab holding the local database write lock during submission. */
export async function addTaskWithStorageContention(page: Page, title: string) {
  await page.evaluate(async () => {
    const testWindow = window as typeof window & {
      releaseTaskWrite?: () => Promise<void>;
      taskSubmitted?: boolean;
    };
    testWindow.taskSubmitted = false;
    document.addEventListener(
      "submit",
      () => {
        testWindow.taskSubmitted = true;
      },
      { once: true },
    );
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("notera-v1");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction("state", "readwrite");
        let released = false;
        const done = new Promise<void>((finish, fail) => {
          transaction.oncomplete = () => {
            db.close();
            finish();
          };
          transaction.onabort = () => {
            db.close();
            fail(transaction.error);
          };
        });
        testWindow.releaseTaskWrite = () => {
          released = true;
          return done;
        };
        // Object methods survive tsx serialization without its module-local __name helper.
        const hold = {
          next() {
            const request = transaction.objectStore("state").get("active");
            request.onsuccess = () => {
              resolve();
              if (!released) hold.next();
            };
            request.onerror = () => reject(request.error);
          },
        };
        hold.next();
      };
    });
  });
  let completed = false;
  const adding = addTask(page, title).then(() => {
    completed = true;
  });
  try {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { taskSubmitted?: boolean })
              .taskSubmitted,
        ),
      )
      .toBe(true);
    // This is the exact stale label that previously let the test reload too early.
    await expect(page.locator("button.sync")).toHaveText("Synchronisiert");
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    expect(
      completed,
      "Task helper must wait for the new write, not the old sync label",
    ).toBe(false);
  } finally {
    await page.evaluate(async () => {
      const testWindow = window as typeof window & {
        releaseTaskWrite?: () => Promise<void>;
        taskSubmitted?: boolean;
      };
      await testWindow.releaseTaskWrite?.();
      delete testWindow.releaseTaskWrite;
      delete testWindow.taskSubmitted;
    });
    await adding;
  }
}
