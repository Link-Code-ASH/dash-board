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

test("cover search finds the work on Wikidata, uses its English name elsewhere and drops unrelated covers", async () => {
  const { searchCovers, interleave, downloadCover, sameWork } = await import("../src/contents/coverSearch.js");
  const calls = [];
  const reply = (body) => ({ ok: true, json: async () => body });
  const P31 = (id) => ({ mainsnak: { datavalue: { value: { id } } } });
  const fetcher = async (url, init) => {
    calls.push(url);
    if (url.includes("wbsearchentities")) return reply({ search: url.includes("language=ko") ? [{ id: "Q2" }, { id: "Q1" }, { id: "Q3" }] : [{ id: "Q1" }] });
    if (url.includes("wbgetentities")) return reply({ entities: {
      Q1: { labels: { ko: { value: "나의 아저씨" }, en: { value: "My Mister" } }, claims: { P31: [P31("Q5398426")], P577: [{}] },
        sitelinks: { enwiki: { title: "My Mister" }, kowiki: { title: "나의 아저씨" } } },
      Q2: { labels: { ko: { value: "나의 아저씨" } }, claims: { P31: [P31("Q5")] }, sitelinks: {} },
      Q3: { labels: { ko: { value: "아저씨" }, en: { value: "The Man from Nowhere" } }, claims: { P31: [P31("Q11424")] }, sitelinks: { enwiki: { title: "The Man from Nowhere" } } },
    } });
    if (url.includes("en.wikipedia.org")) return reply({ query: { pages: { 1: { title: "My Mister", thumbnail: { source: "https://img/poster.jpg" } } } } });
    if (url.includes("itunes.apple.com")) return reply({ results: url.includes("My%20Mister")
      ? [{ trackName: "My Mister, Season 1", artworkUrl100: "https://is1.mzstatic.com/a/100x100bb.jpg" }]
      : [{ trackName: "나의 아저씨 시즌 1", artworkUrl100: "https://is1.mzstatic.com/b/100x100bb.jpg" }, { trackName: "전혀 다른 드라마", artworkUrl100: "https://is1.mzstatic.com/c/100x100bb.jpg" }] });
    throw new Error("offline");
  };
  const found = await searchCovers(" 나의 아저씨 ", "drama", { fetcher });
  assert.deepEqual(found.map((x) => x.url), ["https://img/poster.jpg", "https://is1.mzstatic.com/b/600x600bb.jpg", "https://is1.mzstatic.com/a/600x600bb.jpg"]);
  assert.equal(found[0].source, "위키백과");
  assert.ok(!calls.some((url) => url.includes("The%20Man")), "a different work with a partial name is not used");
  assert.ok(calls.some((url) => url.includes("ko.wikipedia.org")), "a failing source is still tried and then skipped");
  assert.deepEqual(await searchCovers("a", "movie", { fetcher }), [], "one letter is too short to search");

  const offline = await searchCovers("나 혼자만 레벨업", "webtoon", { fetcher: async (url, init) => url.startsWith("https://graphql.anilist.co")
    ? reply({ data: { Page: { media: [
      { title: { native: "나 혼자만 레벨업" }, coverImage: { extraLarge: "https://img/a1.jpg" } },
      { title: { native: "다른 작품" }, synonyms: [], coverImage: { large: "https://img/a2.jpg" } },
    ] } } })
    : url.includes("googleapis") ? reply({ items: [{ volumeInfo: { title: "나 혼자만 레벨업 1", imageLinks: { thumbnail: "http://books.google.com/x?id=1&edge=curl" } } }] })
      : Promise.reject(new Error("offline")) });
  assert.deepEqual(offline.map((x) => x.url), ["https://img/a1.jpg", "https://books.google.com/x?id=1"], "without Wikidata the others still answer");

  const withNaver = await searchCovers("나의 아저씨", "drama", { fetcher, naver: async (body) => {
    assert.deepEqual(body, { query: "나의 아저씨", type: "drama" });
    return { items: [{ url: "https://blog/p.jpg", thumb: "https://search.pstatic.net/p", title: "나의 아저씨 포스터" }] };
  } });
  assert.deepEqual([withNaver[0].source, withNaver[0].thumb, withNaver[1].source], ["네이버", "https://search.pstatic.net/p", "위키백과"]);
  const naverDown = await searchCovers("나의 아저씨", "drama", { fetcher, naver: async () => { throw new Error("503"); } });
  assert.equal(naverDown[0].source, "위키백과", "a missing Naver key changes nothing else");
  assert.ok(sameWork("나혼자만 레벨업!", ["나 혼자만 레벨업"]) && !sameWork("체인소 맨", ["나 혼자만 레벨업"]));
  assert.equal(interleave([[{ url: "a" }, { url: "b" }, { url: "c" }], [{ url: "d" }]], 3).map((x) => x.url).join(""), "adb");
  const blob = new Blob(["x"], { type: "image/jpeg" });
  assert.equal(await downloadCover("u", { fetcher: async () => ({ ok: true, blob: async () => blob }) }), blob);
  assert.equal(await downloadCover("u", { fetcher: async () => { throw new TypeError("CORS"); } }), null);
  assert.equal(await downloadCover("u", { fetcher: async () => ({ ok: true, blob: async () => new Blob(["<html>"], { type: "text/html" }) }) }), null);
});

test("Q&A reviews keep valid entries, number the archive and ask each built-in question once", async () => {
  const { archiveNumbers } = await import("../src/contents/model.js");
  const { nextQuestion, questionPlan, awaitingAnswer } = await import("../src/contents/interview.js");
  const value = validateItem({ version: 1, id: "q", title: "듄", type: "movie",
    dialogue: [{ id: "1", role: "guide", text: "질문" }, { id: "2", role: "robot", text: "답" }, { id: 3, text: "x" }, null] });
  assert.deepEqual(value.dialogue.map((x) => [x.id, x.role]), [["1", "guide"], ["2", "me"]]);
  assert.deepEqual(validateItem({ version: 1, id: "old", title: "옛 기록", type: "movie" }).dialogue, [], "older rows get an empty dialogue");

  const items = [
    item("b", { createdAt: "2026-02-01T00:00:00.000Z" }),
    item("a", { createdAt: "2026-01-01T00:00:00.000Z" }),
    item("u", { status: "upcoming", createdAt: "2025-01-01T00:00:00.000Z" }),
    item("d", { deletedAt: "2026-03-01T00:00:00.000Z", createdAt: "2025-06-01T00:00:00.000Z" }),
  ];
  assert.deepEqual([...archiveNumbers(items)], [["a", 1], ["b", 2]]);

  const movie = item("m", { type: "movie", rating: 5 });
  const first = nextQuestion(movie);
  assert.equal(first, questionPlan(movie)[0]);
  const asked = { ...movie, dialogue: [{ id: "1", role: "guide", text: first }, { id: "2", role: "me", text: "좋았어" }] };
  assert.notEqual(nextQuestion(asked), first);
  assert.equal(awaitingAnswer(asked.dialogue), false);
  assert.equal(awaitingAnswer([{ id: "1", role: "guide", text: first }]), true);
  const done = { ...movie, dialogue: questionPlan(movie).map((text, i) => ({ id: String(i), role: "claude", text })) };
  assert.equal(nextQuestion(done), null);
  assert.ok(questionPlan(item("x", { rating: 1.5 })).some((q) => q.includes("아쉬웠던")));
});

test("dropped or pasted pictures are read from files or from the page's image, and cropped to the cover shape", async () => {
  const { imageFromTransfer, mayHoldImage, coverCrop } = await import("../src/contents/intake.js");
  const transfer = (data, files = []) => ({ files, types: Object.keys(data), getData: (type) => data[type] || "" });
  const file = { type: "image/png" };
  assert.deepEqual(imageFromTransfer(transfer({ "text/html": "<img src='https://x/a.jpg'>" }, [{ type: "text/plain" }, file])), { file });
  assert.deepEqual(imageFromTransfer(transfer({
    "text/uri-list": "https://www.google.com/imgres?imgurl=x",
    "text/html": '<a href="/x"><img alt="" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:a&amp;s"></a>',
  })), { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:a&s" }, "a picture dragged from Google Images");
  assert.deepEqual(imageFromTransfer(transfer({ "text/html": '<img src="data:image/jpeg;base64,AAA">' })), { url: "data:image/jpeg;base64,AAA" });
  assert.deepEqual(imageFromTransfer(transfer({ "text/plain": "https://site/poster.webp?w=600" })), { url: "https://site/poster.webp?w=600" });
  assert.equal(imageFromTransfer(transfer({ "text/plain": "그냥 글자" })), null);
  assert.equal(imageFromTransfer(transfer({ "text/uri-list": "https://site/page" })), null, "a plain page link is not a picture");
  assert.ok(mayHoldImage({ types: ["Files"] }) && !mayHoldImage({ types: ["text/plain"] }));
  assert.deepEqual(coverCrop(1200, 800), { x: 300, y: 0, width: 600, height: 800 }, "wide stills keep their middle");
  assert.deepEqual(coverCrop(600, 1200), { x: 0, y: 200, width: 600, height: 800 });
  assert.deepEqual(coverCrop(300, 400), { x: 0, y: 0, width: 300, height: 400 });
});
