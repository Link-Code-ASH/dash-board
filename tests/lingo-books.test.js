import test from "node:test";
import assert from "node:assert/strict";
import { validateDeck, validateBackup, emptyDeck, importWords, inspectRows } from "../src/lingo/model.js";
import { POOL_ID, POOL_NAME, newBook, addToBook, removeFromBook, renameBook, deleteBook } from "../src/lingo/books.js";
import { collectWordEntries } from "../src/lingo/filter.js";

const rows = [["일본어", "한국어 뜻"], ["猫", "고양이"], ["犬", "개"]];

test("imports collect into the pool and books only reference words", () => {
  const pool = importWords(emptyDeck(POOL_NAME, POOL_ID), inspectRows(rows), null);
  const keys = collectWordEntries([pool]).map((entry) => entry.key);
  let book = validateDeck(addToBook(newBook(" 동물 ", "book:a"), [keys[0], keys[0]]));
  assert.equal(book.name, "동물");
  assert.deepEqual(book.items, [{ id: keys[0] }]);
  book = validateDeck(addToBook(book, keys));
  assert.equal(book.items.length, 2);
  assert.deepEqual(collectWordEntries([pool, book]).map((entry) => entry.key), keys);
  book = validateDeck(removeFromBook(renameBook(book, "반려동물"), [keys[0]]));
  assert.equal(book.name, "반려동물");
  assert.deepEqual(book.items, [{ id: keys[1] }]);
  const gone = validateDeck(deleteBook(book));
  assert.equal(gone.deleted, true);
  assert.deepEqual(gone.items, book.items);
  assert.throws(() => addToBook(gone, keys));
  assert.equal(validateBackup({ version: 1, decks: [pool, gone] }).decks.length, 2);
});

test("broken books are rejected", () => {
  const book = newBook("A", "book:b");
  assert.throws(() => newBook("  "));
  assert.throws(() => validateDeck({ ...book, items: [{ id: "x" }, { id: "x" }] }));
  assert.throws(() => validateDeck({ ...book, items: [{}] }));
  assert.throws(() => validateDeck({ ...book, kind: "other" }));
  assert.throws(() => validateDeck({ ...book, deleted: "yes" }));
});
