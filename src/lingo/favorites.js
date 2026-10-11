import { wordEntryKey } from "./filter.js";
import { setFavorites } from "./model.js";

const validId = (id) => typeof id === "string" && Boolean(id.trim());

// Take explicit final values and source IDs; UI state does not replace a newer
// word's content, stage, or another deck's identically named internal word ID.
export function favoriteDeckChanges(entries, favorite) {
  if (typeof favorite !== "boolean") throw new Error("즐겨찾기 값이 올바르지 않습니다.");
  if (!Array.isArray(entries)) throw new Error("즐겨찾기 변경 목록이 올바르지 않습니다.");
  const groups = new Map(), targets = new Set();
  for (const entry of entries) {
    if (!entry || !validId(entry.deckId) || !validId(entry.word?.id) ||
        entry.key !== wordEntryKey(entry.deckId, entry.word.id))
      throw new Error("즐겨찾기할 단어의 원본 단어장과 ID가 일치하지 않습니다.");
    if (targets.has(entry.key)) throw new Error("즐겨찾기할 단어가 중복되었습니다.");
    targets.add(entry.key);
    if (!groups.has(entry.deckId)) groups.set(entry.deckId, []);
    groups.get(entry.deckId).push(entry.word.id);
  }
  return [...groups].map(([id, ids]) => ({
    id,
    transform: (current) => {
      if (!current || current.id !== id)
        throw new Error("즐겨찾기할 원본 단어장을 찾을 수 없습니다. 단어장 목록을 확인해 주세요.");
      return setFavorites(current, ids, favorite);
    },
  }));
}
