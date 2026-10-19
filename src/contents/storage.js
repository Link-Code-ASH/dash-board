let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open("hub-contents-v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("accounts", { keyPath: "id" });
      request.result.createObjectStore("covers", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}
async function transact(name, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = operation(transaction.objectStore(name));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("Contents 로컬 저장에 실패했습니다."));
  });
}
export const localStorageAdapter = {
  read: (id) => transact("accounts", "readonly", (store) => store.get(id)),
  write: (id, value) => transact("accounts", "readwrite", (store) => store.put({ ...value, id })),
};
export const getCover = (id) => transact("covers", "readonly", (store) => store.get(id));
export const putCover = (record) => transact("covers", "readwrite", (store) => store.put(record));
const queues = new Map();
export function accountLock(id, action) {
  if (globalThis.navigator?.locks) return navigator.locks.request(`hub-contents:${id}`, action);
  const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(id, next);
  return next;
}
