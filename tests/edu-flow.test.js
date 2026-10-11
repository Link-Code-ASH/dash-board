import test from "node:test";
import assert from "node:assert/strict";
import { createEduFlowSource } from "../src/edu/flow.js";
import { getFlowSources, registerFlowSource } from "../src/hub/moduleRegistry.js";

function fixture() {
  return {
    version: 1,
    students: [{ id: "student-1", name: "김하늘" }, { id: "student-2", name: "박바다" }],
    consultations: [
      { id: "later", studentId: "student-1", title: "학습 상담", date: "2026-10-11", time: "17:00", status: "scheduled" },
      { id: "early", studentId: "student-2", title: "진학 상담", date: "2026-10-11", time: "09:30", status: "scheduled" },
      { id: "another-day", studentId: "student-1", title: "내일 상담", date: "2026-10-12", time: "08:00", status: "scheduled" },
      { id: "done", studentId: "student-1", title: "완료", date: "2026-10-11", time: "07:00", status: "completed" },
      { id: "cancelled", studentId: "student-1", title: "취소", date: "2026-10-11", time: "07:30", status: "cancelled" },
      { id: "orphan", studentId: "missing", title: "잘못된 원생", date: "2026-10-11", time: "07:30", status: "scheduled" },
    ],
    events: [],
  };
}

function harness(save = async () => {}) {
  let edu = fixture();
  const listeners = new Set();
  const source = createEduFlowSource({
    getEdu: () => edu,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    save,
  });
  return { source, listeners, getEdu: () => edu, replace: (next) => { edu = next; for (const listener of listeners) listener(); } };
}

test("Edu Flow lists only the selected day's booked consultations in time order", () => {
  const { source, getEdu } = harness();
  const before = structuredClone(getEdu());
  assert.deepEqual(source.getItems("2026-10-11"), [
    { id: "early", title: "09:30 · 박바다 · 진학 상담", commands: [{ id: "complete", label: "상담 완료" }] },
    { id: "later", title: "17:00 · 김하늘 · 학습 상담", commands: [{ id: "complete", label: "상담 완료" }] },
  ]);
  assert.deepEqual(source.getItems("2026-10-13"), []);
  assert.deepEqual(getEdu(), before, "Flow reads must not reorder the underlying consultation list");
});

test("Edu Flow resolves a consultation to its student and rejects missing records", () => {
  const { source } = harness();
  assert.deepEqual(source.openTarget("early"), { moduleId: "edu", section: "student:student-2" });
  assert.deepEqual(source.openTarget("done"), { moduleId: "edu", section: "student:student-1" });
  assert.throws(() => source.openTarget("missing"), /찾을 수 없습니다/);
  assert.throws(() => source.openTarget("orphan"), /찾을 수 없습니다/);
});

test("Edu Flow completion uses the shared action and awaits durable persistence", async () => {
  const calls = [];
  let finish;
  const { source } = harness((action) => {
    calls.push(action);
    return new Promise((resolve) => { finish = resolve; });
  });
  let completed = false;
  const operation = source.execute("early", "complete").then(() => { completed = true; });
  assert.deepEqual(calls, [{ type: "consultation.status", id: "early", status: "completed" }]);
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  await operation;
  assert.equal(completed, true);
});

test("Edu Flow reports failed saves and refuses unsupported or cancelled actions", async () => {
  const { source } = harness(async () => { throw new Error("disk full"); });
  await assert.rejects(source.execute("early", "complete"), /disk full/);
  await assert.rejects(source.execute("early", "delete"), /지원하지 않는/);
  await assert.rejects(source.execute("missing", "complete"), /찾을 수 없습니다/);
  await assert.rejects(source.execute("cancelled", "complete"), /취소된 상담/);
  await assert.rejects(source.execute("orphan", "complete"), /찾을 수 없습니다/);
  await source.execute("done", "complete");
});

test("Edu Flow reads latest data and subscription teardown stops updates", () => {
  const { source, replace, getEdu, listeners } = harness();
  let notified = 0;
  const unsubscribe = source.subscribe(() => { notified += 1; });
  const next = structuredClone(getEdu());
  next.consultations[1].status = "completed";
  replace(next);
  assert.equal(notified, 1);
  assert.deepEqual(source.getItems("2026-10-11").map((item) => item.id), ["later"]);
  unsubscribe();
  unsubscribe();
  replace(next);
  assert.equal(notified, 1);
  assert.equal(listeners.size, 0);
});

test("Unregistering the Edu session invalidates stale Flow callbacks before account replacement", async () => {
  const original = harness();
  const unregister = registerFlowSource(original.source);
  let nextUnregister;
  try {
    const stale = getFlowSources().find((source) => source.id === "edu");
    stale.subscribe(() => {});
    assert.equal(original.listeners.size, 1);
    unregister();
    assert.equal(original.listeners.size, 0);
    const replacement = harness();
    replacement.replace({ version: 1, students: [], consultations: [], events: [] });
    nextUnregister = registerFlowSource(replacement.source);
    assert.throws(() => stale.getItems("2026-10-11"), /unregistered/);
    assert.throws(() => stale.openTarget("early"), /unregistered/);
    assert.throws(() => stale.execute("early", "complete"), /unregistered/);
    assert.deepEqual(getFlowSources().find((source) => source.id === "edu").getItems("2026-10-11"), []);
  } finally {
    unregister();
    nextUnregister?.();
  }
});
