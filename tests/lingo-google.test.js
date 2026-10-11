import test from "node:test";
import assert from "node:assert/strict";
import { clearGoogleToken, openGoogleSheet } from "../src/lingo/google.js";
import { HEADERS, emptyDeck, importWords, inspectRows } from "../src/lingo/model.js";

const sheetValues = [HEADERS, ["猫", "고양이", "ねこ", "猫 고양이 묘\n子 아들 자", "猫がいます。", "ねこがいます。", "고양이가 있습니다.", "명사; 일반명사;명사", " N5 ", "동물; 일상;동물"]];

test("Google import uses selected source, escapes sheet names, reads only and renews expired access", async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  let authorizations = 0, expired = false;
  const calls = [];
  globalThis.window = { google: { accounts: { oauth2: {
    hasGrantedAllScopes: () => true,
    initTokenClient: (options) => {
      assert.equal(options.scope, "https://www.googleapis.com/auth/drive.file");
      return { requestAccessToken: () => { authorizations++; options.callback({ access_token: "test-only", expires_in: 3600 }); } };
    },
  } } } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (expired) return { status: 401, ok: false };
    return { status: 200, ok: true, json: async () => url.includes("/values/")
      ? { values: structuredClone(sheetValues) }
      : { properties: { title: "Vocabulary" }, sheets: [{ properties: { title: "John's 単語", sheetId: 7, sheetType: "GRID" } }] } };
  };
  try {
    clearGoogleToken();
    const signal = new AbortController().signal;
    const sheet = await openGoogleSheet({ documentId: "test-document" }, signal);
    assert.equal(sheet.documentId, "test-document"); assert.equal(sheet.sheets[0].sheetId, 7);
    assert.equal((await sheet.sheets[0].read(signal))[1][0], "猫");
    assert.match(decodeURIComponent(calls[1].url), /'John''s 単語'/);
    assert.ok(calls.every(({ options }) => options.method === undefined && options.body === undefined));
    expired = true;
    await assert.rejects(openGoogleSheet({ documentId: "test-document" }, signal), /期限|만료/);
    expired = false;
    await openGoogleSheet({ documentId: "test-document" }, signal);
    assert.equal(authorizations, 2);
  } finally { clearGoogleToken(); globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

test("Google account changes cancel pending consent and ignore late authorization callbacks", async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  let callback;
  globalThis.window = { google: { accounts: { oauth2: {
    hasGrantedAllScopes: () => true,
    initTokenClient: (options) => { callback = options.callback; return { requestAccessToken: () => {} }; },
  } } } };
  globalThis.fetch = () => assert.fail("A disposed account must never fetch a sheet");
  try {
    clearGoogleToken();
    const pending = openGoogleSheet({ documentId: "test-document" }, new AbortController().signal);
    clearGoogleToken();
    callback({ access_token: "late-test-only", expires_in: 3600 });
    await assert.rejects(pending, /취소/);
  } finally { clearGoogleToken(); globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

test("revoked/private Google files report actionable access errors", async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { google: { accounts: { oauth2: {
    hasGrantedAllScopes: () => true,
    initTokenClient: (options) => ({ requestAccessToken: () => options.callback({ access_token: "test", expires_in: 3600 }) }),
  } } } };
  globalThis.fetch = async () => ({ status: 403, ok: false });
  try {
    clearGoogleToken();
    await assert.rejects(openGoogleSheet({ documentId: "private" }, new AbortController().signal), /접근 권한/);
  } finally { clearGoogleToken(); globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

test("Google Sheets ten-column rows preserve metadata and use the same atomic import validation", async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  let values = structuredClone(sheetValues);
  globalThis.window = { google: { accounts: { oauth2: {
    hasGrantedAllScopes: () => true,
    initTokenClient: (options) => ({ requestAccessToken: () => options.callback({ access_token: "fixture-only", expires_in: 3600 }) }),
  } } } };
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, undefined); assert.equal(options.body, undefined);
    return { status: 200, ok: true, json: async () => url.includes("/values/")
      ? { values: structuredClone(values) }
      : { properties: { title: "단어 자료" }, sheets: [{ properties: { title: "日本語", sheetId: 9, sheetType: "GRID" } }] } };
  };
  try {
    clearGoogleToken();
    const signal = new AbortController().signal;
    const sheet = await openGoogleSheet({ documentId: "metadata-fixture" }, signal);
    const source = { type: "google", name: sheet.name, documentId: sheet.documentId, sheetName: sheet.sheets[0].name, sheetId: sheet.sheets[0].sheetId };
    const rows = await sheet.sheets[0].read(signal);
    const preview = inspectRows(rows);
    assert.equal(preview.errors.length, 0);
    const deck = importWords(emptyDeck("구글 단어장", "sheet-deck"), preview, source);
    assert.equal(deck.words[0].hanja, "猫 고양이 묘\n子 아들 자");
    assert.equal(deck.words[0].exampleReading, "ねこがいます。");
    assert.deepEqual(deck.words[0].partsOfSpeech, ["명사", "일반명사"]);
    assert.deepEqual(deck.words[0].topics, ["동물", "일상"]);
    assert.equal(deck.words[0].jlpt, "N5"); assert.equal(deck.words[0].stage, 1);
    assert.deepEqual(deck.source, source);
    const before = structuredClone(deck);
    values = structuredClone(sheetValues);
    const invalid = [...values[1]]; invalid[0] = "犬"; invalid[2] = "いぬ"; invalid[8] = "N6";
    values.push(invalid);
    const wrongLevel = inspectRows(await sheet.sheets[0].read(signal), deck);
    assert.equal(wrongLevel.errors.length, 1); assert.equal(wrongLevel.errors[0].row, 3);
    assert.match(wrongLevel.errors[0].message, /JLPT/);
    assert.throws(() => importWords(deck, wrongLevel, source), /오류/);
    assert.deepEqual(deck, before);
    values = [[...HEADERS, "품사"], [...sheetValues[1], "동사"]];
    const duplicateHeader = inspectRows(await sheet.sheets[0].read(signal), deck);
    assert.equal(duplicateHeader.errors[0].row, 1); assert.match(duplicateHeader.errors[0].message, /품사.*중복/);
    assert.throws(() => importWords(deck, duplicateHeader, source), /오류/);
    assert.deepEqual(deck, before);
  } finally { clearGoogleToken(); globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});
