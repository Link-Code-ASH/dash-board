import test from "node:test";
import assert from "node:assert/strict";
import { emptyDeck, importWords, inspectRows, setStages, validateBackup, validateDeck } from "../src/lingo/model.js";
import { parseCsv, openWordFile } from "../src/lingo/importFile.js";
import { createSession, judgeCard, swipeDirection, undoCard } from "../src/lingo/session.js";
import { createLingoStore } from "../src/lingo/store.js";
import { accountLock } from "../src/lingo/storage.js";
import { registerBackupProvider, exportModuleBackups, restoreModuleBackups } from "../src/hub/moduleRegistry.js";
import readExcel from "read-excel-file/node";
import { workbookFixture } from "./fixtures/lingo-workbook.js";

const rows = [["일본어", "한국어 뜻", "읽는 법", "예문", "예문 해석"], [" 猫 ", " 고양이 ", "ねこ", "猫がいます。", "고양이가 있습니다."], ["食べる", "먹다", "たべる"]];
const source = { type: "file", name: "words.csv", sheetName: "words" };
const fixture = () => importWords(emptyDeck("일상", "deck-1"), inspectRows(rows), source);
const copy = (value) => structuredClone(value);

test("real XLSX workbook preserves both sheet tabs and Japanese/Korean cells", async () => {
  const sheets = await readExcel(Buffer.from(workbookFixture()));
  assert.deepEqual(sheets.map((sheet) => sheet.sheet), ["일상 단어", "동사"]);
  assert.equal(inspectRows(sheets[0].data).words.length, 2);
  assert.equal(inspectRows(sheets[1].data).words[0].japanese, "食べる");
  assert.equal(inspectRows(sheets[1].data).words[0].translation, "아침밥을 먹습니다.");
});

test("import validates headers, missing required values, duplicate identities and empty rows", () => {
  const result = inspectRows([...rows, [], ["", "", "", "", ""]]);
  assert.equal(result.errors.length, 0); assert.equal(result.words.length, 2);
  assert.equal(result.words[0].japanese, "猫"); assert.equal(result.words[0].meaning, "고양이");
  assert.equal(inspectRows([["단어", "뜻"], ["猫", "고양이"]]).errors.length, 2);
  assert.equal(inspectRows([["일본어", "한국어 뜻", "일본어"]]).errors[0].row, 1);
  assert.match(inspectRows([rows[0], ["猫", ""]]).errors[0].message, /모두/);
  assert.equal(inspectRows([...rows, ["猫", "다른 뜻", "ねこ"]]).errors[0].row, 4);
  assert.equal(inspectRows([rows[0], [], ["猫", ""]]).errors[0].row, 3);
  assert.equal(inspectRows([rows[0]]).words.length, 0);
});

test("optional fields, UTF-8 BOM and quoted multiline CSV survive parsing", async () => {
  const text = '\uFEFF일본어,한국어 뜻\r\n猫,"고양이, 냥이"\r\n犬,"개\n강아지"\r\n';
  const parsed = parseCsv(text), result = inspectRows(parsed);
  assert.equal(result.errors.length, 0); assert.equal(result.words.length, 2);
  assert.equal(result.words[1].meaning, "개\n강아지"); assert.equal(result.words[0].reading, "");
  const workbook = await openWordFile(new File([text], "일본어.csv"));
  assert.deepEqual(workbook[0].rows, parsed);
  await assert.rejects(openWordFile(new File([new Uint8Array([0xff, 0xfe, 0xfd])], "bad.csv")), /UTF-8/);
  assert.throws(() => parseCsv('일본어,한국어 뜻\n猫,"unclosed'), /CSV/);
  await assert.rejects(openWordFile(new File(["test"], "old.xls")), /xlsx/);
});

test("reimport updates content, preserves stage and ID, keeps missing words, adds stage 1", () => {
  const original = setStages(fixture(), [fixture().words[0].id], 5);
  const incoming = [rows[0], ["猫", "냥이", "ねこ", "", ""], ["犬", "개", "いぬ"]];
  const preview = inspectRows(incoming, original);
  assert.deepEqual([preview.added, preview.updated], [1, 1]);
  const imported = importWords(original, preview, source);
  assert.equal(imported.words.length, 3);
  assert.equal(imported.words[0].stage, 5); assert.equal(imported.words[0].id, original.words[0].id);
  assert.equal(imported.words[0].meaning, "냥이"); assert.equal(imported.words[0].example, "");
  assert.equal(imported.words[1].japanese, "食べる"); assert.equal(imported.words[2].stage, 1);
  assert.equal(original.words[0].meaning, "고양이");
  assert.throws(() => importWords(original, inspectRows([rows[0], ["猫", ""]]), source));
  const changedReading = importWords(original, inspectRows([rows[0], ["猫", "고양이", "ネコ"]]), source);
  assert.equal(changedReading.words.length, 3);
});

test("stage assignment and backups reject malformed values without mutating data", () => {
  const deck = fixture();
  assert.deepEqual(setStages(deck, deck.words.map((w) => w.id), 4).words.map((w) => w.stage), [4, 4]);
  assert.deepEqual(deck.words.map((w) => w.stage), [1, 1]);
  for (const stage of [0, 6, 2.5, "3"]) assert.throws(() => setStages(deck, [], stage));
  assert.throws(() => validateDeck({ ...deck, version: 99 }));
  assert.throws(() => validateBackup({ version: 1, decks: [deck, deck] }));
  assert.throws(() => validateDeck({ ...deck, words: [...deck.words, { ...deck.words[0], id: "different" }] }));
});

test("session left cycles, right removes only from session, undo restores the last queue", () => {
  const deck = setStages(fixture(), fixture().words.map((w) => w.id), 4), before = copy(deck);
  const initial = createSession(deck.words, () => .99);
  const again = judgeCard(initial, false);
  assert.deepEqual(again.queue.map((w) => w.id), [...initial.queue].reverse().map((w) => w.id));
  const known = judgeCard(again, true);
  assert.equal(known.queue.length, 1);
  assert.deepEqual(undoCard(known).queue, again.queue); assert.equal(undoCard(known).previous, null);
  const one = judgeCard(known, false); assert.equal(one.queue.length, 1);
  const complete = judgeCard(one, true); assert.equal(complete.queue.length, 0);
  assert.equal(undoCard(complete).queue.length, 1);
  assert.deepEqual(deck, before);
  assert.equal(createSession(deck.words).queue.length, 2);
});

test("touch gestures distinguish horizontal swipes from taps and vertical scrolling", () => {
  assert.equal(swipeDirection(100, 12), "known"); assert.equal(swipeDirection(-100, 10), "again");
  assert.equal(swipeDirection(30, 5), null); assert.equal(swipeDirection(100, 100), null);
  assert.equal(swipeDirection(2, 150), null);
});

function memoryStorage() {
  const data = new Map();
  return { data, read: async (id) => copy(data.get(id)), write: async (id, value) => { data.set(id, copy(value)); } };
}
function memoryCloud() {
  const rows = new Map();
  return { rows, read: async () => copy([...rows.values()]), write: async (deck, revision) => {
    if ((rows.get(deck.id)?.revision || 0) !== revision) throw Object.assign(new Error("conflict"), { code: "LINGO_CONFLICT" });
    rows.set(deck.id, { deck_id: deck.id, payload: copy(deck), revision: revision + 1 });
    return revision + 1;
  } };
}
const makeStore = (storage = memoryStorage(), cloud = null, owner = "test") => createLingoStore(owner, { storage, cloud, lock: accountLock });

test("local changes survive reload and remain isolated per account", async () => {
  const storage = memoryStorage(), a = makeStore(storage, null, "a");
  await a.load(); await a.change("deck-1", fixture); a.dispose();
  const reload = makeStore(storage, null, "a"), b = makeStore(storage, null, "b");
  await reload.load(); await b.load();
  assert.equal(reload.getSnapshot().decks.length, 1); assert.equal(b.getSnapshot().decks.length, 0);
  await assert.rejects(a.change("deck-1", fixture), /계정/);
});

test("two devices merge independent changes, preserve scalar conflicts before upload", async () => {
  const cloud = memoryCloud(), sa = memoryStorage(), sb = memoryStorage();
  const a = makeStore(sa, cloud, "merge-a"), b = makeStore(sb, cloud, "merge-b");
  await a.change("deck-1", fixture); await a.sync(); await b.sync();
  await a.change("deck-1", (deck) => setStages(deck, [deck.words[0].id], 3));
  await b.change("deck-1", (deck) => ({ ...deck, name: "이름 변경" }));
  await a.sync(); await b.sync(); await a.sync();
  assert.equal(a.getSnapshot().decks[0].name, "이름 변경");
  assert.equal(b.getSnapshot().decks[0].words[0].stage, 3);
  await a.change("deck-1", (deck) => setStages(deck, [deck.words[0].id], 4));
  await b.change("deck-1", (deck) => setStages(deck, [deck.words[0].id], 5));
  await a.sync();
  const originalWrite = cloud.write;
  cloud.write = async (...args) => {
    assert.equal(sb.data.get("merge-b").recovery.length, 1, "recovery must be durable before cloud mutation");
    return originalWrite(...args);
  };
  await b.sync();
  assert.equal(b.getSnapshot().decks[0].words[0].stage, 5);
  const recovery = await b.exportRecovery();
  assert.equal(recovery.recovery[0].remote.words[0].stage, 4);
  assert.equal(recovery.recovery[0].local.words[0].stage, 5);
});

test("simultaneous imports of the same new word merge without duplicates", async () => {
  const cloud = memoryCloud(), a = makeStore(memoryStorage(), cloud, "import-a"), b = makeStore(memoryStorage(), cloud, "import-b");
  await a.change("deck-1", fixture); await a.sync(); await b.sync();
  const add = (deck) => importWords(deck, inspectRows([rows[0], ["犬", "개", "いぬ"]]), source);
  await a.change("deck-1", add); await b.change("deck-1", add);
  await a.sync(); await b.sync();
  assert.equal(b.getSnapshot().decks[0].words.length, 3);
});

test("offline edits stay pending and sync after reconnection", async () => {
  const cloud = memoryCloud(), storage = memoryStorage(), store = makeStore(storage, cloud, "offline");
  const read = cloud.read; cloud.read = async () => { throw new Error("offline"); };
  await store.change("deck-1", fixture);
  await assert.rejects(store.sync(), /offline/);
  assert.equal(storage.data.get("offline").entries[0].dirty, true);
  cloud.read = read; await store.sync();
  assert.equal(storage.data.get("offline").entries[0].dirty, false);
  assert.equal(cloud.rows.size, 1);
});

test("late remote responses after account disposal cannot publish or write", async () => {
  const storage = memoryStorage(); let release, started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const cloud = { read: () => { started(); return new Promise((resolve) => { release = resolve; }); }, write: () => assert.fail("must not write") };
  const a = makeStore(storage, cloud, "old-account"); await a.load();
  const syncing = a.sync(); await waiting; a.dispose();
  release([{ deck_id: "deck-1", revision: 1, payload: fixture() }]);
  await assert.rejects(syncing, /계정/);
  assert.equal(storage.data.has("old-account"), false);
  assert.equal(a.getSnapshot().decks.length, 0);
});

test("concurrent local writers reload under a shared account lock", async () => {
  const storage = memoryStorage(), a = makeStore(storage, null, "shared"), b = makeStore(storage, null, "shared");
  await a.change("deck-1", fixture);
  await Promise.all([
    a.change("deck-1", (deck) => setStages(deck, [deck.words[0].id], 2)),
    b.change("deck-1", (deck) => setStages(deck, [deck.words[1].id], 5)),
  ]);
  await a.load(); assert.deepEqual(a.getSnapshot().decks[0].words.map((w) => w.stage), [2, 5]);
});

test("CAS races retry and merge before overwriting another device", async () => {
  const cloud = memoryCloud(), store = makeStore(memoryStorage(), cloud, "cas");
  await store.change("deck-1", fixture); await store.sync();
  await store.change("deck-1", (deck) => setStages(deck, [deck.words[0].id], 4));
  const write = cloud.write; let once = true;
  cloud.write = async (deck, revision) => {
    if (once) { once = false; const row = cloud.rows.get(deck.id); row.payload.name = "remote edit"; row.revision++; }
    return write(deck, revision);
  };
  await store.sync();
  assert.equal(store.getSnapshot().decks[0].name, "remote edit");
  assert.equal(store.getSnapshot().decks[0].words[0].stage, 4);
});

test("storage failure prevents publishing or sending unsaved edits", async () => {
  const storage = memoryStorage(), cloud = memoryCloud(), store = makeStore(storage, cloud, "quota");
  await store.load(); storage.write = async () => { throw new Error("quota"); };
  await assert.rejects(store.change("deck-1", fixture), /quota/);
  assert.equal(store.getSnapshot().decks.length, 0); assert.equal(cloud.rows.size, 0);
});

test("global backup provider works without a Lingo view and rejects invalid restores atomically", async () => {
  const storage = memoryStorage(), store = makeStore(storage, null, "backup");
  await store.change("deck-1", fixture);
  const stop = registerBackupProvider({ id: "lingo", exportBackup: store.exportBackup, restoreBackup: store.restoreBackup });
  try {
    const backup = await exportModuleBackups(); assert.equal(backup.lingo.decks.length, 1);
    await store.change("deck-1", (deck) => setStages(deck, [deck.words[0].id], 5));
    await restoreModuleBackups(backup);
    assert.equal(store.getSnapshot().decks[0].words[0].stage, 1);
    assert.equal((await store.exportRecovery()).recovery[0].decks[0].words[0].stage, 5);
    await assert.rejects(store.restoreBackup({ version: 1, decks: [fixture(), { bad: true }] }));
    assert.equal((await store.exportRecovery()).recovery.length, 1);
  } finally { stop(); }
});

test("unsupported remote versions cannot replace the local snapshot", async () => {
  const storage = memoryStorage(), cloud = memoryCloud(), store = makeStore(storage, cloud, "future");
  await store.change("deck-1", fixture);
  cloud.rows.set("deck-1", { deck_id: "deck-1", revision: 2, payload: { ...fixture(), version: 2 } });
  const before = copy(storage.data.get("future"));
  await assert.rejects(store.sync(), /지원하지/);
  assert.deepEqual(storage.data.get("future"), before);
});
