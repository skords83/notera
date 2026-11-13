import { expect, type Page } from "@playwright/test";

/** Read only synchronization metadata from the disposable browser profile. */
export async function syncMetadata(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const opening = indexedDB.open("notera-v1");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const request = db
            .transaction("state")
            .objectStore("state")
            .get("active");
          request.onerror = () => {
            db.close();
            reject(request.error);
          };
          request.onsuccess = () => {
            const s = request.result;
            resolve({
              queue:
                s?.queue.map((m: any) => ({
                  key: m.key,
                  entity: m.entity,
                  id: m.id,
                  version: m.version,
                  action: m.patch.action,
                  undoKey: m.patch.key,
                  baseDone: m.base?.done,
                  error: m.error,
                  status: m.status,
                  fields: m.detail?.fields,
                  currentVersion: m.detail?.version,
                })) || [],
              tasks: s?.snapshot.tasks.map((t: any) => ({
                id: t.id,
                version: t.version,
                done: t.done,
                completedAt: t.completedAt,
              })),
              subtasks: s?.snapshot.subtasks?.map((t: any) => ({
                id: t.id,
                version: t.version,
                done: t.done,
              })),
            });
            db.close();
          };
        };
      }),
  );
}

/** Hold the committed response until Undo is durably queued, without timing guesses. */
export async function immediateUndo(
  page: Page,
  complete: () => Promise<void>,
  phase: "request" | "response" = "response",
) {
  let release!: () => void;
  let reached = false;
  const committed = () => {
    reached = true;
  };
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const trace: unknown[] = [];
  const handler = async (route: import("@playwright/test").Route) => {
    const m = route.request().postDataJSON();
    const held = m.entity === "completion" && m.patch.action === "complete";
    if (held && phase === "request") {
      committed();
      await gate;
    }
    const response = await route.fetch();
    trace.push({
      key: m.key,
      entity: m.entity,
      id: m.id,
      version: m.version,
      action: m.patch.action,
      status: response.status(),
      result: await response.json().then((r) => ({
        before: r.before,
        error: r.error,
        fields: r.detail?.fields,
        version: r.detail?.version,
      })),
    });
    if (held && phase === "response") {
      committed();
      await gate;
    }
    await route.fulfill({ response });
  };
  await page.route("**/api/mutations", handler);
  try {
    await complete();
    await expect.poll(() => reached).toBe(true);
    await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
    await expect
      .poll(async () =>
        (await syncMetadata(page)).queue.some((m: any) => m.action === "undo"),
      )
      .toBe(true);
    expect(
      (await syncMetadata(page)).queue.some(
        (m: any) => m.action === "complete",
      ),
    ).toBe(true);
    release();
    await expect
      .poll(async () => (await syncMetadata(page)).queue, { timeout: 15000 })
      .toEqual([]);
    await expect(page.locator("button.sync")).toHaveText("Synchronisiert");
  } catch (error) {
    console.error(
      "Immediate undo metadata",
      JSON.stringify({ trace, state: await syncMetadata(page) }),
    );
    throw error;
  } finally {
    release();
    await page.unroute("**/api/mutations", handler);
  }
}
