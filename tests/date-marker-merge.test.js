import test from "node:test";
import assert from "node:assert/strict";
import { mergeDashboard } from "../src/hub/merge.js";

const slots = (...markers) => Array.from({ length: 8 }, (_, i) => ({ text: "", date: "", time: "", ...markers[i] }));

test("a stale window's Date Markers never wipe a time set in another window", () => {
  // The other window's base was the short raw list; its copy is the same list
  // filled out to 8 slots, so it did not change anything.
  const base = { dateMarkers: [{ text: "Hair", date: "2026-10-30", time: "" }] };
  const stale = { dateMarkers: slots({ text: "Hair", date: "2026-10-30" }) };
  const saved = { dateMarkers: slots({ text: "Hair", date: "2026-10-30", time: "09:00" }) };
  const { data, conflicts } = mergeDashboard(base, stale, saved);
  assert.equal(data.dateMarkers[0].time, "09:00");
  assert.deepEqual(conflicts, []);
});

test("edits to different fields or slots of Date Markers both survive", () => {
  const base = { dateMarkers: slots({ text: "Hair", date: "2026-10-30" }, { text: "Dental", date: "2026-11-14" }) };
  const local = { dateMarkers: slots({ text: "Hair cut", date: "2026-10-30" }, { text: "Dental", date: "2026-11-14" }) };
  const remote = { dateMarkers: slots({ text: "Hair", date: "2026-10-30", time: "09:30" }, { text: "Dental", date: "2026-11-14", time: "14:00" }) };
  const { data, conflicts } = mergeDashboard(base, local, remote);
  assert.deepEqual(data.dateMarkers[0], { text: "Hair cut", date: "2026-10-30", time: "09:30" });
  assert.equal(data.dateMarkers[1].time, "14:00");
  assert.deepEqual(conflicts, []);
});
