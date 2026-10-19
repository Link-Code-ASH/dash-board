import test from "node:test";
import assert from "node:assert/strict";
import { createHubStorage, isLargeKey } from "../src/dashboard/hubStorage.js";

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

// IndexedDB with one store keyed by "key"; readwrite changes land on commit,
// transactions complete in creation order. Two windows can share one `rows`.
function fakeIndexedDB({ rows = new Map(), failWrites = false } = {}) {
  const later = (fn) => setTimeout(fn, 0);
  const db = {
    close() {},
    createObjectStore() {},
    transaction(_, mode) {
      const transaction = {};
      const changes = [];
      const store = {
        put(value) { changes.push(() => rows.set(value.key, structuredClone(value))); return {}; },
        delete(key) { changes.push(() => rows.delete(key)); return {}; },
        getAll() {
          const request = {};
          later(() => { request.result = [...rows.values()].map((row) => structuredClone(row)); request.onsuccess?.(); });
          return request;
        },
      };
      transaction.objectStore = () => store;
      later(() => {
        if (mode === "readwrite" && failWrites) return transaction.onabort?.();
        changes.forEach((change) => change());
        transaction.oncomplete?.();
      });
      return transaction;
    },
  };
  return { rows, open() { const request = {}; later(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; } };
}

const user = "608a67cb-1aee-4859-92eb-28c4940ce0ba";
const main = "routine-scoreboard-clean-v1";
const cache = `hub-account-data-v1:${user}`;
const base = `hub-account-base-v1:${user}`;
const big = JSON.stringify({ updatedAt: "2026-10-19T10:00:00.000Z", logs: "x".repeat(200000) });

test("only dashboard data keys move out of localStorage", () => {
  for (const key of [main, `${main}:pending:w1`, cache, `${cache}:recovery:1:x`, base, `hub-account-recovery-v1:${user}:1:local:x`]) assert.equal(isLargeKey(key), true, key);
  for (const key of ["hub-account-owner-v1", "hub-sidebar-collapsed", "hub-public-market-v1"]) assert.equal(isLargeKey(key), false, key);
});

test("existing localStorage data moves to IndexedDB unchanged and keeps reading the same", async () => {
  const local = new MemoryStorage({ [main]: big, [cache]: '{"cache":1}', [base]: '{"revision":4}', "hub-account-owner-v1": user });
  const indexedDB = fakeIndexedDB();
  const storage = createHubStorage({ local, indexedDB });
  assert.equal(await storage.open(), true);
  assert.deepEqual([...local.map.keys()], ["hub-account-owner-v1"]);
  assert.equal(indexedDB.rows.get(main).raw, big);
  assert.equal(storage.getItem(main), big);
  assert.equal(storage.getItem(cache), '{"cache":1}');
  assert.equal(storage.getItem("hub-account-owner-v1"), user);
  assert.deepEqual(storage.keys().sort(), [main, cache, base, "hub-account-owner-v1"].sort());
});

test("writes are synchronous for the app and committed by flushed()", async () => {
  const local = new MemoryStorage();
  const indexedDB = fakeIndexedDB();
  const storage = createHubStorage({ local, indexedDB });
  await storage.open();
  storage.setItem(main, big);
  storage.setItem(`${main}:pending:w1`, "{}");
  storage.removeItem(`${main}:pending:w1`);
  assert.equal(storage.getItem(main), big);
  assert.equal(storage.getItem(`${main}:pending:w1`), null);
  await storage.flushed();
  assert.equal(indexedDB.rows.get(main).raw, big);
  assert.equal(indexedDB.rows.has(`${main}:pending:w1`), false);
  assert.equal(local.length, 0);
});

test("much more than the old 5MB limit fits", async () => {
  const storage = createHubStorage({ local: new MemoryStorage(), indexedDB: fakeIndexedDB() });
  await storage.open();
  const chunk = "y".repeat(1048576);
  for (let index = 0; index < 12; index += 1) storage.setItem(`${main}:recovery:${index}:x`, chunk);
  await storage.flushed();
  assert.equal(storage.keys().length, 12);
});

test("a failed write is reported instead of silently lost", async () => {
  const storage = createHubStorage({ local: new MemoryStorage(), indexedDB: fakeIndexedDB({ failWrites: true }) });
  await storage.open();
  storage.setItem(main, "{}");
  await assert.rejects(storage.flushed());
});

test("refresh sees another window's writes without losing this window's newer one", async () => {
  const rows = new Map();
  const first = createHubStorage({ local: new MemoryStorage(), indexedDB: fakeIndexedDB({ rows }) });
  const second = createHubStorage({ local: new MemoryStorage(), indexedDB: fakeIndexedDB({ rows }) });
  await first.open();
  await second.open();
  second.setItem(cache, '{"from":"second"}');
  await second.flushed();
  assert.equal(first.getItem(cache), null);
  const refreshing = first.refresh();
  first.setItem(main, '{"from":"first"}');
  await refreshing;
  assert.equal(first.getItem(cache), '{"from":"second"}');
  assert.equal(first.getItem(main), '{"from":"first"}');
});

test("when both stores hold a copy, the newer one stays and the other is archived", async () => {
  const older = JSON.stringify({ updatedAt: "2026-10-18T00:00:00.000Z", n: 1 });
  const newer = JSON.stringify({ updatedAt: "2026-10-19T00:00:00.000Z", n: 2 });
  const rows = new Map([[main, { key: main, raw: older }], [base, { key: base, raw: '{"revision":9}' }]]);
  const local = new MemoryStorage({ [main]: newer, [base]: '{"revision":3}' });
  const archived = [];
  const storage = createHubStorage({ local, indexedDB: fakeIndexedDB({ rows }), archive: async (key, raw) => archived.push({ key, raw }) });
  await storage.open();
  assert.equal(storage.getItem(main), newer);
  assert.equal(storage.getItem(base), '{"revision":9}');
  assert.equal(local.length, 0);
  assert.deepEqual(archived.map(({ raw }) => raw).sort(), [older, '{"revision":3}'].sort());
});

test("without IndexedDB everything keeps working on localStorage", async () => {
  const local = new MemoryStorage({ [main]: '{"a":1}' });
  const storage = createHubStorage({ local, indexedDB: undefined });
  assert.equal(await storage.open(), false);
  storage.setItem(cache, "{}");
  assert.equal(storage.getItem(main), '{"a":1}');
  assert.equal(local.getItem(cache), "{}");
  await storage.flushed();
});

test("an abandoned slow open leaves localStorage data in place", async () => {
  const local = new MemoryStorage({ [main]: '{"a":1}' });
  const storage = createHubStorage({ local, indexedDB: fakeIndexedDB() });
  const opening = storage.open();
  storage.abandon();
  assert.equal(await opening, false);
  assert.equal(local.getItem(main), '{"a":1}');
  assert.equal(storage.getItem(main), '{"a":1}');
});
