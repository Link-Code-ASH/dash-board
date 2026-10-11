export const NOTE_KINDS = { idea: "아이디어", method: "풀이법 · 사고방식", feedback: "피드백", rule: "제작 규칙" };
export const ITEM_STATUSES = { draft: "초안", review: "검토 요청", revise: "수정 필요", approved: "확정" };
export const kindLabel = (kind) => Object.hasOwn(NOTE_KINDS, kind) ? NOTE_KINDS[kind] : kind || "미분류";
export const statusLabel = (status) => Object.hasOwn(ITEM_STATUSES, status) ? ITEM_STATUSES[status] : status || "미분류";
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
export function filterItems(items, { query = "", subject = "", unit = "", status = "" } = {}) {
  return items.filter((item) => !item.deleted_at && (!subject || item.subject === subject) && (!unit || item.unit === unit) && (!status || item.status === status)
    && matches([item.title, item.stem, item.subject, item.unit, item.difficulty, item.question_type, item.feedback], query));
}
// Selection order is the worksheet order and survives changes to list filters.
export function selectedItems(items, selectedIds) {
  const byId = new Map(items.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}
