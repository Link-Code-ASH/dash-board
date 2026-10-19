import { VERSION, uid } from "./model.js";

// Imported words all go into one pool deck. Word books are lists the user makes
// in the app: they hold no words, only references (`items[].id` is the word's
// entry key, see filter.js) to words in the pool or in older imported decks.
export const POOL_ID = "pool";
export const POOL_NAME = "전체 단어";
export const isBook = (deck) => deck?.kind === "book";

export function newBook(name, id = `book:${uid()}`) {
  if (!name.trim()) throw new Error("단어장 이름을 입력해 주세요.");
  return { version: VERSION, id, name: name.trim(), source: null, words: [], kind: "book", items: [] };
}

function book(current) {
  if (!isBook(current) || current.deleted) throw new Error("단어장을 찾을 수 없습니다. 목록을 다시 확인해 주세요.");
  return current;
}

export function addToBook(current, keys) {
  const value = book(current), have = new Set(value.items.map((item) => item.id));
  const added = [...new Set(keys)].filter((key) => !have.has(key)).map((id) => ({ id }));
  return { ...value, items: [...value.items, ...added] };
}

export function removeFromBook(current, keys) {
  const value = book(current), drop = new Set(keys);
  return { ...value, items: value.items.filter((item) => !drop.has(item.id)) };
}

export function renameBook(current, name) {
  if (!name.trim()) throw new Error("단어장 이름을 입력해 주세요.");
  return { ...book(current), name: name.trim() };
}

// The cloud table has no DELETE grant, so a removed book is only hidden.
export const deleteBook = (current) => ({ ...book(current), deleted: true });
