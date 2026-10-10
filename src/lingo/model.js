export const VERSION = 1;
export const HEADERS = ["일본어", "한국어 뜻", "읽는 법", "예문", "예문 해석"];
export const FIELDS = ["japanese", "meaning", "reading", "example", "translation"];
export const uid = () => crypto.randomUUID();
export const identity = (word) => JSON.stringify([word.japanese.trim(), word.reading.trim()]);
export const emptyDeck = (name, id = uid()) => ({ version: VERSION, id, name: name.trim(), source: null, words: [] });

export function validateDeck(value) {
  if (!value || value.version !== VERSION || typeof value.id !== "string" || !value.id ||
      typeof value.name !== "string" || !value.name.trim() || !Array.isArray(value.words))
    throw new Error("지원하지 않거나 손상된 Lingo 단어장입니다.");
  const ids = new Set(), keys = new Set();
  for (const word of value.words) {
    if (!word || typeof word.id !== "string" || !word.id || ids.has(word.id) ||
        !FIELDS.every((key) => typeof word[key] === "string") ||
        !word.japanese.trim() || !word.meaning.trim() ||
        !Number.isInteger(word.stage) || word.stage < 1 || word.stage > 5)
      throw new Error("단어 내용 또는 단계가 올바르지 않습니다.");
    const key = identity(word);
    if (keys.has(key)) throw new Error("같은 일본어·읽는 법을 가진 단어가 중복되어 있습니다.");
    ids.add(word.id); keys.add(key);
  }
  if (value.source !== null && (!value.source || !["file", "google"].includes(value.source.type) ||
      typeof value.source.name !== "string" || typeof value.source.sheetName !== "string" ||
      (value.source.type === "google" && (typeof value.source.documentId !== "string" ||
        !value.source.documentId || !Number.isInteger(value.source.sheetId)))))
    throw new Error("가져오기 출처가 올바르지 않습니다.");
  return structuredClone(value);
}

export function inspectRows(rows, deck = null) {
  const errors = [], words = [], seen = new Map();
  const header = (rows[0] || []).map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
  for (const name of HEADERS.slice(0, 2))
    if (!header.includes(name)) errors.push({ row: 1, message: `필수 열 ‘${name}’이 없습니다.` });
  for (const name of HEADERS)
    if (header.filter((item) => item === name).length > 1) errors.push({ row: 1, message: `‘${name}’ 열이 중복되었습니다.` });
  if (errors.length) return { words, errors, added: 0, updated: 0 };
  for (let index = 1; index < rows.length; index++) {
    const cells = rows[index] || [];
    if (cells.every((cell) => cell == null || String(cell).trim() === "")) continue;
    const word = Object.fromEntries(FIELDS.map((key, i) => [key, String(cells[header.indexOf(HEADERS[i])] ?? "").trim()]));
    if (!word.japanese || !word.meaning) errors.push({ row: index + 1, message: "일본어와 한국어 뜻을 모두 입력해 주세요." });
    const key = identity(word);
    if (seen.has(key)) errors.push({ row: index + 1, message: `${seen.get(key)}행과 일본어·읽는 법이 같습니다.` });
    seen.set(key, index + 1);
    words.push(word);
  }
  if (!words.length) errors.push({ row: 2, message: "가져올 단어가 없습니다." });
  if (words.length > 10000) errors.push({ row: 0, message: "한 번에 10,000개까지 가져올 수 있습니다." });
  const existing = new Set((deck?.words || []).map(identity));
  const updated = words.filter((word) => existing.has(identity(word))).length;
  return { words, errors, added: words.length - updated, updated };
}

export function importWords(deck, inspection, source, makeId = (word) => `word:${identity(word)}`) {
  if (inspection.errors.length) throw new Error("가져오기 오류를 먼저 수정해 주세요.");
  const incoming = new Map(inspection.words.map((word) => [identity(word), word]));
  const words = deck.words.map((word) => {
    const replacement = incoming.get(identity(word));
    incoming.delete(identity(word));
    return replacement ? { ...word, ...replacement } : word;
  });
  for (const word of incoming.values()) words.push({ ...word, id: makeId(word), stage: 1 });
  return validateDeck({ ...deck, source, words });
}

export function setStages(deck, ids, stage) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5) throw new Error("단계는 1~5 중 선택해 주세요.");
  const selected = new Set(ids);
  return { ...deck, words: deck.words.map((word) => selected.has(word.id) ? { ...word, stage } : word) };
}

export function validateBackup(payload) {
  if (payload?.version !== VERSION || !Array.isArray(payload.decks)) throw new Error("올바른 Lingo 백업이 아닙니다.");
  const decks = payload.decks.map(validateDeck);
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length) throw new Error("중복된 단어장 ID입니다.");
  return { version: VERSION, decks };
}
