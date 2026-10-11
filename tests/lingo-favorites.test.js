import test from "node:test";
import assert from "node:assert/strict";
import { VERSION, emptyDeck, importWords, inspectRows, setFavorites, validateBackup, validateDeck } from "../src/lingo/model.js";
import { collectWordEntries, filterWordEntries, wordEntryKey } from "../src/lingo/filter.js";
import { favoriteDeckChanges } from "../src/lingo/favorites.js";
import { createLingoStore } from "../src/lingo/store.js";

const copy = (value) => structuredClone(value);
const source = { type: "file", name: "words.csv", sheetName: "words" };
const fixture = (id = "deck-a", count = 3) => validateDeck({ ...emptyDeck(id, id), words: Array.from({ length: count }, (_, index) => ({
  id: `word-${index}`, japanese: `語${index}`, reading: `ご${index}`, meaning: `뜻 ${index}`,
  example: "", translation: "", stage: index % 5 + 1,
})) });

function memoryStorage() {
  const records = new Map();
  let writes = 0, failure = false;
  return {
    records,
    get writes() { return writes; },
    fail(value) { failure = value; },
    read: async (owner) => copy(records.get(owner)),
    write: async (owner, value) => {
      if (failure) throw new Error("저장 공간 부족");
      records.set(owner, copy(value)); writes += 1;
    },
  };
}
function memoryCloud() {
  const rows = new Map();
  return {
    rows,
    read: async () => copy([...rows.values()]),
    write: async (deck, revision) => {
      if ((rows.get(deck.id)?.revision || 0) !== revision)
        throw Object.assign(new Error("revision conflict"), { code: "LINGO_CONFLICT" });
      rows.set(deck.id, { deck_id: deck.id, revision: revision + 1, payload: copy(deck) });
      return revision + 1;
    },
  };
}
const makeStore = (storage, cloud = null, owner = "owner") => createLingoStore(owner, {
  storage, cloud, lock: async (_, action) => action(),
});

test("version 1 legacy words default to unfavorited without mutating input; malformed values are rejected", () => {
  const legacy = fixture();
  legacy.words.forEach((word) => { delete word.favorite; word.customField = "보존"; });
  const before = copy(legacy), normalized = validateDeck(legacy);
  assert.equal(normalized.version, VERSION);
  assert.deepEqual(normalized.words.map((word) => word.favorite), [false, false, false]);
  assert.equal(normalized.words[0].customField, "보존");
  assert.deepEqual(legacy, before);
  assert.deepEqual(validateBackup({ version: 1, decks: [legacy] }).decks[0], normalized);
  for (const value of [null, 0, 1, "true", [], {}]) {
    const deck = copy(legacy); deck.words[0].favorite = value;
    assert.throws(() => validateDeck(deck), /즐겨찾기/);
  }
});

test("reimports preserve true and false favorites, stages, IDs and omitted words; new words start unfavorited", () => {
  const original = setFavorites(fixture(), ["word-0", "word-2"], true);
  original.words[0].stage = 5;
  const rows = [["일본어", "한국어 뜻", "읽는 법"], ["語0", "바뀐 뜻", "ご0"], ["語1", "둘째 뜻", "ご1"], ["新語", "새 단어", "しんご"]];
  const inspection = inspectRows(rows, original);
  // Source metadata must never replace these user-owned settings.
  inspection.words.forEach((word, index) => { word.favorite = index !== 0; });
  const imported = importWords(original, inspection, source);
  assert.deepEqual(imported.words.slice(0, 3).map((word) => word.favorite), [true, false, true]);
  assert.deepEqual(imported.words.slice(0, 3).map((word) => word.id), original.words.map((word) => word.id));
  assert.equal(imported.words[0].stage, 5);
  assert.equal(imported.words[0].meaning, "바뀐 뜻");
  assert.equal(imported.words[3].favorite, false);
  assert.equal(imported.words[3].stage, 1);
  assert.equal(original.words[0].meaning, "뜻 0");
  const legacy = copy(original); legacy.words.forEach((word) => delete word.favorite);
  assert.deepEqual(importWords(legacy, inspectRows(rows, legacy), source).words.map((word) => word.favorite), [false, false, false, false]);
});

test("favorite operations use stable source IDs across decks and preserve later content and stages", async () => {
  const storage = memoryStorage(), store = makeStore(storage);
  const decks = [fixture("deck-a"), fixture("deck-b")];
  await store.changeMany(decks.map((deck) => ({ id: deck.id, transform: () => deck })));
  const entries = collectWordEntries(decks), targets = [entries[0], entries[3]];
  const operations = favoriteDeckChanges(targets, true), writes = storage.writes;
  targets[0].word.meaning = "오래된 화면 내용";
  await store.change("deck-a", (current) => ({ ...current, name: "최신 이름", words: current.words.map((word) => word.id === "word-0" ?
    { ...word, meaning: "최신 뜻", stage: 5, topics: ["중요"] } : word) }));
  await store.changeMany(operations);
  assert.equal(storage.writes, writes + 2);
  const [a, b] = store.getSnapshot().decks;
  assert.equal(a.name, "최신 이름");
  assert.equal(a.words[0].favorite, true);
  assert.equal(b.words[0].favorite, true);
  assert.equal(a.words[0].meaning, "최신 뜻");
  assert.equal(a.words[0].stage, 5);
  assert.deepEqual(a.words[0].topics, ["중요"]);
  assert.equal(a.words[1].favorite, false);
  assert.equal(b.words[0].stage, 1);
  await store.changeMany(favoriteDeckChanges(collectWordEntries([a]).slice(0, 1), false));
  assert.equal(store.getSnapshot().decks[0].words[0].favorite, false);
  assert.equal(store.getSnapshot().decks[1].words[0].favorite, true);
});

test("bulk favorite membership includes every filtered page while unrelated filtered-out words remain unchanged", async () => {
  const storage = memoryStorage(), store = makeStore(storage);
  const deck = fixture("many", 123);
  deck.words.forEach((word, index) => { word.topics = index < 120 ? ["범위"] : ["제외"]; });
  await store.change(deck.id, () => deck);
  const entries = filterWordEntries(collectWordEntries([deck]), { topics: ["범위"] });
  assert.equal(entries.length, 120);
  assert.equal(entries.slice(0, 50).length, 50);
  const writes = storage.writes;
  await store.changeMany(favoriteDeckChanges(entries, true));
  assert.equal(storage.writes, writes + 1);
  assert.deepEqual(store.getSnapshot().decks[0].words.map((word) => word.favorite), [
    ...Array(120).fill(true), false, false, false,
  ]);
  await store.changeMany(favoriteDeckChanges(entries, false));
  assert.ok(store.getSnapshot().decks[0].words.every((word) => !word.favorite));
});

test("invalid favorite requests and stale targets abort all decks before any write; failed writes remain retryable", async () => {
  const storage = memoryStorage(), store = makeStore(storage);
  const decks = [fixture("deck-a"), fixture("deck-b")];
  await store.changeMany(decks.map((deck) => ({ id: deck.id, transform: () => deck })));
  const entries = collectWordEntries(decks), before = copy(store.getSnapshot().decks), writes = storage.writes;
  for (const value of [1, null, "true"])
    assert.throws(() => favoriteDeckChanges(entries, value), /즐겨찾기/);
  assert.throws(() => favoriteDeckChanges([entries[0], entries[0]], true), /중복/);
  assert.throws(() => favoriteDeckChanges([{ ...entries[0], deckId: "deck-b" }], true), /원본/);
  const missingWord = { key: wordEntryKey("deck-b", "removed"), deckId: "deck-b", word: { id: "removed" } };
  const missingDeck = { key: wordEntryKey("missing", "word-0"), deckId: "missing", word: { id: "word-0" } };
  await assert.rejects(store.changeMany(favoriteDeckChanges([entries[0], missingWord], true)), /원본 단어/);
  await assert.rejects(store.changeMany(favoriteDeckChanges([entries[0], missingDeck], true)), /원본 단어장/);
  storage.fail(true);
  await assert.rejects(store.changeMany(favoriteDeckChanges(entries, true)), /저장 공간/);
  assert.equal(storage.writes, writes);
  assert.deepEqual(store.getSnapshot().decks, before);
  assert.deepEqual(storage.records.get("owner").entries.map((entry) => entry.deck), before);
  storage.fail(false);
  await store.changeMany(favoriteDeckChanges(entries, true));
  assert.equal(storage.writes, writes + 1);
  assert.ok(store.getSnapshot().decks.every((deck) => deck.words.every((word) => word.favorite)));
});

test("favorites survive offline reload, reconnection and version 1 backup restore with recovery", async () => {
  const storage = memoryStorage(), cloud = memoryCloud(), store = makeStore(storage, cloud, "offline");
  await store.change("deck-a", () => fixture());
  await store.sync();
  const onlineRead = cloud.read; cloud.read = async () => { throw new Error("offline"); };
  await store.changeMany(favoriteDeckChanges(collectWordEntries(store.getSnapshot().decks).slice(0, 1), true));
  await assert.rejects(store.sync(), /offline/);
  assert.equal(storage.records.get("offline").entries[0].dirty, true);
  store.dispose();
  const reload = makeStore(storage, cloud, "offline"); await reload.load();
  assert.equal(reload.getSnapshot().decks[0].words[0].favorite, true);
  cloud.read = onlineRead; await reload.sync();
  assert.equal(cloud.rows.get("deck-a").payload.words[0].favorite, true);
  const backup = await reload.exportBackup();
  assert.equal(backup.version, 1);
  await reload.changeMany(favoriteDeckChanges(collectWordEntries(reload.getSnapshot().decks), false));
  await reload.restoreBackup(backup);
  assert.equal(reload.getSnapshot().decks[0].words[0].favorite, true);
  assert.equal((await reload.exportRecovery()).recovery[0].decks[0].words[0].favorite, false);
});

test("two devices merge favorites with independent content and stage changes including legacy snapshots", async () => {
  const cloud = memoryCloud(), sa = memoryStorage(), sb = memoryStorage();
  const a = makeStore(sa, cloud, "a"), b = makeStore(sb, cloud, "b");
  const legacy = fixture(); legacy.words.forEach((word) => delete word.favorite);
  cloud.rows.set("deck-a", { deck_id: "deck-a", revision: 1, payload: legacy });
  await a.sync(); await b.sync();
  await a.changeMany(favoriteDeckChanges(collectWordEntries(a.getSnapshot().decks).slice(0, 1), true));
  await b.change("deck-a", (current) => ({ ...current, words: current.words.map((word, index) => index ? word : { ...word, stage: 4, meaning: "다른 기기의 뜻" }) }));
  await a.sync(); await b.sync(); await a.sync();
  for (const store of [a, b]) {
    const word = store.getSnapshot().decks[0].words[0];
    assert.equal(word.favorite, true);
    assert.equal(word.stage, 4);
    assert.equal(word.meaning, "다른 기기의 뜻");
    assert.equal((await store.exportRecovery()).recovery.length, 0);
  }
});

test("disposed account cancels late favorite writes without touching the new account", async () => {
  const storage = memoryStorage(), old = makeStore(storage, null, "old");
  await old.change("deck-a", () => fixture());
  const entries = collectWordEntries(old.getSnapshot().decks), before = copy(storage.records.get("old")), writes = storage.writes;
  const read = storage.read;
  let release, started;
  const waiting = new Promise((resolve) => { started = resolve; });
  storage.read = async (owner) => {
    if (owner !== "old") return read(owner);
    started(); await new Promise((resolve) => { release = resolve; }); return read(owner);
  };
  const pending = old.changeMany(favoriteDeckChanges(entries, true));
  await waiting; old.dispose();
  const current = makeStore(storage, null, "new"); await current.load();
  release(); await assert.rejects(pending, /계정/);
  assert.equal(storage.writes, writes);
  assert.deepEqual(storage.records.get("old"), before);
  assert.deepEqual(current.getSnapshot().decks, []);
  assert.equal(storage.records.has("new"), false);
});
