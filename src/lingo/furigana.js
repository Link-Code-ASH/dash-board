const han = /[\p{Script=Han}々〆]/u;
const marks = /[\p{Mark}\uFF9E\uFF9F]/u;
const kanaReading = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Mark}ー]+$/u;
const MAX_TEXT_LENGTH = 10000;
const MAX_READING_LENGTH = 20000;
const MAX_SEARCH_WORK = 200000;

function clusters(text) {
  const result = [];
  let offset = 0;
  for (const char of text) {
    const previous = result[result.length - 1];
    if (previous && marks.test(char)) {
      previous.text += char;
      previous.end += char.length;
    } else result.push({ text: char, start: offset, end: offset + char.length });
    offset += char.length;
  }
  return result;
}

function normalize(text) {
  return text.normalize("NFKC").replace(/[\u30A1-\u30F6\u30FD\u30FE]/g,
    (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function readingMap(text) {
  let normalized = "";
  const boundaries = new Map([[0, 0]]);
  for (const cluster of clusters(text)) {
    boundaries.set(normalized.length, cluster.start);
    normalized += normalize(cluster.text);
    boundaries.set(normalized.length, cluster.end);
  }
  return { normalized, boundaries };
}

function tokenize(text) {
  const result = [];
  for (const cluster of clusters(text)) {
    const isHan = han.test(cluster.text);
    const previous = result[result.length - 1];
    if (previous?.isHan === isHan) previous.text += cluster.text;
    else result.push({ text: cluster.text, isHan });
  }
  return result;
}

/** Align supplied kana to Han runs; ambiguous alignment keeps the entire reading. */
export function exampleSegments(example, reading) {
  const text = typeof example === "string" ? example : String(example ?? "");
  const fullReading = typeof reading === "string" ? reading : "";
  if (!text) return [];
  if (!fullReading.trim() || !han.test(text)) return [{ text }];
  const fallback = () => [{ text, reading: fullReading }];
  if (text.length > MAX_TEXT_LENGTH || fullReading.length > MAX_READING_LENGTH) return fallback();

  const tokens = tokenize(text);
  const { normalized, boundaries } = readingMap(fullReading);
  const firstHan = tokens[0].isHan ? 0 : 1;
  const prefix = firstHan ? normalize(tokens[0].text) : "";
  const suffix = tokens[tokens.length - 1].isHan ? "" : normalize(tokens[tokens.length - 1].text);
  const end = normalized.length - suffix.length;
  if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix) || end < prefix.length ||
      !boundaries.has(prefix.length) || !boundaries.has(end)) return fallback();
  const searchable = normalized.slice(0, end);

  let cursor = prefix.length, work = 0;
  const result = firstHan ? [{ text: tokens[0].text }] : [];
  for (let index = firstHan; index < tokens.length; index += 2) {
    const word = tokens[index];
    const literal = tokens[index + 1];
    let stop = end;
    if (literal && index + 2 < tokens.length) {
      const anchor = normalize(literal.text);
      if (!anchor) return fallback();
      let from = cursor + 1, match = -1;
      // A second possible anchor is ambiguous. Keep the user's complete reading
      // instead of guessing; the work budget also bounds long repeated input.
      while (from < end) {
        work += end - from;
        if (work > MAX_SEARCH_WORK) return fallback();
        const found = searchable.indexOf(anchor, from);
        if (found < 0 || found + anchor.length >= end) break;
        if (boundaries.has(found) && boundaries.has(found + anchor.length)) {
          if (match >= 0) return fallback();
          match = found;
        }
        from = found + 1;
      }
      if (match < 0) return fallback();
      stop = match;
    }
    const normalizedReading = normalized.slice(cursor, stop);
    if (!normalizedReading || !kanaReading.test(normalizedReading) ||
        !boundaries.has(cursor) || !boundaries.has(stop)) return fallback();
    result.push({ text: word.text, reading: fullReading.slice(boundaries.get(cursor), boundaries.get(stop)) });
    if (literal) result.push({ text: literal.text });
    cursor = literal ? stop + normalize(literal.text).length : stop;
  }
  return cursor === normalized.length ? result : fallback();
}
