import test from "node:test";
import assert from "node:assert/strict";
import { clearGoogleToken, openGoogleSheet } from "../src/lingo/google.js";

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
      ? { values: [["일본어", "한국어 뜻"], ["猫", "고양이"]] }
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
