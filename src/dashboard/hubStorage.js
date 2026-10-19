import { ACCOUNT_CACHE_PREFIX, ACCOUNT_RECOVERY_PREFIX, STORAGE_KEY } from "./model.js";

// HUB's dashboard data used to live in localStorage, which browsers cap at about
// 5MB per site. Several full copies (this device's data, the account cache, the
// last-synced base, save journals, recovery drafts) filled it and sync stopped.
//
// hubStorage keeps the same synchronous Storage interface the sync code already
// uses, but the large keys live in IndexedDB (hundreds of MB or more) behind an
// in-memory copy that is loaded before the app renders. Small settings keys stay
// in localStorage. Every write starts its IndexedDB transaction immediately;
// callers that hand data to another window or to the cloud wait for flushed().

const DB_NAME = "hub-data-v1";
const STORE = "entries";
const BASE_PREFIX = "hub-account-base-v1:";

export function isLargeKey(key) {
  if (typeof key !== "string") return false;
  return key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:`) || key.startsWith(ACCOUNT_CACHE_PREFIX)
    || key.startsWith(BASE_PREFIX) || key.startsWith(ACCOUNT_RECOVERY_PREFIX);
}

function request(value) {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function stampOf(key, raw) {
  try {
    const value = JSON.parse(raw);
    if (key.startsWith(BASE_PREFIX)) return Number(value?.revision) || 0;
    return Date.parse(value?.updatedAt || "") || 0;
  } catch {
    return 0;
  }
}

export function createHubStorage(options = {}) {
  // Resolved on use, so tests and browsers that install storage later still work.
  const { archive = async () => {} } = options;
  const localStore = () => ("local" in options ? options.local : globalThis.localStorage);
  const memory = new Map();
  let db = null;
  let pending = Promise.resolve();
  let failure = null;
  let abandoned = false;

  const enqueue = (operation) => {
    if (!db) return;
    const database = db;
    const write = new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("HUB 저장소에 쓰지 못했습니다."));
    });
    write.catch((error) => { failure = error; });
    pending = pending.then(() => write, () => write);
  };

  const storage = {
    get ready() { return Boolean(db); },
    get length() { return this.keys().length; },
    keys() {
      const local = localStore();
      const small = Array.from({ length: local.length }, (_, index) => local.key(index)).filter((key) => key !== null && !(db && isLargeKey(key)));
      return db ? [...small, ...memory.keys()] : small;
    },
    key(index) { return this.keys()[index] ?? null; },
    getItem(key) {
      if (db && isLargeKey(key)) return memory.has(key) ? memory.get(key) : null;
      return localStore().getItem(key);
    },
    setItem(key, value) {
      const raw = String(value);
      if (!(db && isLargeKey(key))) { localStore().setItem(key, raw); return; }
      memory.set(key, raw);
      enqueue((store) => store.put({ key, raw }));
    },
    removeItem(key) {
      if (!(db && isLargeKey(key))) { localStore().removeItem(key); return; }
      memory.delete(key);
      enqueue((store) => store.delete(key));
    },
    /** Resolves once every write so far is committed; rejects if one failed. */
    async flushed() {
      await pending;
      if (failure) { const error = failure; failure = null; throw error; }
    },
    /** Re-read IndexedDB so writes made by other windows are seen. */
    async refresh() {
      if (!db) return;
      for (;;) {
        const waited = pending;
        await waited.catch(() => {});
        const rows = await request(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
        // A write made while reading is newer than these rows; read again.
        if (pending !== waited) continue;
        memory.clear();
        for (const { key, raw } of rows) memory.set(key, raw);
        return;
      }
    },
    /**
     * Open IndexedDB, move large localStorage keys into it (written and read
     * back before removal), and load everything into memory. Without IndexedDB
     * the storage keeps working on localStorage alone.
     */
    /** Give up on a slow open so the app can start on localStorage instead. */
    abandon() { if (!db) abandoned = true; },
    async open() {
      if (db) return true;
      const indexedDB = "indexedDB" in options ? options.indexedDB : globalThis.indexedDB;
      const local = localStore();
      if (!indexedDB || !local) return false;
      let database;
      try {
        const opening = indexedDB.open(DB_NAME, 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: "key" });
        database = await request(opening);
      } catch {
        return false;
      }
      const rows = await request(database.transaction(STORE, "readonly").objectStore(STORE).getAll());
      const stored = new Map(rows.map(({ key, raw }) => [key, raw]));
      const moving = Array.from({ length: local.length }, (_, index) => local.key(index))
        .filter(isLargeKey).map((key) => ({ key, raw: local.getItem(key) })).filter(({ raw }) => raw !== null);
      const put = [];
      for (const { key, raw } of moving) {
        const existing = stored.get(key);
        if (existing === undefined || existing === raw) { if (existing === undefined) put.push({ key, raw }); continue; }
        // Both copies exist (an older app version wrote localStorage after the
        // move). Keep the newer one in place and the other as a recovery copy.
        const localNewer = stampOf(key, raw) > stampOf(key, existing);
        await archive(`${key}:recovery-dual:${Date.now()}:${localNewer ? "idb" : "local"}`, localNewer ? existing : raw);
        if (localNewer) put.push({ key, raw });
      }
      if (put.length) {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE, "readwrite");
          const store = transaction.objectStore(STORE);
          put.forEach((row) => store.put(row));
          transaction.oncomplete = resolve;
          transaction.onerror = transaction.onabort = () => reject(transaction.error);
        });
        put.forEach(({ key, raw }) => stored.set(key, raw));
      }
      const check = await request(database.transaction(STORE, "readonly").objectStore(STORE).getAll());
      const verified = new Map(check.map(({ key, raw }) => [key, raw]));
      // Past this point nothing awaits, so localStorage copies are only removed
      // when this storage really switches to IndexedDB.
      if (abandoned) { database.close(); return false; }
      for (const { key, raw } of moving) {
        if (verified.has(key) && local.getItem(key) === raw) local.removeItem(key);
      }
      for (const [key, raw] of verified) memory.set(key, raw);
      db = database;
      return true;
    },
  };
  return storage;
}

export const hubStorage = createHubStorage({
  archive: async (key, raw) => {
    const { archiveRecoveryRaw } = await import("./recoveryArchive.js");
    await archiveRecoveryRaw(key, raw);
  },
});

/** Called once before the app renders. Asks the browser not to evict HUB data. */
export async function openHubStorage() {
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  // A blocked IndexedDB must not leave HUB on a blank screen.
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => { hubStorage.abandon(); resolve(false); }, 8000); });
  try { return await Promise.race([hubStorage.open(), timeout]); } catch { return false; } finally { clearTimeout(timer); }
}
