import { ACCOUNT_CACHE_PREFIX, ACCOUNT_RECOVERY_PREFIX, STORAGE_KEY } from "./model.js";

// Recovery copies (merge drafts and same-origin conflict copies) used to pile
// up in localStorage until its ~5MB quota filled and sync stopped with
// "Recovery storage is full". They now move to IndexedDB, which has far more
// room. Nothing is deleted: an entry leaves localStorage only after the same
// text has been written to IndexedDB and read back.
const DB_NAME = "hub-recovery-archive-v1";
const STORE = "entries";

export function isRecoveryKey(key) {
  if (typeof key !== "string") return false;
  if (key.startsWith(ACCOUNT_RECOVERY_PREFIX)) return true;
  return (key.startsWith(`${STORAGE_KEY}:recovery:`) || key.startsWith(ACCOUNT_CACHE_PREFIX)) && key.includes(":recovery:");
}

const stamp = (key) => Number(key.match(/:(\d{10,})(?::|$)/)?.[1]) || 0;

function openArchive(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error("IndexedDB is unavailable.")); return; }
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("Recovery archive write failed."));
  });
}

// Move recovery entries out of localStorage; by default none stay (the
// download button reads the archive too). Returns how many moved.
export async function archiveRecoveryEntries(storage = globalThis.localStorage, { keep = 0, factory } = {}) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(isRecoveryKey)
    .sort((left, right) => stamp(right) - stamp(left) || right.localeCompare(left));
  const kept = new Set(keys.filter((key) => key.startsWith(ACCOUNT_RECOVERY_PREFIX)).slice(0, keep));
  const moving = keys.filter((key) => !kept.has(key)).map((key) => ({ key, raw: storage.getItem(key) })).filter(({ raw }) => raw !== null);
  if (!moving.length) return 0;
  const db = await openArchive(factory);
  try {
    const archivedAt = new Date().toISOString();
    await run(db, "readwrite", (store) => { moving.forEach(({ key, raw }) => store.put({ key, raw, archivedAt })); });
    let moved = 0;
    for (const { key, raw } of moving) {
      const saved = await run(db, "readonly", (store) => store.get(key));
      if (saved?.raw === raw && storage.getItem(key) === raw) { storage.removeItem(key); moved += 1; }
    }
    return moved;
  } finally {
    db.close();
  }
}

export async function readRecoveryArchive(factory) {
  let db;
  try { db = await openArchive(factory); } catch { return []; }
  try { return await run(db, "readonly", (store) => store.getAll()) || []; }
  finally { db.close(); }
}

// Newest account draft for this user, from localStorage or the archive.
export async function latestAccountDraft(userId, storage = globalThis.localStorage, factory) {
  const prefix = `${ACCOUNT_RECOVERY_PREFIX}${userId}:`;
  const local = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key) => key?.startsWith(prefix))
    .map((key) => ({ key, raw: storage.getItem(key) }));
  const archived = (await readRecoveryArchive(factory)).filter(({ key }) => key.startsWith(prefix));
  return [...local, ...archived].filter(({ raw }) => raw !== null)
    .sort((left, right) => stamp(right.key) - stamp(left.key) || right.key.localeCompare(left.key))[0] || null;
}

// A Storage-like view of localStorage plus archived entries, so the full
// recovery export still includes everything that was moved.
export function withRecoveryArchive(storage, archived) {
  const extra = archived.filter(({ key }) => storage.getItem(key) === null);
  const keys = [...Array.from({ length: storage.length }, (_, index) => storage.key(index)), ...extra.map(({ key }) => key)];
  const raw = new Map(extra.map(({ key, raw: value }) => [key, value]));
  return {
    get length() { return keys.length; },
    key: (index) => keys[index] ?? null,
    getItem: (key) => storage.getItem(key) ?? raw.get(key) ?? null,
  };
}

// Store one recovery copy directly in the archive (used when the same key had
// two different versions while moving data out of localStorage).
export async function archiveRecoveryRaw(key, raw, factory) {
  const db = await openArchive(factory);
  try { await run(db, "readwrite", (store) => store.put({ key, raw, archivedAt: new Date().toISOString() })); }
  finally { db.close(); }
}
