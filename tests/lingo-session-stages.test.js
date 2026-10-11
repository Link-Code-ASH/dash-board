import test from "node:test";
import assert from "node:assert/strict";
import { emptyDeck, validateDeck } from "../src/lingo/model.js";
import { wordEntryKey } from "../src/lingo/filter.js";
import { createSession, judgeCard, undoCard } from "../src/lingo/session.js";
import { sessionStageChanges, stageDeckChanges } from "../src/lingo/sessionStages.js";
import { createLingoStore } from "../src/lingo/store.js";

const copy = (value) => structuredClone(value);
const fixture = (id) => validateDeck({ ...emptyDeck(id, id), words: [
  { id: "shared-id", japanese: "食べる", meaning: "먹다", reading: "たべる", example: "ご飯を食べる。", translation: "밥을 먹다.", stage: 2 },
  { id: "other-id", japanese: "猫", meaning: "고양이", reading: "ねこ", example: "", translation: "", stage: 4 },
] });
const sourcedWords = (decks) => decks.flatMap((deck) => deck.words.map((word) => ({
  ...word, id: wordEntryKey(deck.id, word.id), deckId: deck.id, sourceWordId: word.id,
})));

function storeFixture() {
  const records = new Map();
  let writes = 0, fail = false;
  const storage = {
    read: async (owner) => copy(records.get(owner)),
    write: async (owner, record) => {
      if (fail) throw new Error("저장 공간을 사용할 수 없습니다.");
      writes += 1;
      records.set(owner, copy(record));
    },
  };
  const store = createLingoStore("owner", { storage, lock: async (_, action) => action() });
  return { store, records, get writes() { return writes; }, setFail(value) { fail = value; } };
}

test("manual session stages survive again, completion and undo while judgments never mutate stages", () => {
  const deck = fixture("deck-a"), words = sourcedWords([deck]), before = copy(words);
  const pending = new Map([[words[0].id, 5]]);
  const payload = [{ deckId: "deck-a", wordId: "shared-id", stage: 5 }];
  let session = createSession(words, () => .99);
  session = judgeCard(session, false);
  assert.deepEqual(sessionStageChanges(words, pending), payload);
  session = judgeCard(judgeCard(session, true), true);
  assert.equal(session.queue.length, 0);
  assert.deepEqual(sessionStageChanges(words, pending), payload);
  session = undoCard(session);
  assert.equal(session.queue.length, 1);
  assert.deepEqual(sessionStageChanges(words, pending), payload);
  assert.deepEqual(words, before);
  assert.deepEqual(deck.words.map((word) => word.stage), [2, 4]);
});

test("only final changed stages persist; reset and unsourced legacy sessions yield no changes", () => {
  const words = sourcedWords([fixture("deck-a")]);
  const drafts = new Map([[words[0].id, 5]]);
  drafts.set(words[0].id, 3);
  assert.deepEqual(sessionStageChanges(words, drafts), [{ deckId: "deck-a", wordId: "shared-id", stage: 3 }]);
  drafts.set(words[0].id, 2);
  assert.deepEqual(sessionStageChanges(words, drafts), []);
  assert.deepEqual(sessionStageChanges(words), []);
  assert.deepEqual(stageDeckChanges([]), []);
  const legacy = fixture("deck-a").words;
  assert.deepEqual(sessionStageChanges(legacy, new Map([[legacy[0].id, 5]])), []);
});

test("composite IDs keep matching word IDs across decks distinct and reject inconsistent source mappings", () => {
  const words = sourcedWords([fixture("deck-a"), fixture("deck-b")]);
  const drafts = new Map([[words[0].id, 5], [words[2].id, 1]]);
  assert.deepEqual(sessionStageChanges(words, drafts), [
    { deckId: "deck-a", wordId: "shared-id", stage: 5 },
    { deckId: "deck-b", wordId: "shared-id", stage: 1 },
  ]);
  assert.throws(() => sessionStageChanges([{ ...words[0], deckId: "deck-b" }], new Map([[words[0].id, 5]])), /원본/);
  assert.throws(() => sessionStageChanges([words[0], words[0]], new Map()), /ID/);
  assert.throws(() => sessionStageChanges(words, new Map([["unknown", 5]])), /학습 목록/);
});

test("all stage payload values and duplicate targets are rejected before creating deck transforms", () => {
  const word = sourcedWords([fixture("deck-a")])[0];
  for (const stage of [0, 6, 2.5, "3", NaN]) {
    assert.throws(() => sessionStageChanges([word], new Map([[word.id, stage]])), /1~5/);
    assert.throws(() => stageDeckChanges([{ deckId: "deck-a", wordId: "shared-id", stage }]), /1~5/);
  }
  for (const change of [{ deckId: "", wordId: "shared-id", stage: 3 }, { deckId: "deck-a", stage: 3 }, { deckId: 1, wordId: "shared-id", stage: 3 }])
    assert.throws(() => stageDeckChanges([change]), /ID/);
  assert.throws(() => stageDeckChanges([
    { deckId: "deck-a", wordId: "shared-id", stage: 3 },
    { deckId: "deck-a", wordId: "shared-id", stage: 5 },
  ]), /중복/);
});

test("one store write applies cross-deck stages against latest content and preserves unrelated edits", async () => {
  const f = storeFixture();
  await f.store.load();
  const decks = [fixture("deck-a"), fixture("deck-b")];
  await f.store.changeMany(decks.map((deck) => ({ id: deck.id, transform: () => deck })));
  const words = sourcedWords(decks), pending = new Map([[words[0].id, 5], [words[2].id, 1]]);
  await f.store.change("deck-a", (current) => ({ ...current, name: "새 제목", words: current.words.map((word) => word.id === "shared-id" ?
    { ...word, meaning: "먹다 (갱신)", hanja: "食 먹을 식", topics: ["음식"] } : { ...word, stage: 3 }) }));
  const changes = sessionStageChanges(words, pending), before = f.writes;
  const operations = stageDeckChanges(changes);
  // Prepared transformations are snapshots of values, not references to a
  // caller-owned payload that may be changed while a store lock is pending.
  changes[0].stage = 1;
  await f.store.changeMany(operations);
  assert.equal(f.writes, before + 1);
  const [a, b] = f.store.getSnapshot().decks;
  assert.equal(a.name, "새 제목");
  assert.equal(a.words[0].stage, 5);
  assert.equal(a.words[0].meaning, "먹다 (갱신)");
  assert.equal(a.words[0].hanja, "食 먹을 식");
  assert.deepEqual(a.words[0].topics, ["음식"]);
  assert.equal(a.words[1].stage, 3);
  assert.equal(b.words[0].stage, 1);
  assert.equal(b.words[1].stage, 4);
  assert.deepEqual(decks.map((deck) => deck.words[0].stage), [2, 2]);
});

test("a missing latest word or deck aborts every stage change without any write", async () => {
  const f = storeFixture();
  await f.store.load();
  await f.store.changeMany(["deck-a", "deck-b"].map((id) => ({ id, transform: () => fixture(id) })));
  const before = copy(f.store.getSnapshot().decks), writes = f.writes;
  const valid = { deckId: "deck-a", wordId: "shared-id", stage: 5 };
  await assert.rejects(f.store.changeMany(stageDeckChanges([valid, { deckId: "deck-b", wordId: "removed", stage: 3 }])), /원본 단어/);
  await assert.rejects(f.store.changeMany(stageDeckChanges([valid, { deckId: "missing-deck", wordId: "shared-id", stage: 3 }])), /원본 단어장/);
  assert.equal(f.writes, writes);
  assert.deepEqual(f.store.getSnapshot().decks, before);
  assert.deepEqual(f.records.get("owner").entries.map((entry) => entry.deck), before);
  assert.throws(() => stageDeckChanges([valid])[0].transform(fixture("wrong-deck")), /원본 단어장/);
});

test("failed stage save leaves payload reusable, snapshot unchanged and retries atomically", async () => {
  const f = storeFixture();
  await f.store.load();
  await f.store.change("deck-a", () => fixture("deck-a"));
  const words = sourcedWords(f.store.getSnapshot().decks), pending = new Map([[words[0].id, 5]]);
  const payload = sessionStageChanges(words, pending), before = copy(f.store.getSnapshot().decks), writes = f.writes;
  f.setFail(true);
  await assert.rejects(f.store.changeMany(stageDeckChanges(payload)), /저장 공간/);
  assert.equal(f.writes, writes);
  assert.deepEqual(f.store.getSnapshot().decks, before);
  assert.deepEqual(sessionStageChanges(words, pending), payload);
  assert.equal(payload[0].stage, 5);
  f.setFail(false);
  await f.store.changeMany(stageDeckChanges(payload));
  assert.equal(f.writes, writes + 1);
  assert.equal(f.store.getSnapshot().decks[0].words[0].stage, 5);
});
