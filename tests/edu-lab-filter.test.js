import test from "node:test";
import assert from "node:assert/strict";
import { distinct, filterNotes, groupNotes, filterItems, selectedItems, kindLabel, isComplete, sortPrinciples, reviewLabel, usageLabel } from "../src/edu/lab/filter.js";
import { notePatch, noteValues } from "../src/edu/lab/editing.js";

test("lab notes support new kinds, exact scope grouping, and searching Korean text/tags/source", () => {
  const notes = [
    { id: "n1", kind: "idea", scope: "물리학Ⅰ > 역학", title: "충돌", tags: ["운동량"], source: "교재 p.32" },
    { id: "n2", kind: "analogy", scope: "전 과목", title: "비유", body: "생각" },
    { id: "n3", kind: "idea", scope: "물리학Ⅰ > 역학", title: "삭제", deleted_at: "2026-10-11" },
  ];
  assert.deepEqual(filterNotes(notes, { query: "운동량", kind: "idea", scope: "물리학Ⅰ > 역학" }).map((n) => n.id), ["n1"]);
  assert.equal(filterNotes(notes, { query: "P.32" }).length, 1);
  assert.equal(filterNotes(notes, { query: "아이디어" }).length, 1);
  const groups = groupNotes(filterNotes(notes));
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.kind === "analogy").scopes[0].scope, "전 과목");
});

test("free-text kinds that match object prototype names render and group as text", () => {
  for (const kind of ["constructor", "__proto__", "toString"]) assert.equal(kindLabel(kind), kind);
  assert.equal(groupNotes([{ kind: "__proto__", scope: "전 과목" }])[0].kind, "__proto__");
});

test("editing a note title leaves external comma-containing and padded tags untouched", () => {
  const base = { title: "원래 제목", body: "본문", kind: "idea", scope: "전 과목", tags: ["a,b", " padded "], extra: { keep: true } };
  const draft = noteValues(base);
  assert.deepEqual(notePatch(base, draft), {});
  assert.deepEqual(notePatch(base, { ...draft, title: "새 제목" }), { title: "새 제목" });
  assert.deepEqual(notePatch(base, { ...draft, tags: "역학, 충돌, " }), { tags: ["역학", "충돌"] });
  assert.deepEqual(base.tags, ["a,b", " padded "]);
});

test("exam selection keeps click order across filters and excludes deleted/missing records", () => {
  const items = [
    { id: "a", subject: "물리학Ⅰ", unit: "역학", review_state: "unreviewed", usage: "hold", difficulty: "상", stem: "충돌" },
    { id: "b", subject: "화학Ⅰ", unit: "원자", review_state: "applied", usage: "use" },
    { id: "c", subject: "물리학Ⅰ", unit: "역학", usage: "revise", deleted_at: "2026-10-11" },
  ];
  assert.deepEqual(filterItems(items, { subject: "물리학Ⅰ", unit: "역학", review: "unreviewed", usage: "hold", difficulty: "상", query: "충돌" }).map((i) => i.id), ["a"]);
  assert.deepEqual(filterItems(items, { review: "complete" }).map((i) => i.id), ["b"]);
  assert.deepEqual(selectedItems(items, ["b", "c", "unknown", "a"]).map((i) => i.id), ["b", "a"]);
  assert.deepEqual(distinct(items, "unit"), ["역학", "원자"]);
});

test("only applied feedback plus use counts as a finished question; missing values read as defaults", () => {
  assert.equal(isComplete({ review_state: "applied", usage: "use" }), true);
  assert.equal(isComplete({ review_state: "feedback", usage: "use" }), false);
  assert.equal(isComplete({ review_state: "applied", usage: "revised" }), false);
  assert.equal(reviewLabel(undefined), "검토 전");
  assert.equal(usageLabel(undefined), "보류");
  assert.deepEqual(filterItems([{ id: "old" }], { review: "unreviewed", usage: "hold" }).map((i) => i.id), ["old"]);
});

test("principles are listed in writing order and kept out of deleted rows", () => {
  const notes = [
    { id: "p2", kind: "principle", created_at: "2026-10-12T00:00:00Z" },
    { id: "n", kind: "idea", created_at: "2026-10-01T00:00:00Z" },
    { id: "p1", kind: "principle", created_at: "2026-10-11T00:00:00Z" },
    { id: "p0", kind: "principle", created_at: "2026-10-10T00:00:00Z", deleted_at: "2026-10-11" },
  ];
  assert.deepEqual(sortPrinciples(notes).map((n) => n.id), ["p1", "p2"]);
});
