import { adjustRanges } from "../mindfold/model.js";

export const calendarTextColors = {
  red: { label: "빨강", value: "#c53636" },
  orange: { label: "주황", value: "#a64d0a" },
  green: { label: "초록", value: "#23794b" },
  blue: { label: "파랑", value: "#2563bd" },
  purple: { label: "보라", value: "#8054a3" },
};

export function normalizeCalendarMarks(text, marks) {
  if (!Array.isArray(marks)) return [];
  return marks.filter((mark) => mark && Object.hasOwn(calendarTextColors, mark.type) &&
    Number.isInteger(mark.start) && Number.isInteger(mark.end))
    .map(({ start, end, type }) => ({ start: Math.max(0, start), end: Math.min(text.length, end), type }))
    .filter((mark) => mark.end > mark.start);
}

export function normalizeCalendarFormats(calendar, formats) {
  if (!formats || typeof formats !== "object" || Array.isArray(formats)) return {};
  return Object.fromEntries(Object.entries(formats).flatMap(([date, marks]) => {
    if (typeof calendar?.[date] !== "string") return [];
    const valid = normalizeCalendarMarks(calendar[date], marks);
    return valid.length ? [[date, valid]] : [];
  }));
}
export function changeCalendarText(text, next, marks) {
  return normalizeCalendarMarks(next, adjustRanges(normalizeCalendarMarks(text, marks), text, next));
}
export function colorCalendarSelection(text, marks, start, end, type) {
  start = Math.max(0, Math.min(text.length, start)); end = Math.max(start, Math.min(text.length, end));
  const valid = normalizeCalendarMarks(text, marks);
  if (start === end) return valid;
  const next = valid.flatMap((mark) => {
    if (mark.end <= start || mark.start >= end) return [mark];
    return [...(mark.start < start ? [{ ...mark, end: start }] : []), ...(mark.end > end ? [{ ...mark, start: end }] : [])];
  });
  if (Object.hasOwn(calendarTextColors, type)) next.push({ start, end, type });
  return next;
}
export function calendarTextSegments(text, marks) {
  const valid = normalizeCalendarMarks(text, marks);
  const points = [...new Set([0, text.length, ...valid.flatMap((mark) => [mark.start, mark.end])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => {
    const end = points[i + 1];
    const type = valid.findLast((mark) => mark.start <= start && mark.end >= end)?.type;
    return { text: text.slice(start, end), color: type ? calendarTextColors[type].value : undefined };
  });
}
