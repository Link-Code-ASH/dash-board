import test from "node:test";
import assert from "node:assert/strict";
import { collectionStats, emptyItem, rarityOf, validateBackup, validateItem, visibleItems } from "../src/contents/model.js";
import { createContentsStore } from "../src/contents/store.js";
import { accountLock } from "../src/contents/storage.js";

const copy = (value) => structuredClone(value);
const item = (id, patch = {}) => ({ ...emptyItem(id, "2026-10-19T00:00:00.000Z"), title: `작품 ${id}`, ...patch });

function memoryStorage() {
  const data = new Map();
  return { data, read: async (id) => copy(data.get(id)), write: async (id, value) => { data.set(id, copy(value)); } };
}
function memoryCloud() {
  const rows = new Map();
  return { rows, read: async () => copy([...rows.values()]), write: async (value, revision) => {
    if ((rows.get(value.id)?.revision || 0) !== revision) throw Object.assign(new Error("conflict"), { code: "CONTENTS_CONFLICT" });
    rows.set(value.id, { item_id: value.id, payload: copy(value), revision: revision + 1 });
    return revision + 1;
  } };
}
const makeStore = (storage, cloud, owner) => createContentsStore(owner, { storage, cloud, lock: accountLock });

test("items normalize ratings, unknown types and missing optional fields without losing data", () => {
  const value = validateItem({ version: 1, id: "a", title: "듄", type: "podcast", rating: 4.3, extra: { keep: true } });
  assert.equal(value.type, "etc");
  assert.equal(value.rating, 4.5);
  assert.equal(value.review, "");
  assert.equal(value.cover, null);
  assert.deepEqual(value.extra, { keep: true });
  assert.throws(() => validateItem({ version: 1, id: "a", title: " ", type: "movie" }), /제목/);
  assert.throws(() => validateItem({ version: 2, id: "a", title: "x", type: "movie" }), /손상/);
  assert.throws(() => validateBackup({ version: 1, items: [item("a"), item("a")] }), /중복/);
});

test("rarity follows the rating and unrated stays separate", () => {
  assert.equal(rarityOf(5).id, "legendary");
  assert.equal(rarityOf(4.5).id, "epic");
  assert.equal(rarityOf(3).id, "rare");
  assert.equal(rarityOf(2).id, "uncommon");
  assert.equal(rarityOf(1).id, "common");
  assert.equal(rarityOf(0).id, "unrated");
});

test("gallery filters, searches, sorts and hides removed items; stats ignore removed items", () => {
  const items = [
    item("a", { type: "movie", rating: 5, date: "2026-01-02", creator: "놀란" }),
    item("b", { type: "webtoon", rating: 3, date: "2026-05-01" }),
    item("c", { type: "movie", rating: 4, date: "2025-03-01" }),
    item("d", { type: "game", rating: 5, deletedAt: "2026-10-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(visibleItems(items).map((x) => x.id), ["b", "a", "c"]);
  assert.deepEqual(visibleItems(items, { sort: "rating" }).map((x) => x.id), ["a", "c", "b"]);
  assert.deepEqual(visibleItems(items, { type: "movie" }).map((x) => x.id), ["a", "c"]);
  assert.deepEqual(visibleItems(items, { query: "놀란" }).map((x) => x.id), ["a"]);
  const stats = collectionStats(items, 2026);
  assert.equal(stats.total, 3);
  assert.equal(stats.legendary, 1);
  assert.equal(stats.thisYear, 2);
  assert.equal(stats.average, 4);
  assert.equal(stats.counts.movie, 2);
});

test("two devices merge edits to different fields of the same item and keep removed rows", async () => {
  const cloud = memoryCloud();
  const a = makeStore(memoryStorage(), cloud, "a"), b = makeStore(memoryStorage(), cloud, "b");
  await a.change("x", () => item("x", { rating: 3 }));
  await a.sync(); await b.sync();
  assert.equal(b.getSnapshot().items[0].rating, 3);
  await a.change("x", (current) => ({ ...current, rating: 5 }));
  await b.change("x", (current) => ({ ...current, review: "최고" }));
  await a.sync(); await b.sync(); await a.sync();
  for (const store of [a, b]) {
    assert.equal(store.getSnapshot().items[0].rating, 5);
    assert.equal(store.getSnapshot().items[0].review, "최고");
  }
  await b.change("x", (current) => ({ ...current, deletedAt: "2026-10-19T01:00:00.000Z" }));
  await b.sync(); await a.sync();
  assert.equal(cloud.rows.size, 1, "removal keeps the row for recovery");
  assert.equal(visibleItems(a.getSnapshot().items).length, 0);
});

test("offline edits stay local until the cloud accepts them", async () => {
  const storage = memoryStorage(), cloud = memoryCloud();
  const store = makeStore(storage, { read: async () => { throw new Error("offline"); }, write: cloud.write }, "off");
  await store.change("y", () => item("y"));
  await assert.rejects(store.sync(), /offline/);
  assert.equal(storage.data.get("off").entries[0].dirty, true);
  const online = makeStore(storage, cloud, "off");
  await online.load(); await online.sync();
  assert.equal(cloud.rows.get("y").revision, 1);
  assert.equal(storage.data.get("off").entries[0].dirty, false);
});
