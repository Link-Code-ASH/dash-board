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

test("upcoming titles wait on their own shelf, count down and stay out of the gallery stats", async () => {
  const { upcomingItems, daysUntil, dDayLabel } = await import("../src/contents/model.js");
  const items = [
    item("done", { rating: 5, date: "2026-02-01" }),
    item("soon", { status: "upcoming", releaseDate: "2026-10-24", hype: 4.6 }),
    item("later", { status: "upcoming", releaseDate: "2026-12-01" }),
    item("tbd", { status: "upcoming" }),
  ];
  assert.deepEqual(visibleItems(items).map((x) => x.id), ["done"]);
  assert.deepEqual(upcomingItems(items).map((x) => x.id), ["soon", "later", "tbd"]);
  const stats = collectionStats(items, 2026);
  assert.equal(stats.total, 1);
  assert.equal(stats.upcoming, 3);
  assert.equal(stats.all, 4);
  assert.equal(validateItem(items[1]).hype, 4.5);
  assert.equal(dDayLabel(daysUntil("2026-10-24", "2026-10-19")), "D-5");
  assert.equal(dDayLabel(daysUntil("2026-10-19", "2026-10-19")), "D-DAY");
  assert.equal(dDayLabel(daysUntil("2026-10-01", "2026-10-19")), "출시됨");
  assert.equal(dDayLabel(daysUntil("", "2026-10-19")), "미정");
});

test("release dates appear in Flow and open the title in Contents", async () => {
  const { createContentsFlowSource } = await import("../src/contents/flow.js");
  const items = [
    item("a", { title: "GTA 6", type: "game", status: "upcoming", releaseDate: "2026-10-24" }),
    item("b", { releaseDate: "2026-10-24", deletedAt: "2026-10-19T00:00:00.000Z" }),
  ];
  const source = createContentsFlowSource({ getItems: () => items, subscribe: () => () => {} });
  const flow = source.getItems("2026-10-24");
  assert.equal(flow.length, 1);
  assert.equal(flow[0].displayTitle, "GTA 6");
  assert.equal(flow[0].kind, "release");
  assert.deepEqual(source.getItems("2026-10-25"), []);
  assert.deepEqual(source.openTarget("a"), { moduleId: "contents", section: "item:a" });
  assert.throws(() => source.openTarget("b"), /찾을 수 없/);
});

test("the gallery splits into rarity wings in rating order", async () => {
  const { rarityWings } = await import("../src/contents/model.js");
  const items = [
    item("a", { rating: 5, date: "2026-01-01" }),
    item("b", { rating: 5, date: "2026-03-01" }),
    item("c", { rating: 3.5, type: "movie" }),
    item("d", { rating: 0 }),
    item("e", { rating: 4.5, status: "upcoming" }),
    item("f", { rating: 4, deletedAt: "2026-10-01T00:00:00.000Z" }),
  ];
  const wings = rarityWings(visibleItems(items, { sort: "tier" }));
  assert.deepEqual(wings.map((w) => [w.id, w.items.map((x) => x.id)]), [["legendary", ["b", "a"]], ["rare", ["c"]], ["unrated", ["d"]]]);
});

test("cover search asks the sources for the title's kind, mixes their best results and skips failures", async () => {
  const { searchCovers, interleave, downloadCover } = await import("../src/contents/coverSearch.js");
  const calls = [];
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetcher = async (url, init) => {
    calls.push(url);
    if (url.startsWith("https://graphql.anilist.co")) {
      assert.equal(JSON.parse(init.body).variables.type, "MANGA");
      return reply({ data: { Page: { media: [
        { title: { native: "나 혼자만 레벨업" }, coverImage: { extraLarge: "https://img/a1.jpg" } },
        { title: { native: "다른 작품" }, coverImage: { large: "https://img/a2.jpg" } },
      ] } } });
    }
    if (url.includes("ko.wikipedia.org")) return reply({ query: { pages: {
      2: { index: 2, title: "둘째", thumbnail: { source: "https://img/w2.jpg" } },
      1: { index: 1, title: "첫째", thumbnail: { source: "https://img/a1.jpg" } },
      3: { index: 3, title: "그림 없음" },
    } } });
    throw new Error("offline");
  };
  const found = await searchCovers(" 나 혼자만 레벨업 ", "webtoon", { fetcher });
  assert.deepEqual(found.map((x) => x.url), ["https://img/a1.jpg", "https://img/a2.jpg", "https://img/w2.jpg"]);
  assert.equal(found[0].source, "AniList");
  assert.ok(calls.some((url) => url.includes("en.wikipedia.org")), "a failing source is still tried and then skipped");
  assert.ok(calls.find((url) => url.includes("ko.wikipedia")).includes(encodeURIComponent("나 혼자만 레벨업")));
  assert.deepEqual(await searchCovers("a", "movie", { fetcher }), [], "one letter is too short to search");

  const movie = await searchCovers("인터스텔라", "movie", { fetcher: async (url) => url.includes("itunes")
    ? reply({ results: [{ trackName: "인터스텔라", artworkUrl100: "https://is1.mzstatic.com/x/100x100bb.jpg" }] })
    : reply({}) });
  assert.equal(movie[0].url, "https://is1.mzstatic.com/x/600x600bb.jpg");

  assert.equal(interleave([[{ url: "a" }, { url: "b" }, { url: "c" }], [{ url: "d" }]], 3).map((x) => x.url).join(""), "adb");
  const blob = new Blob(["x"], { type: "image/jpeg" });
  assert.equal(await downloadCover("u", { fetcher: async () => ({ ok: true, blob: async () => blob }) }), blob);
  assert.equal(await downloadCover("u", { fetcher: async () => { throw new TypeError("CORS"); } }), null);
  assert.equal(await downloadCover("u", { fetcher: async () => ({ ok: true, blob: async () => new Blob(["<html>"], { type: "text/html" }) }) }), null);
});
