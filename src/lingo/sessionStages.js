import { wordEntryKey } from "./filter.js";

const validId = (id) => typeof id === "string" && Boolean(id.trim());
const checkStage = (stage) => {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5)
    throw new Error("단계는 1~5 중 선택해 주세요.");
};

// Session IDs include the deck so equal word IDs in different decks stay distinct.
// Only the stable source IDs cross the persistence boundary.
export function sessionStageChanges(words, draftStages = new Map()) {
  if (!Array.isArray(words) || !(draftStages instanceof Map))
    throw new Error("학습 단계 변경 목록이 올바르지 않습니다.");
  const byId = new Map();
  for (const word of words) {
    if (!word || !validId(word.id) || byId.has(word.id))
      throw new Error("학습 단어 ID를 확인할 수 없습니다.");
    checkStage(word.stage);
    byId.set(word.id, word);
  }
  const changes = [];
  for (const [id, stage] of draftStages) {
    if (!validId(id) || !byId.has(id))
      throw new Error("학습 목록에 없는 단어의 단계는 변경할 수 없습니다.");
    checkStage(stage);
    const word = byId.get(id);
    if (word.stage === stage) continue;
    // Old standalone sessions have no source mapping and cannot safely persist.
    if (!word.deckId || !word.sourceWordId) continue;
    if (!validId(word.deckId) || !validId(word.sourceWordId) ||
        id !== wordEntryKey(word.deckId, word.sourceWordId))
      throw new Error("단어의 원본 단어장과 ID가 일치하지 않습니다.");
    changes.push({ deckId: word.deckId, wordId: word.sourceWordId, stage });
  }
  return changes;
}

export function stageDeckChanges(changes) {
  if (!Array.isArray(changes)) throw new Error("학습 단계 변경 목록이 올바르지 않습니다.");
  const groups = new Map(), targets = new Set();
  for (const change of changes) {
    if (!change || !validId(change.deckId) || !validId(change.wordId))
      throw new Error("단계 변경에 필요한 단어장과 단어 ID가 없습니다.");
    checkStage(change.stage);
    const target = wordEntryKey(change.deckId, change.wordId);
    if (targets.has(target)) throw new Error("같은 단어의 단계 변경이 중복되었습니다.");
    targets.add(target);
    if (!groups.has(change.deckId)) groups.set(change.deckId, new Map());
    groups.get(change.deckId).set(change.wordId, change.stage);
  }
  // changeMany evaluates every transform against the latest snapshot before its
  // single write. A missing target aborts all decks, rather than dropping edits.
  return [...groups].map(([id, stages]) => ({
    id,
    transform: (current) => {
      if (!current || current.id !== id || !Array.isArray(current.words))
        throw new Error("학습한 원본 단어장을 찾을 수 없습니다. 단어장 목록을 확인해 주세요.");
      const existing = new Set(current.words.map((word) => word.id));
      if ([...stages.keys()].some((wordId) => !existing.has(wordId)))
        throw new Error("학습한 원본 단어를 찾을 수 없습니다. 단어장을 다시 확인해 주세요.");
      return { ...current, words: current.words.map((word) => stages.has(word.id) ?
        { ...word, stage: stages.get(word.id) } : word) };
    },
  }));
}
