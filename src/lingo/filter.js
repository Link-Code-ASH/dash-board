import { wordTopicGroups } from "./topicGroups.js";

export const UNCATEGORIZED = Symbol("uncategorized");
export const wordEntryKey = (deckId, wordId) => JSON.stringify([deckId, wordId]);

export function collectWordEntries(decks) {
  return decks.flatMap((deck) => deck.words.map((word) => ({
    key: wordEntryKey(deck.id, word.id), deckId: deck.id, deckName: deck.name,
    source: deck.source, word,
  })));
}

export function filterWordEntries(entries, filters = {}) {
  const choices = (values) => new Set(values || []);
  const decks = choices(filters.deckIds), stages = new Set([...choices(filters.stages)].map(Number));
  const parts = choices(filters.partsOfSpeech), levels = choices(filters.jlpt), topics = choices(filters.topics);
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  const matches = (selected, values) => !selected.size ||
    (values.length ? values.some((value) => selected.has(value)) : selected.has(UNCATEGORIZED));
  return entries.filter(({ deckId, deckName, word }) => {
    if (decks.size && !decks.has(deckId)) return false;
    if (stages.size && !stages.has(word.stage)) return false;
    if (!matches(parts, word.partsOfSpeech || []) || !matches(levels, word.jlpt ? [word.jlpt] : []) ||
        !matches(topics, [...wordTopicGroups(word), ...(word.topics || [])])) return false;
    if (!query) return true;
    return [deckName, word.japanese, word.meaning, word.reading, word.hanja, word.example,
      word.exampleReading, word.translation, word.jlpt, ...(word.partsOfSpeech || []), ...(word.topics || []), ...wordTopicGroups(word)]
      .join(" ").toLocaleLowerCase().includes(query);
  });
}
