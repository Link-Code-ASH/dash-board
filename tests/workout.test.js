import test from "node:test";
import assert from "node:assert/strict";
import { getWorkoutTurn, normalizeState } from "../src/dashboard/model.js";

const items = [{ key: "a", name: "하체" }, { key: "b", name: "등" }, { key: "c", name: "가슴" }];

test("WorkOut starts at the first item and moves on only after a done day", () => {
  assert.equal(getWorkoutTurn({ items, log: {} }, "2026-11-06").item.key, "a");
  const log = { "2026-11-03": "a" };
  assert.deepEqual(getWorkoutTurn({ items, log }, "2026-11-03"), { item: items[0], done: true });
  // Days without a workout keep the same turn.
  assert.equal(getWorkoutTurn({ items, log }, "2026-11-04").item.key, "b");
  assert.equal(getWorkoutTurn({ items, log }, "2026-11-09").item.key, "b");
  // After the last item it wraps around.
  assert.equal(getWorkoutTurn({ items, log: { ...log, "2026-11-05": "b", "2026-11-07": "c" } }, "2026-11-08").item.key, "a");
});

test("choosing whose turn it is applies from that day until the next done day", () => {
  const workout = { items, log: { "2026-11-03": "a" }, cursor: { key: "c", date: "2026-11-05" } };
  assert.equal(getWorkoutTurn(workout, "2026-11-04").item.key, "b");
  assert.equal(getWorkoutTurn(workout, "2026-11-05").item.key, "c");
  workout.log["2026-11-06"] = "c";
  assert.equal(getWorkoutTurn(workout, "2026-11-07").item.key, "a");
});

test("old payloads get an empty WorkOut and keep other data", () => {
  const state = normalizeState({ categories: [{ key: "x", label: "X" }] });
  assert.deepEqual(state.workout, { items: [], log: {}, cursor: null });
  assert.equal(getWorkoutTurn(state.workout, "2026-11-06").item, null);
});
