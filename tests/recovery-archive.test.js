import test from "node:test";
import assert from "node:assert/strict";
import { archiveRecoveryEntries, isRecoveryKey, readRecoveryArchive, withRecoveryArchive } from "../src/dashboard/recoveryArchive.js";
import { createRecoveryBundle } from "../src/dashboard/recovery.js";

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

// Just enough IndexedDB for the archive: one object store keyed by "key".
function fakeIndexedDB({ failWrites = false } = {}) {
  const rows = new Map();
  const later = (fn) => setTimeout(fn, 0);
  const db = {
    close() {},
    createObjectStore() {},
    transaction(_, mode) {
      const transaction = {};
      const store = {
        put(value) { if (mode !== "readwrite") throw new Error("readonly"); if (!failWrites) rows.set(value.key, structuredClone(value)); return {}; },
        get(key) { return { result: structuredClone(rows.get(key)) }; },
        getAll() { return { result: [...rows.values()].map((row) => structuredClone(row)) }; },
      };
      transaction.objectStore = () => store;
      later(() => failWrites && mode === "readwrite" ? transaction.onabort?.() : transaction.oncomplete?.());
      return transaction;
    },
  };
  return { rows, open() { const request = {}; later(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; } };
}

const user = "608a67cb-1aee-4859-92eb-28c4940ce0ba";
const draft = (time, side) => `hub-account-recovery-v1:${user}:${time}:${side}:id${time}${side}`;

test("recovery keys are recognised and ordinary data is not", () => {
  assert.equal(isRecoveryKey(draft(1760000000000, "local")), true);
  assert.equal(isRecoveryKey(`routine-scoreboard-clean-v1:recovery:1760000000000:x`), true);
  assert.equal(isRecoveryKey(`hub-account-data-v1:${user}:recovery:1760000000000:x`), true);
  for (const key of ["routine-scoreboard-clean-v1", `hub-account-data-v1:${user}`, `hub-account-base-v1:${user}`, `hub-account-data-v1:${user}:pending:w1`])
    assert.equal(isRecoveryKey(key), false, key);
});

test("old recovery copies move to IndexedDB without losing any text", async () => {
  const storage = new MemoryStorage({
    "routine-scoreboard-clean-v1": '{"main":true}',
    [`hub-account-data-v1:${user}`]: '{"cache":true}',
    [draft(1760000000001, "local")]: '{"n":1}',
    [draft(1760000000002, "remote")]: '{"n":2}',
    [draft(1760000000003, "local")]: '{"n":3}',
    [`hub-account-data-v1:${user}:recovery:1760000000004:x`]: '{"base":{},"local":{},"remote":{}}',
  });
  const before = new Map(storage.map);
  const factory = fakeIndexedDB();
  assert.equal(await archiveRecoveryEntries(storage, { keep: 2, factory }), 2);
  assert.deepEqual([...storage.map.keys()].sort(), ["routine-scoreboard-clean-v1", `hub-account-data-v1:${user}`, draft(1760000000002, "remote"), draft(1760000000003, "local")].sort());
  const archived = await readRecoveryArchive(factory);
  assert.equal(archived.length, 2);
  const view = withRecoveryArchive(storage, archived);
  for (const [key, raw] of before) assert.equal(view.getItem(key), raw, key);
  const bundle = createRecoveryBundle(view, user, {});
  assert.ok(bundle.records[draft(1760000000001, "local")]);
  assert.ok(bundle.records[`hub-account-data-v1:${user}:recovery:1760000000004:x`]);
  assert.equal(await archiveRecoveryEntries(storage, { keep: 0, factory }), 2);
  assert.equal([...storage.map.keys()].filter(isRecoveryKey).length, 0);
});

test("nothing leaves localStorage when the archive write fails", async () => {
  const storage = new MemoryStorage({ [draft(1760000000001, "local")]: '{"n":1}' });
  await assert.rejects(archiveRecoveryEntries(storage, { keep: 0, factory: fakeIndexedDB({ failWrites: true }) }));
  assert.equal(storage.getItem(draft(1760000000001, "local")), '{"n":1}');
});
