import test from "node:test";
import assert from "node:assert/strict";
import { colorCalendarSelection, changeCalendarText, calendarTextSegments } from "../src/dashboard/calendarText.js";
import { normalizeState } from "../src/dashboard/model.js";
import { mergeDashboard } from "../src/hub/merge.js";

test("calendar colors only selected text and preserves surrounding colors on reset", () => {
  const text = "일본어 공부와 운동";
  const marks = colorCalendarSelection(text, [], 0, 6, "red");
  const changed = colorCalendarSelection(text, marks, 4, 6, "blue");
  assert.deepEqual(calendarTextSegments(text, changed).map(v => v.text), ["일본어 ", "공부", "와 운동"]);
  assert.deepEqual(colorCalendarSelection(text, changed, 4, 6, "clear"), [{start:0,end:4,type:"red"}]);
  assert.deepEqual(changeCalendarText(text, "오늘 " + text, marks), [{start:3,end:9,type:"red"}]);
});

test("calendar color ranges survive backup normalization and reject invalid colors", () => {
  const state = { calendar: { "2026-10-10": "일본어" }, calendarFormats: { "2026-10-10": [{start:0,end:3,type:"blue"}, {start:0,end:3,type:"invalid"}], removed: [{start:0,end:2,type:"red"}] } };
  const restored = normalizeState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.calendarFormats, { "2026-10-10": [{start:0,end:3,type:"blue"}] });
});

test("calendar merge keeps text and color offsets together, merges different dates", () => {
  const base = {calendar:{a:"study", b:"walk"}, calendarFormats:{}};
  const local = {calendar:{a:"study", b:"walk"}, calendarFormats:{a:[{start:0,end:5,type:"red"}]}};
  const remote = {calendar:{a:"new study", b:"run"}, calendarFormats:{}};
  const result = mergeDashboard(base,local,remote);
  assert.equal(result.data.calendar.a,"study");
  assert.equal(result.data.calendar.b,"run");
  assert.deepEqual(result.data.calendarFormats,local.calendarFormats);
  assert.equal(result.conflicts.length,1);
  assert.deepEqual(result.conflicts[0].relatedPaths,["/calendarFormats/a"]);
  const deleted = mergeDashboard(base, {calendar:{b:"walk"},calendarFormats:{}}, local);
  assert.equal(deleted.data.calendar.a,undefined);
  assert.equal(deleted.data.calendarFormats.a,undefined);
  assert.equal(deleted.conflicts.length,1);
});
