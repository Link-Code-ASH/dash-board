import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeState,
  createBackupPayload,
  splitBackupPayload,
  addDays,
  getWeekStart,
} from "../src/dashboard/model.js";
import { readRoute } from "../src/hub/routing.js";
import { mergeDashboard } from "../src/hub/merge.js";

test("item icons remain separate from text and survive reorder, backup and restore", () => {
  const before = normalizeState();
  const preset = before.presets[0];
  const memo = before.memos.cards[0];
  before.itemIcons = {
    [`daily:${preset.key}`]: "📚",
    [`memo:${memo.id}:leftTitle`]: "🧑‍💻",
  };
  before.presets.reverse();
  const restored = normalizeState(
    splitBackupPayload(
      JSON.parse(JSON.stringify(createBackupPayload(before, [], null))),
    ).state,
  );
  assert.deepEqual(restored.itemIcons, before.itemIcons);
  assert.equal(
    restored.presets.find((p) => p.key === preset.key).name,
    preset.name,
  );
  assert.equal(restored.memos.cards[0].leftText, memo.leftText);
  assert.deepEqual(normalizeState({ itemIcons: null }).itemIcons, {});
});

test("icon changes merge with other icons and calendar edits without deleting content", () => {
  const base = {
    itemIcons: { "daily:a": "📚" },
    calendar: { today: "before" },
  };
  const result = mergeDashboard(
    base,
    { ...base, itemIcons: { "weekly:b": "🌿" } },
    {
      itemIcons: { ...base.itemIcons, "edu:c": "🎓" },
      calendar: { today: "after" },
    },
  );
  assert.deepEqual(result.data.itemIcons, { "weekly:b": "🌿", "edu:c": "🎓" });
  assert.equal(result.data.calendar.today, "after");
  assert.equal(result.conflicts.length, 0);
});

test("Monday-based two-week ranges cross month, leap day and year boundaries", () => {
  for (const [date, start, end] of [
    ["2026-12-31", "2026-12-28", "2027-01-10"],
    ["2024-02-29", "2024-02-26", "2024-03-10"],
    ["2026-10-11", "2026-10-05", "2026-10-18"],
  ]) {
    assert.equal(getWeekStart(date), start);
    assert.equal(addDays(start, 13), end);
    assert.equal(
      new Set(Array.from({ length: 14 }, (_, i) => addDays(start, i))).size,
      14,
    );
  }
});

test("date selection retains an explicit displayed week on reload and back navigation", (t) => {
  const original = globalThis.window;
  t.after(() => {
    globalThis.window = original;
  });
  globalThis.window = {
    location: {
      pathname: "/hub/",
      hash: "#/flow/today?date=2026-10-18&week=2026-10-05",
    },
  };
  assert.equal(readRoute().date, "2026-10-18");
  assert.equal(readRoute().week, "2026-10-05");
  window.location.hash = "#/flow/today?date=2027-01-03";
  assert.equal(readRoute().week, "2026-12-28");
});
