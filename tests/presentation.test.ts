import { test } from "node:test";
import assert from "node:assert/strict";
import { listName } from "../src/shared/model";
import { formatDue, taskCount } from "../src/shared/presentation";
test("shared list-name rules reject whitespace and trim valid names", () => {
  for (const name of ["", "  ", "\t\n", "\u00a0", "x".repeat(81)])
    assert.equal(listName.safeParse(name).success, false);
  assert.equal(listName.parse("  Zuhause  "), "Zuhause");
  assert.equal(listName.parse("x".repeat(80)).length, 80);
});
test("task count is singular or plural in normal, completed and trash views", () => {
  assert.equal(taskCount(1, "Eingang"), "1 Aufgabe");
  assert.equal(taskCount(0, "Alle"), "0 Aufgaben");
  assert.equal(taskCount(2, "Heute"), "2 Aufgaben");
  assert.equal(taskCount(1, "Erledigt"), "1 erledigte Aufgabe");
  assert.equal(taskCount(2, "Erledigt"), "2 erledigte Aufgaben");
  assert.equal(taskCount(1, "Papierkorb"), "1 Aufgabe im Papierkorb");
  assert.equal(taskCount(0, "Papierkorb"), "0 Aufgaben im Papierkorb");
});
test("German due labels preserve calendar dates in every machine timezone", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of [
      "Europe/Berlin",
      "Pacific/Honolulu",
      "Pacific/Kiritimati",
    ]) {
      process.env.TZ = zone;
      assert.equal(
        formatDue({ kind: "date", date: "2026-03-29" }),
        "29. März 2026",
      );
      assert.equal(
        formatDue({ kind: "date", date: "2028-02-29" }),
        "29. Februar 2028",
      );
      assert.match(
        formatDue({
          kind: "time",
          local: "2026-07-01T00:15",
          timezone: "Europe/Berlin",
        })!,
        /1\. Juli 2026.*00:15.*MESZ.*Europe\/Berlin/,
      );
      assert.match(
        formatDue({
          kind: "time",
          local: "2026-01-01T00:15",
          timezone: "Europe/Berlin",
        })!,
        /1\. Januar 2026.*00:15.*MEZ.*Europe\/Berlin/,
      );
      assert.match(
        formatDue({
          kind: "time",
          local: "2026-07-01T23:45",
          timezone: "America/New_York",
        })!,
        /1\. Juli 2026.*23:45.*America\/New_York/,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
  assert.equal(formatDue(null), null);
});
