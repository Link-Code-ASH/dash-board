export const NOTE_KINDS = { principle: "제작 원칙", idea: "아이디어", method: "풀이법 · 사고방식", feedback: "피드백", rule: "제작 규칙", summary: "요약" };
export const DIFFICULTIES = { 최상: "최상", 상: "상", 중: "중", 하: "하" };
export const REVIEW_STATES = { unreviewed: "검토 전", feedback: "피드백 작성", applied: "피드백 적용" };
export const USAGES = { hold: "보류", use: "활용", revise: "수정 필요", discard: "폐기" };
const label = (labels, value) => Object.hasOwn(labels, value) ? labels[value] : value || "미분류";
export const kindLabel = (kind) => label(NOTE_KINDS, kind);
export const reviewLabel = (state) => label(REVIEW_STATES, state || "unreviewed");
export const usageLabel = (usage) => label(USAGES, usage || "hold");
// A question is finished only when Claude has applied the feedback and it is approved for use.
export const isComplete = (item) => item?.review_state === "applied" && item?.usage === "use";
export const isPrinciple = (note) => note?.kind === "principle";
const text = (value) => typeof value === "string" ? value : "";
const matches = (parts, query) => parts.join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
export function distinct(rows, field) {
  return [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
}
export function filterNotes(notes, { query = "", kind = "", scope = "" } = {}) {
  return notes.filter((note) => !note.deleted_at && (!kind || note.kind === kind) && (!scope || note.scope === scope)
    && matches([note.title, note.body, note.kind, kindLabel(note.kind), note.scope, note.source, ...(Array.isArray(note.tags) ? note.tags : [])], query));
}
export function groupNotes(notes) {
  const kinds = new Map();
  for (const note of notes) {
    const kind = text(note.kind);
    const scope = text(note.scope);
    if (!kinds.has(kind)) kinds.set(kind, new Map());
    const scopes = kinds.get(kind);
    if (!scopes.has(scope)) scopes.set(scope, []);
    scopes.get(scope).push(note);
  }
  return [...kinds].sort(([a], [b]) => kindLabel(a).localeCompare(kindLabel(b), "ko")).map(([kind, scopes]) => ({
    kind, scopes: [...scopes].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([scope, rows]) => ({ scope, rows })),
  }));
}
export function filterItems(items, { query = "", subject = "", unit = "", difficulty = "", review = "", usage = "" } = {}) {
  return items.filter((item) => !item.deleted_at && (!subject || item.subject === subject) && (!unit || item.unit === unit)
    && (!difficulty || item.difficulty === difficulty)
    && (!review || (review === "complete" ? isComplete(item) : (item.review_state || "unreviewed") === review))
    && (!usage || (item.usage || "hold") === usage)
    && matches([item.title, item.stem, item.subject, item.unit, item.difficulty, item.question_type, item.feedback], query));
}
// Selection order is the worksheet order and survives changes to list filters.
export function selectedItems(items, selectedIds) {
  const byId = new Map(items.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}
// Principles are read first, so they keep the order in which they were written.
export function sortPrinciples(notes) {
  return notes.filter((note) => !note.deleted_at && isPrinciple(note))
    .toSorted((left, right) => text(left.created_at).localeCompare(text(right.created_at)) || left.id.localeCompare(right.id));
}
