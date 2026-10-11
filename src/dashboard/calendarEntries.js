import { normalizeCalendarMarks } from "./calendarText.js";

export const CALENDAR_ENTRIES_VERSION = 1;
export const validStartTime = (value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const snapshot = (data, date) => ({ text: data.calendar?.[date] || "", marks: data.calendarFormats?.[date] || [] });
const sameSnapshot = (a, b) => a.text === b.text && JSON.stringify(a.marks) === JSON.stringify(b.marks);

export function legacyCalendarItems(date, text, marks = []) {
  let offset = 0;
  return text ? text.split("\n").map((value, index) => {
    const start = offset;
    offset += value.length + 1;
    return { id: `legacy:${date}:${index}`, text: value, time: "",
      marks: normalizeCalendarMarks(value, marks.map((mark) => ({ ...mark, start: mark.start - start, end: mark.end - start }))) };
  }) : [];
}

export function projectCalendarItems(items) {
  let offset = 0;
  const marks = [];
  for (const item of items) {
    for (const mark of normalizeCalendarMarks(item.text, item.marks)) marks.push({ ...mark, start: mark.start + offset, end: mark.end + offset });
    offset += item.text.length + 1;
  }
  return { text: items.map((item) => item.text).join("\n"), marks };
}

function validRecord(record) {
  return record?.version === CALENDAR_ENTRIES_VERSION && Array.isArray(record.items) && record.items.every((item) =>
    typeof item?.id === "string" && typeof item.text === "string" && validStartTime(item.time || "") && Array.isArray(item.marks)) &&
    new Set(record.items.map((item) => item.id)).size === record.items.length;
}

export function readCalendarEntries(data, date) {
  const legacy = snapshot(data, date);
  const record = data.calendarEntries?.[date];
  if (!record) return { items: legacyCalendarItems(date, legacy.text, legacy.marks), recovery: [], unsupported: false, mismatch: false };
  if (!validRecord(record)) return { items: [], recovery: [legacy], unsupported: true, mismatch: false };
  const mismatch = !sameSnapshot(legacy, projectCalendarItems(record.items));
  return { items: record.items, recovery: [...(record.recovery || []), ...(mismatch ? [legacy] : [])], unsupported: false, mismatch };
}

// Only an explicit edit migrates a date. Keep its original and any older-client
// edits intact; rendering must never write a migration into the cloud.
export function writeCalendarEntries(data, date, items) {
  const current = readCalendarEntries(data, date);
  if (current.unsupported) throw new Error("지원하지 않는 일정 버전입니다. 원본 자료는 보존되었습니다.");
  const previous = data.calendarEntries?.[date];
  const normalized = items.map((item) => {
    if (typeof item.id !== "string" || typeof item.text !== "string" || !validStartTime(item.time || "")) throw new Error("일정과 시작 시간을 확인해 주세요.");
    return { ...item, time: item.time || "", marks: normalizeCalendarMarks(item.text, item.marks) };
  });
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error("중복된 일정 ID입니다.");
  const recovery = current.recovery.filter((item, index, all) => all.findIndex((other) => sameSnapshot(item, other)) === index);
  data.calendarEntries ||= {};
  data.calendarEntries[date] = { ...previous, version: CALENDAR_ENTRIES_VERSION, items: normalized,
    original: previous?.original || snapshot(data, date), recovery };
  const projection = projectCalendarItems(normalized);
  data.calendar ||= {};
  data.calendarFormats ||= {};
  if (projection.text) data.calendar[date] = projection.text;
  else delete data.calendar[date];
  if (projection.marks.length) data.calendarFormats[date] = projection.marks;
  else delete data.calendarFormats[date];
  return data;
}

export function sortCalendarItems(items) {
  return items.map((item, index) => ({ item, index })).sort((a, b) =>
    Number(Boolean(a.item.time)) - Number(Boolean(b.item.time)) || (a.item.time || "").localeCompare(b.item.time || "") || a.index - b.index).map(({ item }) => item);
}
