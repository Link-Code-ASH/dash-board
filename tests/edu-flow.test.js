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

test("Edu Flow lists the selected day's booked and completed consultations in time order", () => {
  const { source, getEdu } = harness();
  const before = structuredClone(getEdu());
  assert.deepEqual(source.getItems("2026-10-11"), [
    { id: "done", title: "07:00 · 김하늘 · 완료", displayTitle: "김하늘 · 완료", time: "07:00", kind: "consultation", sourceLabel: "Edu · 상담", completed: true, statusLabel: "완료" },
    { id: "early", title: "09:30 · 박바다 · 진학 상담", displayTitle: "박바다 · 진학 상담", time: "09:30", kind: "consultation", sourceLabel: "Edu · 상담" },
    { id: "later", title: "17:00 · 김하늘 · 학습 상담", displayTitle: "김하늘 · 학습 상담", time: "17:00", kind: "consultation", sourceLabel: "Edu · 상담" },
  ]);
  assert.deepEqual(source.getItems("2026-10-13"), []);
  assert.deepEqual(getEdu(), before, "Flow reads must not reorder the underlying consultation list");
});

test("Edu Flow opens the consultation itself and rejects missing records", () => {
  const { source } = harness();
  assert.equal(source.execute, undefined, "Flow no longer completes consultations");
  assert.deepEqual(source.openTarget("early"), { moduleId: "edu", section: "consultation:early" });
  assert.deepEqual(source.openTarget("done"), { moduleId: "edu", section: "consultation:done" });
  assert.throws(() => source.openTarget("missing"), /찾을 수 없습니다/);
  assert.throws(() => source.openTarget("orphan"), /찾을 수 없습니다/);
});

test("Edu Flow reads latest data and subscription teardown stops updates", () => {
  const { source, replace, getEdu, listeners } = harness();
  let notified = 0;
  const unsubscribe = source.subscribe(() => { notified += 1; });
  const next = structuredClone(getEdu());
  next.consultations[1].status = "cancelled";
  replace(next);
  assert.equal(notified, 1);
  assert.deepEqual(source.getItems("2026-10-11").map((item) => item.id), ["done", "later"]);
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
    assert.deepEqual(getFlowSources().find((source) => source.id === "edu").getItems("2026-10-11"), []);
  } finally {
    unregister();
    nextUnregister?.();
  }
});
