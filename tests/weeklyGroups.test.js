import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState, normalizeWeeklyGroups } from "../src/dashboard/model.js";
import { groupWeeklyCategories } from "../src/hub/weeklyGroups.js";

test("weekly groups survive normalizing and drop bad entries", () => {
  const groups = normalizeWeeklyGroups({
    groups: [{ key: "g1", name: "Physical", color: "green" }, { key: "g1", name: "dup" }, { name: "no key" }, { key: "g2", color: "neon" }],
    members: { books: "g1", sports: "", bad: 3 },
  });
  assert.deepEqual(groups.groups, [{ key: "g1", name: "Physical", color: "green" }, { key: "g2", name: "", color: "blue" }]);
  assert.deepEqual(groups.members, { books: "g1" });
  assert.deepEqual(normalizeWeeklyGroups(undefined), { groups: [], members: {} });
});

test("old payloads without weeklyGroups keep categories untouched", () => {
  const state = normalizeState({ categories: [{ key: "a", label: "A", yScore: 1, nScore: -1 }] });
  assert.deepEqual(state.weeklyGroups, { groups: [], members: {} });
  assert.equal(state.categories.length, 1);
});

test("categories are shown group by group, ungrouped last", () => {
  const categories = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
  const { sections } = groupWeeklyCategories(categories, {
    groups: [{ key: "g2", name: "Digital" }, { key: "g1", name: "Physical" }],
    members: { a: "g1", b: "g2", d: "g1", c: "gone" },
  });
  assert.deepEqual(sections.map((s) => [s.group?.key ?? null, s.rows.map((r) => r.key)]),
    [["g2", ["b"]], ["g1", ["a", "d"]], [null, ["c"]]]);
  const plain = groupWeeklyCategories(categories, undefined).sections;
  assert.equal(plain.length, 1);
  assert.equal(plain[0].group, null);
});
