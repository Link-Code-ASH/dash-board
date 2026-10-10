import test from "node:test";
import assert from "node:assert/strict";
import { mergeDashboard } from "../src/hub/merge.js";
import { normalizeState, createBackupPayload, splitBackupPayload } from "../src/dashboard/model.js";
import { listRecoverySnapshots, readRecoverySnapshot, createRecoveryBundle } from "../src/dashboard/recovery.js";
import {
  accountSnapshotKey, readStoredSnapshot, readRecoverableSnapshot, sameDashboard, mergeAccountSnapshots,
  nextEditTimestamp, stageDashboardSnapshot, flushDashboardSnapshots, withDashboardLock,
} from "../src/dashboard/syncState.js";

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

test("independent windows and restart retain additions and deletions", () => {
  const storage = memoryStorage();
  const base = { calendar: { remove: "old" }, days: {} };
  storage.setItem("dashboard", JSON.stringify(base));
  stageDashboardSnapshot(storage, "dashboard", "a", base, { calendar: {}, days: {} });
  stageDashboardSnapshot(storage, "dashboard", "b", base, { ...base, days: { today: [{ id: "new", score: 5 }] } });
  const recovered = readRecoverableSnapshot(storage, "dashboard");
  assert.deepEqual(recovered.calendar, {});
  assert.equal(recovered.days.today[0].score, 5);
  const result = flushDashboardSnapshots(storage, "dashboard");
  assert.deepEqual(result.conflicts, []);
  assert(sameDashboard(result.data, recovered));
  assert.equal(storage.length, 1);
});

test("same-origin collisions retain both versions before journals are deleted", () => {
  const storage = memoryStorage();
  const base = { calendar: { today: "base" } };
  const local = { calendar: { today: "local" } };
  const remote = { calendar: { today: "remote" } };
  storage.setItem("dashboard", JSON.stringify(remote));
  stageDashboardSnapshot(storage, "dashboard", "window", base, local);
  let observed = [];
  assert.deepEqual(readRecoverableSnapshot(storage, "dashboard", (conflicts) => { observed = conflicts; }), local);
  assert.equal(observed.length, 1);
  const result = flushDashboardSnapshots(storage, "dashboard");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.data.calendar.today, "local");
  const recoveryKey = Array.from({ length: storage.length }, (_, index) => storage.key(index)).find((key) => key.includes(":recovery:"));
  const recovery = readStoredSnapshot(storage, recoveryKey);
  assert.deepEqual(recovery.local, local);
  assert.deepEqual(recovery.remote, remote);
  assert.deepEqual(recovery.base, base);
  assert.equal(storage.getItem("dashboard:pending:window"), null);
});

test("failed recovery or primary writes never delete the pending journal", () => {
  for (const failRecovery of [true, false]) {
    const storage = memoryStorage();
    storage.setItem("dashboard", JSON.stringify({ value: "remote" }));
    stageDashboardSnapshot(storage, "dashboard", "window", { value: "base" }, { value: "local" });
    const setItem = storage.setItem;
    storage.setItem = (key, value) => {
      if (failRecovery ? key.includes(":recovery:") : key === "dashboard") throw new Error("Quota exceeded");
      setItem(key, value);
    };
    assert.throws(() => flushDashboardSnapshots(storage, "dashboard"), /Quota/);
    assert(storage.getItem("dashboard:pending:window"));
    assert.deepEqual(readStoredSnapshot(storage, "dashboard"), { value: "remote" });
  }
});

test("persisted account base supports three-way offline merge independent of timestamps", () => {
  const storage = memoryStorage();
  const base = { calendar: {}, days: {}, updatedAt: "2026-01-01T00:00:00.000Z" };
  storage.setItem(accountSnapshotKey("alice"), JSON.stringify({ data: base, revision: 4 }));
  const local = { ...base, calendar: { today: "offline edit" }, updatedAt: "2025-01-01T00:00:00.000Z" };
  const remote = { ...base, days: { today: [{ id: "record", score: 3 }] } };
  const result = mergeDashboard(readStoredSnapshot(storage, accountSnapshotKey("alice")).data, local, remote);
  assert.equal(result.data.calendar.today, "offline edit");
  assert.equal(result.data.days.today[0].score, 3);
  assert.deepEqual(result.conflicts, []);
  assert.equal(readStoredSnapshot(storage, accountSnapshotKey("bob")), null);
});

test("a cache without an acknowledged base must never overwrite newer cloud content", () => {
  const local = { memos: { cards: [{ id: "memo", leftText: "old" }] }, calendar: { today: "old" } };
  const remote = { memos: { cards: [{ id: "memo", leftText: "Claude - latest" }] }, calendar: { today: "latest" } };
  for (const snapshot of [null, {}, { data: local }, { data: local, revision: null }, { data: [], revision: 1 }]) {
    const result = mergeAccountSnapshots(snapshot, local, remote);
    assert.deepEqual(result.data, remote);
    assert.equal(result.conflicts[0].kind, "missing-base");
  }
  const result = mergeAccountSnapshots({ data: local, revision: 1 }, { ...local, days: { today: [{ id: "check", score: 2 }] } }, remote);
  assert.equal(result.data.memos.cards[0].leftText, "Claude - latest");
  assert.equal(result.data.days.today[0].score, 2);
  assert.deepEqual(result.conflicts, []);
});

test("recovery bundle retains base and pending records without credentials or foreign accounts", () => {
  const storage = memoryStorage();
  const baseKey = accountSnapshotKey("alice");
  const dataKey = "hub-account-data-v1:alice";
  storage.setItem(baseKey, JSON.stringify({ revision: 7, data: { memo: "Claude" } }));
  storage.setItem(dataKey, JSON.stringify({ memo: "old" }));
  stageDashboardSnapshot(storage, dataKey, "window", { memo: "old" }, { memo: "draft" });
  storage.setItem("hub-account-recovery-v1:alice:1000:remote:uuid", JSON.stringify({ memo: "Claude" }));
  storage.setItem("hub-account-data-v1:bob", JSON.stringify({ private: true }));
  storage.setItem("sb-project-auth-token", "secret");
  storage.setItem("dashboard-sync-pin", "secret");
  const count = storage.length;
  const bundle = createRecoveryBundle(storage, "alice", { memo: "current" });
  assert.equal(bundle.records[baseKey].data.memo, "Claude");
  assert.equal(bundle.records[`${dataKey}:pending:window`].data.memo, "draft");
  assert.equal(bundle.records["hub-account-recovery-v1:alice:1000:remote:uuid"].memo, "Claude");
  assert.equal(Object.keys(bundle.records).length, 4);
  assert.equal(storage.length, count);
  assert(!JSON.stringify(bundle).includes("secret"));
});

test("unknown module backups survive normalization and backup round trips", () => {
  const future = { future: { schema: 23, opaque: [1, { value: "preserve" }] } };
  const state = normalizeState({ _moduleBackups: future });
  const payload = createBackupPayload(state, []);
  assert.deepEqual(normalizeState(splitBackupPayload(payload).state)._moduleBackups, future);
});

test("lock requests use the supplied name and timestamps remain monotonic", async () => {
  const calls = [];
  const locks = { request: async (name, action) => { calls.push(name); return action(); } };
  assert.equal(await withDashboardLock("hub-cloud-push:alice", () => 7, locks), 7);
  assert.deepEqual(calls, ["hub-cloud-push:alice"]);
  assert.equal(await withDashboardLock("fallback", () => 9, null), 9);
  const future = { updatedAt: "2099-01-01T00:00:00.000Z" };
  assert.equal(nextEditTimestamp(future), "2099-01-01T00:00:00.001Z");
  assert(sameDashboard({ n: 1, updatedAt: "a" }, { n: 1, updatedAt: "b" }));
  assert(!sameDashboard({ n: 1 }, { n: 2 }));
});

test("recovery list includes both sides and older account drafts but excludes other accounts", () => {
  const storage = memoryStorage();
  const localKey = "routine-scoreboard-clean-v1:recovery:1000:uuid";
  const accountKey = "hub-account-data-v1:alice:recovery:2000:uuid";
  const draftKey = "hub-account-recovery-v1:alice:3000:remote:uuid";
  const legacyKey = "hub-account-recovery-v1:alice:2500:uuid";
  for (const key of [localKey, accountKey]) storage.setItem(key, JSON.stringify({ local: { n: 1 }, remote: { n: 2 }, conflicts: [{ path: "/n" }] }));
  for (const key of [draftKey, legacyKey, "hub-account-recovery-v1:bob:4000:remote:uuid"]) storage.setItem(key, JSON.stringify({ n: 3 }));
  storage.setItem("hub-account-recovery-v1:alice:5000:uuid", "bad JSON");
  const listed = listRecoverySnapshots(storage, "alice");
  assert.deepEqual(listed.map((entry) => entry.key), [draftKey, legacyKey, accountKey, localKey]);
  assert.deepEqual(listed[0].versions, ["remote"]);
  assert.deepEqual(listed[1].versions, ["local"]);
  assert.deepEqual(listed[2].versions, ["local", "remote"]);
  assert.equal(listed[2].conflictCount, 1);
  assert.deepEqual(listRecoverySnapshots(storage).map((entry) => entry.key), [localKey]);
});

test("recovery reads export exact saved payloads without changing storage", () => {
  const storage = memoryStorage();
  const key = "hub-account-data-v1:alice:recovery:1000:uuid";
  const remoteKey = "hub-account-recovery-v1:alice:2000:remote:uuid";
  const payload = { _moduleBackups: { future: { opaque: true } }, _mindfoldV3: { documents: [] } };
  storage.setItem(key, JSON.stringify({ local: { n: 1 }, remote: payload }));
  storage.setItem(remoteKey, JSON.stringify(payload));
  const before = [storage.getItem(key), storage.getItem(remoteKey), storage.length];
  assert.deepEqual(readRecoverySnapshot(storage, "alice", key, "remote"), payload);
  assert.deepEqual(readRecoverySnapshot(storage, "alice", remoteKey, "remote"), payload);
  assert.deepEqual(readRecoverySnapshot(storage, "alice", key, "local"), { n: 1 });
  assert.deepEqual([storage.getItem(key), storage.getItem(remoteKey), storage.length], before);
});

test("recovery reads reject foreign keys, missing sides and non-export versions", () => {
  const storage = memoryStorage();
  const key = "hub-account-recovery-v1:alice:1000";
  storage.setItem(key, JSON.stringify({ n: 1 }));
  assert.throws(() => readRecoverySnapshot(storage, "bob", key), /outside/);
  assert.throws(() => readRecoverySnapshot(storage, null, key), /outside/);
  assert.throws(() => readRecoverySnapshot(storage, "alice", "hub-account-data-v1:alice"), /outside/);
  assert.throws(() => readRecoverySnapshot(storage, "alice", key, "remote"), /unavailable/);
  assert.throws(() => readRecoverySnapshot(storage, "alice", key, "base"), /local or remote/);
  assert.deepEqual(readRecoverySnapshot(storage, "alice", key), { n: 1 });
});
