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
import { isValidMonth, monthCells, shiftMonth } from "../src/hub/calendarMonth.js";
import { symbols } from "../src/hub/symbols.js";

test("monochrome symbols preserve legacy emojis and survive backups", () => {
  const state = normalizeState({ itemIcons: { "daily:a": "book" }, itemSymbols: { "daily:a": { name: "book", color: "#6484b3" } } });
  const restored = normalizeState(splitBackupPayload(JSON.parse(JSON.stringify(createBackupPayload(state, [], null)))).state);
  assert.deepEqual(restored.itemSymbols, state.itemSymbols);
  assert.deepEqual(restored.itemIcons, state.itemIcons);
  assert.deepEqual(normalizeState({ itemSymbols: { bad: { name: "!", color: "red" }, good: { name: "star", color: "invalid" } } }).itemSymbols, { good: { name: "star", color: "#64748b" } });
});

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

test("calendar routes preserve displayed month independently of selected date", (t) => {
  const original = globalThis.window;
  t.after(() => { globalThis.window = original; });
  globalThis.window = { location: { pathname: "/routine/", hash: "#/routine/calendar?date=2026-10-10&week=2026-10-05&month=2027-01" } };
  assert.equal(readRoute().date, "2026-10-10");
  assert.equal(readRoute().month, "2027-01");
  window.location.hash = "#/routine/calendar?date=2026-10-10&month=2026-13";
  assert.equal(readRoute().month, "2026-10");
  window.location.hash = "#/routine/calendar?date=2026-10-10";
  assert.equal(readRoute().month, "2026-10");
});

test("month grids cover leap days and year transitions without changing date keys", () => {
  const february = monthCells("2024-02");
  assert.equal(february.length % 7, 0);
  assert.equal(february.filter(Boolean).length, 29);
  assert.equal(february[3], "2024-02-01");
  assert.ok(february.includes("2024-02-29"));
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
  assert.equal(isValidMonth("0000-01"), false);
  assert.equal(isValidMonth("2026-00"), false);
});

test("311 unique icons retain legacy IDs and searchable English aliases", () => {
  assert.equal(symbols.length, 311);
  assert.equal(new Set(symbols.map((item) => item.name)).size, 311);
  for (const name of ["book", "note", "education", "exercise", "circle", "location"])
    assert.ok(symbols.some((item) => item.name === name && item.Icon));
  assert.ok(symbols.some((item) => item.keywords.includes("subway")));
});
