import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState, createFallbackState, createBackupPayload, splitBackupPayload } from "../src/dashboard/model.js";
import { mergeDashboard } from "../src/hub/merge.js";
import {
  assertDashboardWriteScope, stageDashboardSnapshot, flushDashboardSnapshots, readStoredSnapshot,
} from "../src/dashboard/syncState.js";
import { applyEduAction, reconcilePromotions, currentGrade, pendingTransitions } from "../src/edu/model.js";

const at = new Date("2026-10-11T02:00:00Z");
function fixture() {
  return applyEduAction(createFallbackState().edu, {
    type: "student.save",
    values: { name: "김하늘", birthYear: 2011, school: "푸른중학교", grade: 9, studentPhone: "010-1111-2222", guardianPhone: "010-3333-4444" },
  }, { now: at, actor: "alice" });
}
function memoryStorage() {
  const items = new Map();
  return {
    get length() { return items.size; },
    key(index) { return [...items.keys()][index] ?? null; },
    getItem(key) { return items.get(key) ?? null; },
    setItem(key, value) { items.set(key, String(value)); },
    removeItem(key) { items.delete(key); },
  };
}

test("old Dashboard snapshots get empty Edu; full backups round trip all Edu records", () => {
  assert.deepEqual(normalizeState({ calendar: { today: "keep" } }).edu, { version: 1, students: [], consultations: [], events: [] });
  let edu = fixture();
  edu = applyEduAction(edu, { type: "memo.save", studentId: edu.students[0].id, memo: "보호자와 학습 계획 상담" }, { now: at });
  const state = normalizeState({ edu, calendar: { today: "keep" } });
  const payload = JSON.parse(JSON.stringify(createBackupPayload(state, [])));
  assert.deepEqual(normalizeState(splitBackupPayload(payload).state).edu, edu);
  assert.equal(payload.calendar.today, "keep");
});

test("unsupported or damaged Edu snapshots stay intact in Dashboard normalization and backup", () => {
  for (const edu of [{ version: 42, future: ["keep"] }, { version: 1, students: "damaged", consultations: [], events: [] }]) {
    const state = normalizeState({ edu });
    assert.deepEqual(state.edu, edu);
    assert.deepEqual(createBackupPayload(state, []).edu, edu);
  }
});

test("concurrent manual grade corrections merge the complete anchor atomically", () => {
  const edu = fixture();
  const base = { edu };
  const local = structuredClone(base);
  const remote = structuredClone(base);
  const before = base.edu.students[0].academic;
  local.edu.students[0].academic = { ...before, referenceGrade: 10, referenceId: "local-anchor" };
  remote.edu.students[0].academic = { ...before, referenceYear: 2028, referenceId: "remote-anchor" };
  const merged = mergeDashboard(base, local, remote);
  assert.deepEqual(merged.data.edu.students[0].academic, local.edu.students[0].academic);
  assert.equal(merged.conflicts.length, 1);
  assert.match(merged.conflicts[0].path, /^\/edu\/students\/@id=.*\/academic$/);
  assert.deepEqual(merged.conflicts[0].remote, remote.edu.students[0].academic);
});

test("two windows retain independent student fields and both histories", () => {
  const edu = fixture();
  const id = edu.students[0].id;
  const local = applyEduAction(edu, { type: "memo.save", studentId: id, memo: "왼쪽 창의 메모" }, { now: at });
  const remote = applyEduAction(edu, { type: "student.save", id, values: { ...edu.students[0], grade: 9, guardianPhone: "010-5555-6666" } }, { now: at });
  const merged = mergeDashboard({ edu }, { edu: local }, { edu: remote });
  assert.equal(merged.data.edu.students[0].memo, "왼쪽 창의 메모");
  assert.equal(merged.data.edu.students[0].guardianPhone, "010-5555-6666");
  assert.equal(merged.data.edu.events.length, 3);
  assert.deepEqual(merged.conflicts, []);
});

test("same-field conflicts retain histories and both sides in recovery diagnostics", () => {
  const edu = fixture();
  const id = edu.students[0].id;
  const local = applyEduAction(edu, { type: "memo.save", studentId: id, memo: "local" }, { now: at });
  const remote = applyEduAction(edu, { type: "memo.save", studentId: id, memo: "remote" }, { now: at });
  const result = mergeDashboard({ edu }, { edu: local }, { edu: remote });
  assert.equal(result.data.edu.students[0].memo, "local");
  assert.equal(result.data.edu.events.length, 3);
  assert(result.conflicts.some((item) => item.local === "local" && item.remote === "remote"));
});

test("simultaneous rollover generates one event; confirmation survives later sync", () => {
  const edu = fixture();
  const id = edu.students[0].id;
  const nextYear = new Date("2026-12-31T15:00:00Z");
  const local = reconcilePromotions(edu, nextYear);
  const remote = reconcilePromotions(edu, new Date("2027-04-01T00:00:00Z"));
  const result = mergeDashboard({ edu }, { edu: local }, { edu: remote });
  assert.equal(result.data.edu.events.length, 2);
  assert.equal(currentGrade(result.data.edu.students[0], nextYear), 10);
  assert.equal(pendingTransitions(result.data.edu, id).length, 1);
  assert.deepEqual(result.conflicts, []);
  const confirmed = applyEduAction(result.data.edu, { type: "promotion.confirm", studentId: id }, { now: nextYear });
  const after = mergeDashboard({ edu: local }, { edu: confirmed }, { edu: remote });
  assert.equal(pendingTransitions(after.data.edu, id).length, 0);
});

test("a manual correction and remote rollover retain a valid anchor and transition history", () => {
  const edu = fixture();
  const id = edu.students[0].id;
  const now = new Date("2026-12-31T15:00:00Z");
  const remote = reconcilePromotions(edu, now);
  const corrected = applyEduAction(edu, { type: "student.save", id, values: { ...edu.students[0], grade: 11 } }, { now });
  const result = mergeDashboard({ edu }, { edu: corrected }, { edu: remote });
  assert.equal(currentGrade(result.data.edu.students[0], now), 11);
  assert.equal(currentGrade(result.data.edu.students[0], new Date("2027-12-31T15:00:00Z")), 12);
  assert.equal(pendingTransitions(result.data.edu, id).length, 1);
});

test("local journal stores data and history together and retains the draft after storage failure", () => {
  const storage = memoryStorage();
  const base = normalizeState({ edu: fixture() });
  const id = base.edu.students[0].id;
  const next = { ...base, edu: applyEduAction(base.edu, { type: "memo.save", studentId: id, memo: "keep after failure" }, { now: at }) };
  storage.setItem("edu-owner", JSON.stringify(base));
  stageDashboardSnapshot(storage, "edu-owner", "window", base, next);
  const setter = storage.setItem;
  storage.setItem = (key, value) => { if (key === "edu-owner") throw new Error("Quota exceeded"); setter(key, value); };
  assert.throws(() => flushDashboardSnapshots(storage, "edu-owner"), /Quota/);
  const pending = readStoredSnapshot(storage, "edu-owner:pending:window");
  assert.equal(pending.data.edu.students[0].memo, "keep after failure");
  assert.equal(pending.data.edu.events.length, 2);
  assert.deepEqual(readStoredSnapshot(storage, "edu-owner").edu, base.edu);
  storage.setItem = setter;
  flushDashboardSnapshots(storage, "edu-owner");
  assert.deepEqual(readStoredSnapshot(storage, "edu-owner").edu, next.edu);
});

test("writes require the initialized cache of the currently requested account", () => {
  const scope = { owner: "alice", activeOwner: "alice", loading: false, gate: false, cacheReady: true };
  assert.doesNotThrow(() => assertDashboardWriteScope("alice", scope));
  for (const patch of [{ owner: "bob" }, { activeOwner: "local" }, { loading: true }, { gate: true }, { cacheReady: false }]) {
    assert.throws(() => assertDashboardWriteScope("alice", { ...scope, ...patch }), /계정/);
  }
  assert.throws(() => assertDashboardWriteScope("local", scope), /계정/);
  assert.doesNotThrow(() => assertDashboardWriteScope("local", { ...scope, owner: "local", activeOwner: "local" }));
});
