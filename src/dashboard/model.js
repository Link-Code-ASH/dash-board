import { normalizeCalendarFormats } from "./calendarText.js";
import React from "react";
import { normalizeMindfold as normalizeMindfoldV2 } from "../mindfold/model.js";

export const STORAGE_KEY = "routine-scoreboard-clean-v1";

export const SYNC_BACKEND_KEY = "dashboard-sync-backend-v1";

export const SYNC_ID_KEY = `${SYNC_BACKEND_KEY}:sync-id`;

export const SYNC_PIN_KEY = `${SYNC_BACKEND_KEY}:pin`;

export const SYNC_REMEMBER_KEY = `${SYNC_BACKEND_KEY}:remember-device`;

export const SYNC_KDF_ITERATIONS = 250000;

export const NOTE_IMAGE_DB_NAME = "dashboard-note-images-v1";

export const NOTE_IMAGE_STORE_NAME = "images";

export const BACKUP_IMAGES_KEY = "_dashboardNoteImages";

export const ACCOUNT_OWNER_KEY = "hub-account-owner-v1";

export const ACCOUNT_CACHE_PREFIX = "hub-account-data-v1:";

export const ACCOUNT_SYNCED_PREFIX = "hub-account-synced-v1:";

export const ACCOUNT_RECOVERY_PREFIX = "hub-account-recovery-v1:";

export const h = React.createElement;


export const weekDays = [
  { key: "mon", label: "Mon", full: "Monday" },
  { key: "tue", label: "Tue", full: "Tuesday" },
  { key: "wed", label: "Wed", full: "Wednesday" },
  { key: "thu", label: "Thu", full: "Thursday" },
  { key: "fri", label: "Fri", full: "Friday" },
  { key: "sat", label: "Sat", full: "Saturday" },
  { key: "sun", label: "Sun", full: "Sunday" },
];

export const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function getOrderedMonthIndexes(startMonth = new Date().getMonth()) {
  return Array.from({ length: 12 }, (_, offset) => (startMonth + offset) % 12);
}

export const defaultCategories = [
  { key: "books", label: "Books", yScore: 6, nScore: -3 },
  { key: "sports", label: "Sports", yScore: 5, nScore: -2 },
  { key: "content", label: "Content", yScore: 4, nScore: -2 },
  { key: "gr", label: "GR", yScore: 5, nScore: -2 },
];

export const defaultPresets = [
  { key: "daily-exercise", name: "Exercise", yScore: 10, nScore: -4 },
  { key: "daily-reading", name: "Reading", yScore: 6, nScore: -3 },
  { key: "daily-focus", name: "Deep Work", yScore: 8, nScore: -4 },
  { key: "daily-sleep", name: "Enough Sleep", yScore: 7, nScore: -4 },
  { key: "daily-late-snack", name: "No Late Snack", yScore: 4, nScore: -8 },
  { key: "daily-scroll", name: "Less Scrolling", yScore: 4, nScore: -5 },
  { key: "daily-delay", name: "No Procrastination", yScore: 5, nScore: -7 },
  { key: "daily-late-sleep", name: "Late Sleep", yScore: -6, nScore: 3 },
];

export const calendarDutyOptions = [
  { key: "afterSchool", label: "방" },
  { key: "nightStudy", label: "야" },
  { key: "clubActivity", label: "동" },
];

export const schoolNoteColors = ["cream", "sage", "peach", "blue", "rose", "lavender", "mint", "butter"];

export const noteTabColors = ["kraft", "sage", "peach", "blue", "butter", "rose", "mint", "lavender"];

export const defaultNoteTabs = [
  { id: "school", label: "School", color: "kraft" },
  { id: "univ", label: "UNIV", color: "sage" },
  { id: "progress", label: "Progress", color: "peach" },
  { id: "life", label: "Life", color: "blue" },
];

export function createDefaultMemoCards(globalMemos = {}) {
  return [
    { id: "memo-life", title: "Life", leftTitle: "", leftText: globalMemos.life || "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
    { id: "memo-school", title: "School", leftTitle: "", leftText: globalMemos.school || "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
    { id: "memo-ideas", title: "Ideas", leftTitle: "", leftText: "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
  ];
}

export function cloneCategories() {
  return defaultCategories.map((category) => ({ ...category }));
}

export function clonePresets() {
  return defaultPresets.map((preset) => ({ ...preset }));
}

export function parseScore(value, fallback) {
  if (value === "" || value === "-") return value;
  if (typeof value === "string" && /^\d+\s*(?:~|-|,)\s*\d*$/.test(value.trim())) return value.trim();
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

export function scoreNumber(value, fallback = 0) {
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

export function createEmptyWeeklyPlan(categories = defaultCategories) {
  return categories.reduce((plan, category) => {
    plan[category.key] = weekDays.reduce((days, day) => {
      days[day.key] = "";
      return days;
    }, {});
    return plan;
  }, {});
}

export function normalizeCategories(savedCategories, fallbackCategories = cloneCategories()) {
  const source = Array.isArray(savedCategories) && savedCategories.length ? savedCategories : fallbackCategories;
  return source
    .filter((category) => category && category.key)
    .map((category) => ({
      key: category.key,
      label: String(category.label ?? ""),
      yScore: parseScore(category.yScore, 5),
      nScore: parseScore(category.nScore, -2),
    }));
}

export function normalizePresets(savedPresets) {
  const source = Array.isArray(savedPresets) ? savedPresets : clonePresets();
  return source
    .filter((preset) => preset && preset.key)
    .map((preset) => ({
      key: preset.key,
      name: String(preset.name ?? ""),
      yScore: parseScore(preset.yScore, 5),
      nScore: parseScore(preset.nScore, -2),
    }));
}

export function normalizeWeeklyPlan(plan, categories) {
  const normalized = createEmptyWeeklyPlan(categories);
  categories.forEach((category) => {
    weekDays.forEach((day) => {
      normalized[category.key][day.key] = plan?.[category.key]?.[day.key] || "";
    });
  });
  return normalized;
}

export function normalizeSchoolSubjects(subjects) {
  return weekDays.reduce((normalized, day) => {
    normalized[day.key] = typeof subjects?.[day.key] === "string" ? subjects[day.key].slice(0, 80) : "";
    return normalized;
  }, {});
}

export function normalizeDateMarkers(markers) {
  return Array.from({ length: 8 }, (_, index) => ({
    text: markers?.[index]?.text || "",
    date: markers?.[index]?.date || "",
  }));
}

export function normalizeCalendarDuties(duties) {
  if (!duties || typeof duties !== "object") return {};
  return Object.entries(duties).reduce((normalized, [dateKey, value]) => {
    const flags = calendarDutyOptions.reduce((items, option) => {
      if (Boolean(value?.[option.key])) items[option.key] = true;
      return items;
    }, {});
    if (Object.keys(flags).length) normalized[dateKey] = flags;
    return normalized;
  }, {});
}

export function normalizeCarryPenalties(penalties) {
  if (!penalties || typeof penalties !== "object") return {};
  return Object.entries(penalties).reduce((normalized, [dateKey, value]) => {
    if (value) normalized[dateKey] = true;
    return normalized;
  }, {});
}

export function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function normalizeMemos(memos) {
  const global = memos?.global && typeof memos.global === "object" ? memos.global : { life: "", school: "" };
  const sourceCards = Array.isArray(memos?.cards) && memos.cards.length ? memos.cards : createDefaultMemoCards(global);
  const cards = sourceCards
    .filter((card) => card && card.id)
    .map((card, index) => ({
      id: card.id,
      textFormats: card.textFormats && typeof card.textFormats === "object" ? card.textFormats : {},
      title: String(card.title == null ? `Memo ${index + 1}` : card.title).slice(0, 32),
      leftTitle: String(card.leftTitle || "").slice(0, 48),
      leftText: String(card.leftText ?? card.text ?? ""),
      leftExtraTitle: String(card.leftExtraTitle || "").slice(0, 48),
      leftTextExtra: String(card.leftTextExtra || ""),
      centerTitle: String(card.centerTitle || "").slice(0, 48),
      centerText: String(card.centerText || ""),
      centerExtraTitle: String(card.centerExtraTitle || "").slice(0, 48),
      centerTextExtra: String(card.centerTextExtra || ""),
      rightTitle: String(card.rightTitle || "").slice(0, 48),
      rightText: String(card.rightText || ""),
      rightExtraTitle: String(card.rightExtraTitle || "").slice(0, 48),
      rightTextExtra: String(card.rightTextExtra || ""),
      memoSplits: {
        leftText: clampNumber(card.memoSplits?.leftText ?? 50, 24, 76),
        rightText: clampNumber(card.memoSplits?.rightText ?? 50, 24, 76),
      },
    }));
  const safeCards = cards.length ? cards : createDefaultMemoCards(global);
  const activeMemoId = safeCards.some((card) => card.id === memos?.activeMemoId) ? memos.activeMemoId : safeCards[0].id;
  return {
    global,
    threeM: memos?.threeM || "",
    cards: safeCards,
    activeMemoId,
  };
}

export function normalizeWork(work) {
  const legacyBlocks = [
    { id: "work-manual", title: "Manual", content: String(work?.manual || ""), open: true },
    { id: "work-process", title: "Process", content: String(work?.procedures || ""), open: true },
    { id: "work-notes", title: "Notes", content: String(work?.notes || ""), open: true },
  ];
  const normalizeBlocks = (blocks) =>
    blocks.map((block, index) => ({
      id: block.id || createKey("work"),
      title: String(block.title == null ? `Work ${index + 1}` : block.title),
      content: String(block.content || ""),
      open: block.open !== false,
    }));
  if (Array.isArray(work?.categories) && work.categories.length) {
    return {
      categories: work.categories.map((category, index) => ({
        id: category.id || createKey("work-category"),
        title: String(category.title == null ? `Category ${index + 1}` : category.title),
        open: category.open !== false,
        blocks: normalizeBlocks(Array.isArray(category.blocks) ? category.blocks : []),
      })),
    };
  }
  const sourceBlocks = Array.isArray(work?.blocks) && work.blocks.length ? work.blocks : legacyBlocks;
  return {
    categories: [
      {
        id: "work-category-main",
        title: "Main",
        open: true,
        blocks: normalizeBlocks(sourceBlocks),
      },
    ],
  };
}

export const mindfoldBlockTypes = ["text", "heading-1", "heading-2", "heading-3", "heading-4", "bullet", "callout", "quote"];

export const mindfoldTextColors = {
  ink: "#1f2937",
  navy: "#004b8f",
  cobalt: "#0059c8",
  teal: "#007c78",
  forest: "#16733c",
  olive: "#5b6f18",
  plum: "#6e2a8d",
  violet: "#5b35ad",
  berry: "#b51d33",
  rose: "#c21f6f",
  amber: "#9a5700",
  orange: "#ba3b00",
};

export const mindfoldTextColorOptions = [
  { id: "ink", label: "기본 잉크" },
  { id: "navy", label: "남색" },
  { id: "cobalt", label: "파랑" },
  { id: "teal", label: "청록" },
  { id: "forest", label: "초록" },
  { id: "olive", label: "올리브" },
  { id: "plum", label: "보라" },
  { id: "violet", label: "남보라" },
  { id: "berry", label: "붉은색" },
  { id: "rose", label: "장밋빛" },
  { id: "amber", label: "황갈색" },
  { id: "orange", label: "주황" },
];

export const mindfoldBlockTypeOptions = [
  { type: "text", icon: "T", label: "텍스트" },
  { type: "heading-1", icon: "H1", label: "제목 1" },
  { type: "heading-2", icon: "H2", label: "제목 2" },
  { type: "heading-3", icon: "H3", label: "제목 3" },
  { type: "heading-4", icon: "H4", label: "제목 4" },
  { type: "bullet", icon: "\u2022", label: "목록" },
  { type: "callout", icon: "\u2610", label: "체크" },
  { type: "quote", icon: "\u201c", label: "인용" },
];

export const mindfoldTrashRetentionDays = 30;

export const mindfoldTrashRetentionMs = mindfoldTrashRetentionDays * 24 * 60 * 60 * 1000;

export const displayModes = ["auto", "desktop", "mobile"];

export function normalizeDisplayMode(value) {
  return displayModes.includes(value) ? value : "auto";
}

export function normalizeMindfoldMasks(masks, textLength) {
  return (Array.isArray(masks) ? masks : [])
    .map((mask) => ({
      id: mask?.id || createKey("mindfold-mask"),
      start: Math.max(0, Math.min(textLength, Number(mask?.start) || 0)),
      end: Math.max(0, Math.min(textLength, Number(mask?.end) || 0)),
    }))
    .filter((mask) => mask.end > mask.start)
    .sort((a, b) => a.start - b.start)
    .reduce((merged, mask) => {
      const previous = merged[merged.length - 1];
      if (previous && mask.start <= previous.end) {
        previous.end = Math.max(previous.end, mask.end);
        return merged;
      }
      merged.push(mask);
      return merged;
    }, []);
}

export const mindfoldMarkTypes = ["bold", "italic"];

export function normalizeMindfoldMarks(marks, textLength) {
  const normalized = (Array.isArray(marks) ? marks : [])
    .map((mark) => ({
      id: mark?.id || createKey("mindfold-mark"),
      type: mindfoldMarkTypes.includes(mark?.type) ? mark.type : "",
      start: Math.max(0, Math.min(textLength, Number(mark?.start) || 0)),
      end: Math.max(0, Math.min(textLength, Number(mark?.end) || 0)),
    }))
    .filter((mark) => mark.type && mark.end > mark.start);

  return mindfoldMarkTypes.flatMap((type) => normalized
    .filter((mark) => mark.type === type)
    .sort((a, b) => a.start - b.start)
    .reduce((merged, mark) => {
      const previous = merged[merged.length - 1];
      if (previous && mark.start <= previous.end) {
        previous.end = Math.max(previous.end, mark.end);
        return merged;
      }
      merged.push({ ...mark });
      return merged;
    }, []));
}

export function mindfoldSelectionHasMark(marks, type, start, end) {
  if (end <= start) return false;
  const ranges = normalizeMindfoldMarks(marks, end)
    .filter((mark) => mark.type === type && mark.end > start && mark.start < end)
    .sort((a, b) => a.start - b.start);
  let coveredUntil = start;
  for (const range of ranges) {
    if (range.start > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, range.end);
    if (coveredUntil >= end) return true;
  }
  return false;
}

export function normalizeMindfoldBlock(block, index = 0) {
  const text = String(block?.text == null ? "" : block.text).replace(/\r\n/g, "\n");
  const inferredType = /^####\s+/.test(text)
    ? "heading-4"
    : /^###\s+/.test(text)
      ? "heading-3"
      : /^##\s+/.test(text)
        ? "heading-2"
        : /^#\s+/.test(text)
          ? "heading-1"
          : "text";
  const legacyType = block?.type;
  const type = legacyType === "heading"
    ? "heading-1"
    : legacyType === "toggle"
      ? "text"
      : mindfoldBlockTypes.includes(legacyType)
        ? legacyType
        : inferredType;
  return {
    id: block?.id || createKey("mindfold-block"),
    type,
    color: Object.prototype.hasOwnProperty.call(mindfoldTextColors, block?.color) ? block.color : "ink",
    toggle: legacyType === "toggle" || block?.toggle === true,
    checked: block?.checked === true,
    columns: [2, 3, 4].includes(Number(block?.columns)) ? Number(block.columns) : 1,
    column: [0, 1, 2, 3].includes(Number(block?.column)) ? Number(block.column) : null,
    columnPlaceholder: block?.columnPlaceholder === true,
    text: text || (index === 0 ? "" : ""),
    open: block?.open !== false,
    masks: normalizeMindfoldMasks(block?.masks, text.length),
    marks: normalizeMindfoldMarks(block?.marks, text.length),
    children: (Array.isArray(block?.children) ? block.children : []).filter(Boolean).map(normalizeMindfoldBlock),
  };
}

export function ensureMindfoldColumnInputs(block) {
  if (!block || block.columns <= 1) return;
  for (let column = 1; column < block.columns; column += 1) {
    if (!block.children.some((child) => child.column === column)) {
      block.children.push(normalizeMindfoldBlock({
        type: "text",
        text: "",
        column,
        columnPlaceholder: true,
      }));
    }
  }
}

export function migrateMindfoldNode(node, index = 0) {
  const textBlocks = Array.isArray(node?.blocks) && node.blocks.length
    ? node.blocks.map((block) => normalizeMindfoldBlock(block))
    : node?.content
      ? [normalizeMindfoldBlock({ text: String(node.content) })]
      : [];
  const nestedToggles = (Array.isArray(node?.children) ? node.children : []).map(migrateMindfoldNode);
  return normalizeMindfoldBlock({
    id: node?.id || createKey("mindfold-block"),
    type: "toggle",
    text: String(node?.title == null ? `Section ${index + 1}` : node.title).slice(0, 120),
    open: node?.open !== false,
    children: [...textBlocks, ...nestedToggles],
  });
}

export function collectMindfoldBlockIds(blocks, ids = []) {
  (blocks || []).forEach((block) => {
    ids.push(block.id);
    collectMindfoldBlockIds(block.children, ids);
  });
  return ids;
}

export function normalizeMindfoldLegacy(mindfold) {
  const normalizeTab = (tab, index) => {
    const blocks = Array.isArray(tab?.blocks) && tab.blocks.length
      ? tab.blocks.filter(Boolean).map(normalizeMindfoldBlock)
      : [normalizeMindfoldBlock({ type: "text", text: "" })];
    const ids = collectMindfoldBlockIds(blocks);
    return {
      id: tab?.id || createKey("mindfold-tab"),
      label: String(tab?.label || `페이지 ${index + 1}`).slice(0, 28),
      blocks,
      activeId: ids.includes(tab?.activeId) ? tab.activeId : ids[0],
    };
  };
  let tabs;
  if (Array.isArray(mindfold?.tabs) && mindfold.tabs.length) {
    tabs = mindfold.tabs.filter(Boolean).map(normalizeTab);
  } else {
    let legacyBlocks;
    if (Array.isArray(mindfold?.blocks) && mindfold.blocks.length) legacyBlocks = mindfold.blocks.filter(Boolean).map(normalizeMindfoldBlock);
    else if (Array.isArray(mindfold?.nodes) && mindfold.nodes.length) legacyBlocks = mindfold.nodes.map(migrateMindfoldNode);
    else legacyBlocks = [normalizeMindfoldBlock({ type: "text", text: "" })];
    tabs = [normalizeTab({ id: "mindfold-tab-main", label: "페이지 1", blocks: legacyBlocks, activeId: mindfold?.activeId }, 0)];
  }
  const activeTabId = tabs.some((tab) => tab.id === mindfold?.activeTabId) ? mindfold.activeTabId : tabs[0].id;
  const trash = (Array.isArray(mindfold?.trash) ? mindfold.trash : [])
    .filter((tab) => tab && Number.isFinite(Date.parse(tab.deletedAt)) && Date.now() - Date.parse(tab.deletedAt) < mindfoldTrashRetentionMs)
    .map((tab, index) => ({ ...normalizeTab(tab, index), deletedAt: tab.deletedAt }));
  return {
    tabs,
    activeTabId,
    trash,
  };
}

export function normalizeMindfold(mindfold) {
  return normalizeMindfoldV2(mindfold);
}

export function getActiveMindfoldTab(mindfold) {
  return mindfold.tabs.find((tab) => tab.id === mindfold.activeTabId) || mindfold.tabs[0];
}

export function findMindfoldBlock(blocks, id) {
  for (const block of blocks || []) {
    if (block.id === id) return block;
    const found = findMindfoldBlock(block.children, id);
    if (found) return found;
  }
  return null;
}

export function findMindfoldBlockLocation(blocks, id, parent = null) {
  for (let index = 0; index < (blocks || []).length; index += 1) {
    const block = blocks[index];
    if (block.id === id) return { block, index, parent, siblings: blocks };
    const found = findMindfoldBlockLocation(block.children, id, block);
    if (found) return found;
  }
  return null;
}

export function mindfoldBlockContains(block, id) {
  return block?.id === id || Boolean(findMindfoldBlock(block?.children, id));
}

export function adjustMindfoldMasks(masks, previousText, nextText) {
  if (!masks?.length || previousText === nextText) return normalizeMindfoldMasks(masks, nextText.length);
  let prefix = 0;
  while (prefix < previousText.length && prefix < nextText.length && previousText[prefix] === nextText[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previousText.length - prefix
    && suffix < nextText.length - prefix
    && previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) suffix += 1;
  const previousEditEnd = previousText.length - suffix;
  const nextEditEnd = nextText.length - suffix;
  const delta = nextText.length - previousText.length;
  const adjusted = masks.map((mask) => {
    if (mask.end <= prefix) return { ...mask };
    if (mask.start >= previousEditEnd) return { ...mask, start: mask.start + delta, end: mask.end + delta };
    return {
      ...mask,
      start: Math.min(mask.start, prefix),
      end: Math.max(prefix, Math.min(nextText.length, mask.end + (nextEditEnd - previousEditEnd))),
    };
  });
  return normalizeMindfoldMasks(adjusted, nextText.length);
}

export function adjustMindfoldMarks(marks, previousText, nextText) {
  if (!marks?.length || previousText === nextText) return normalizeMindfoldMarks(marks, nextText.length);
  let prefix = 0;
  while (prefix < previousText.length && prefix < nextText.length && previousText[prefix] === nextText[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previousText.length - prefix
    && suffix < nextText.length - prefix
    && previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) suffix += 1;
  const previousEditEnd = previousText.length - suffix;
  const nextEditEnd = nextText.length - suffix;
  const delta = nextText.length - previousText.length;
  const adjusted = (marks || []).map((mark) => {
    if (mark.end <= prefix) return { ...mark };
    if (mark.start >= previousEditEnd) return { ...mark, start: mark.start + delta, end: mark.end + delta };
    return {
      ...mark,
      start: Math.min(mark.start, prefix),
      end: Math.max(prefix, Math.min(nextText.length, mark.end + (nextEditEnd - previousEditEnd))),
    };
  });
  return normalizeMindfoldMarks(adjusted, nextText.length);
}

export function getMindfoldEditableSelection(root) {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
    return { start: 0, end: 0 };
  }
  const getOffset = (node, offset) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  };
  const anchor = getOffset(selection.anchorNode, selection.anchorOffset);
  const focus = getOffset(selection.focusNode, selection.focusOffset);
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

export function setMindfoldEditableSelection(root, start, end = start) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let totalLength = 0;
  while (walker.nextNode()) {
    nodes.push({ node: walker.currentNode, start: totalLength });
    totalLength += walker.currentNode.textContent.length;
  }
  const resolvePoint = (offset) => {
    const clamped = Math.max(0, Math.min(totalLength, Number(offset) || 0));
    for (const entry of nodes) {
      const length = entry.node.textContent.length;
      if (clamped <= entry.start + length) return { node: entry.node, offset: clamped - entry.start };
    }
    return nodes.length
      ? { node: nodes[nodes.length - 1].node, offset: nodes[nodes.length - 1].node.textContent.length }
      : { node: root, offset: 0 };
  };
  const startPoint = resolvePoint(start);
  const endPoint = resolvePoint(end);
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function getStableSchoolColor(id, index = 0) {
  const text = String(id || "");
  const hash = Array.from(text).reduce((sum, character) => sum + character.charCodeAt(0), index);
  return schoolNoteColors[Math.abs(hash) % schoolNoteColors.length];
}

export function normalizeSchool(school) {
  const sourceNotes = Array.isArray(school?.notes) && school.notes.length
    ? school.notes
    : [{ id: "school-note-main", title: "Memo 1", content: "", open: true }];
  const notes = sourceNotes
    .filter((note) => note && note.id)
    .map((note, index) => {
      const legacyImage = note.imageId ? [{ id: note.imageId, name: String(note.imageName || "Attached image") }] : [];
      const images = (Array.isArray(note.images) ? note.images : legacyImage)
        .filter((image) => image?.id)
        .map((image) => ({ id: image.id, name: String(image.name || image.imageName || "Attached image") }));
      return {
        id: note.id,
        title: String(note.title == null ? `Memo ${index + 1}` : note.title).replace(/^School Memo\b/, "Memo").slice(0, 48),
        content: String(note.content || ""),
        open: note.open !== false,
        color: schoolNoteColors.includes(note.color) ? note.color : getStableSchoolColor(note.id, index),
        images,
      };
    });
  return {
    notes: notes.length ? notes : [{ id: "school-note-main", title: "Memo 1", content: "", open: true }],
  };
}

export function normalizeNoteTabs(tabs) {
  const sourceTabs = Array.isArray(tabs) && tabs.length ? tabs : defaultNoteTabs;
  const seen = new Set();
  const normalized = sourceTabs
    .filter((tab) => tab && tab.id)
    .map((tab, index) => ({
      id: String(tab.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || createKey("note"),
      label: String(tab.label || tab.title || `Note ${index + 1}`).slice(0, 24),
      color: noteTabColors.includes(tab.color) ? tab.color : noteTabColors[index % noteTabColors.length],
    }))
    .filter((tab) => {
      if (seen.has(tab.id)) return false;
      seen.add(tab.id);
      return true;
    });
  return normalized.length ? normalized : defaultNoteTabs;
}

export function normalizeItemIcons(icons) {
  if (!icons || typeof icons !== "object" || Array.isArray(icons)) return {};
  return Object.fromEntries(Object.entries(icons).filter(([key, value]) =>
    key && typeof value === "string" && value.length > 0 && value.length <= 64,
  ));
}

export function normalizeItemSymbols(symbols) {
  if (!symbols || typeof symbols !== "object" || Array.isArray(symbols)) return {};
  return Object.fromEntries(Object.entries(symbols)
    .filter(([key, value]) => key && value && typeof value.name === "string" && /^[a-z][a-z0-9-]{0,47}$/.test(value.name))
    .map(([key, value]) => [key, { name: value.name, color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : "#64748b" }]));
}

export function createFallbackState() {
  const categories = cloneCategories();
  return {
    days: {},
    itemIcons: {},
    itemSymbols: {},
    memos: normalizeMemos(),
    calendar: {},
    calendarFormats: {},
    calendarDuties: {},
    routineAttempts: {},
    carryPenalties: {},
    flaggedDate: "",
    carryResetDate: "",
    carryAdjustment: 0,
    schoolPresets: clonePresets(),
    schoolSubjects: normalizeSchoolSubjects(),
    schoolWeeklyPlan: createEmptyWeeklyPlan(clonePresets()),
    presets: clonePresets(),
    categories,
    weeklyPlan: createEmptyWeeklyPlan(categories),
    dateMarkers: normalizeDateMarkers(),
    work: normalizeWork(),
    school: normalizeSchool(),
    univ: normalizeSchool(),
    progress: normalizeSchool(),
    life: normalizeSchool(),
    noteTabs: normalizeNoteTabs(),
    mindfold: normalizeMindfold(),
    displayMode: "auto",
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeState(source) {
  const fallback = createFallbackState();
  const categories = normalizeCategories(source?.categories, fallback.categories);
  const schoolPresets = normalizePresets(source?.schoolPresets);
  const noteTabs = normalizeNoteTabs(source?.noteTabs);
  const noteSections = noteTabs.reduce((sections, tab) => {
    sections[tab.id] = normalizeSchool(source?.[tab.id]);
    return sections;
  }, {});
  const knownKeys = new Set([
    "itemIcons",
    "itemSymbols",
    "days",
    "memos",
    "calendar",
    "calendarFormats",
    "calendarDuties",
    "routineAttempts",
    "carryPenalties",
    "flaggedDate",
    "carryResetDate",
    "carryAdjustment",
    "schoolPresets",
    "schoolSubjects",
    "schoolWeeklyPlan",
    "presets",
    "categories",
    "weeklyPlan",
    "dateMarkers",
    "work",
    "school",
    "univ",
    "progress",
    "life",
    "noteTabs",
    "mindfold",
    "displayMode",
    BACKUP_IMAGES_KEY,
    "updatedAt",
  ]);
  const extraTabData =
    source && typeof source === "object"
      ? Object.fromEntries(Object.entries(source).filter(([key]) => !knownKeys.has(key)))
      : {};
  return {
    ...extraTabData,
    itemIcons: normalizeItemIcons(source?.itemIcons),
    itemSymbols: normalizeItemSymbols(source?.itemSymbols),
    days: source?.days && typeof source.days === "object" ? source.days : {},
    memos: normalizeMemos(source?.memos),
    calendarFormats: normalizeCalendarFormats(source?.calendar, source?.calendarFormats),
    calendar: source?.calendar && typeof source.calendar === "object" ? source.calendar : {},
    calendarDuties: normalizeCalendarDuties(source?.calendarDuties),
    routineAttempts: source?.routineAttempts && typeof source.routineAttempts === "object" ? source.routineAttempts : {},
    carryPenalties: normalizeCarryPenalties(source?.carryPenalties),
    flaggedDate: source?.flaggedDate || "",
    carryResetDate: source?.carryResetDate || "",
    carryAdjustment: scoreNumber(source?.carryAdjustment, 0),
    schoolPresets,
    schoolSubjects: normalizeSchoolSubjects(source?.schoolSubjects),
    schoolWeeklyPlan: normalizeWeeklyPlan(source?.schoolWeeklyPlan, schoolPresets),
    presets: normalizePresets(source?.presets),
    categories,
    weeklyPlan: normalizeWeeklyPlan(source?.weeklyPlan, categories),
    dateMarkers: normalizeDateMarkers(source?.dateMarkers),
    work: normalizeWork(source?.work),
    school: normalizeSchool(source?.school),
    univ: normalizeSchool(source?.univ),
    progress: normalizeSchool(source?.progress),
    life: normalizeSchool(source?.life),
    noteTabs,
    ...noteSections,
    mindfold: normalizeMindfold(source?.mindfold),
    displayMode: normalizeDisplayMode(source?.displayMode),
    updatedAt: source?.updatedAt || new Date().toISOString(),
  };
}

export function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return createFallbackState();
  }
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function openNoteImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTE_IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTE_IMAGE_STORE_NAME)) db.createObjectStore(NOTE_IMAGE_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withNoteImageStore(mode, action) {
  const db = await openNoteImageDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTE_IMAGE_STORE_NAME, mode);
    const store = transaction.objectStore(NOTE_IMAGE_STORE_NAME);
    const result = action(store);
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function putNoteImage(record) {
  await withNoteImageStore("readwrite", (store) => store.put(record));
}

export async function deleteNoteImage(id) {
  if (!id) return;
  await withNoteImageStore("readwrite", (store) => store.delete(id));
}

export async function getAllNoteImages() {
  const db = await openNoteImageDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTE_IMAGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(NOTE_IMAGE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function restoreNoteImages(records, { clear = true } = {}) {
  if (!Array.isArray(records)) return;
  await withNoteImageStore("readwrite", (store) => {
    if (clear) store.clear();
    records.filter((record) => record?.id && record?.dataUrl).forEach((record) => store.put(record));
  });
}

export async function getNoteImagesForState(state) {
  const imageIds = new Set((state.noteTabs || []).flatMap((tab) =>
    (state[tab.id]?.notes || []).flatMap((note) =>
      (note.images || []).map((image) => image.id).concat(note.imageId || []),
    ),
  ));
  return (await getAllNoteImages()).filter((record) => imageIds.has(record.id));
}

export function createBackupPayload(state, images = []) {
  return {
    ...normalizeState(state),
    [BACKUP_IMAGES_KEY]: images,
  };
}

export function splitBackupPayload(payload) {
  const { [BACKUP_IMAGES_KEY]: images, _mindfoldV3: documents, ...state } = payload && typeof payload === "object" ? payload : {};
  return { images: Array.isArray(images) ? images : [], state, documents };
}

export function loadSyncBackend() {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_BACKEND_KEY));
    return {
      supabaseUrl: saved?.supabaseUrl || "",
      supabaseAnonKey: saved?.supabaseAnonKey || "",
    };
  } catch {
    return { supabaseUrl: "", supabaseAnonKey: "" };
  }
}

export function accountCacheKey(userId) {
  return `${ACCOUNT_CACHE_PREFIX}${userId}`;
}

export function accountSyncedKey(userId) {
  return `${ACCOUNT_SYNCED_PREFIX}${userId}`;
}

export function preserveAccountDraft(userId, state, version = "local") {
  try {
    const side = version === "remote" ? "remote" : "local";
    localStorage.setItem(`${ACCOUNT_RECOVERY_PREFIX}${userId}:${Date.now()}:${side}:${crypto.randomUUID()}`, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function latestAccountDraftKey(userId) {
  const prefix = `${ACCOUNT_RECOVERY_PREFIX}${userId}:`;
  return Object.keys(localStorage).filter((key) => key.startsWith(prefix)).sort().at(-1) || "";
}

export function accountEditTime(state) {
  return Date.parse(state?.updatedAt || "") || 0;
}

export function needsAccountGate() {
  return Boolean(localStorage.getItem(ACCOUNT_OWNER_KEY) || !localStorage.getItem(STORAGE_KEY));
}

export function toDateKey(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${month} ${date.getDate()} (${weekday})`;
}

export function formatDateControlLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${dateKey} (${weekday})`;
}

export function formatScore(score) {
  if (score === "" || score === "-") return String(score);
  const numericScore = scoreNumber(score);
  return numericScore > 0 ? `+${numericScore}` : String(numericScore);
}

export function getWeekSerial(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Math.floor(monday.getTime() / 604800000);
}

export function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function getDateDiffDays(fromDateKey, toDateKeyValue) {
  if (!fromDateKey || !toDateKeyValue) return "";
  const from = new Date(`${fromDateKey}T00:00:00`);
  const to = new Date(`${toDateKeyValue}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function formatDDay(fromDateKey, toDateKeyValue) {
  const diff = getDateDiffDays(fromDateKey, toDateKeyValue);
  if (diff === "") return "D";
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D+${diff}` : `D${diff}`;
}

export function getWeekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return addDays(dateKey, -((date.getDay() + 6) % 7));
}

export function formatCompactDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return { day: date.getDate(), month, weekday };
}

export const WEEKLY_PLAN_V2_PREFIX = "__WEEKLY_ITEMS_V2__:";

export function getWeeklyPlanItems(rawValue) {
  const value = String(rawValue || "");
  if (value.startsWith(WEEKLY_PLAN_V2_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(WEEKLY_PLAN_V2_PREFIX.length));
      if (Array.isArray(parsed)) return parsed.length ? parsed.map((item) => String(item ?? "")) : [""];
    } catch {
      // Fall through to the legacy newline format when saved data is incomplete.
    }
  }
  const legacyItems = value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return legacyItems.length ? legacyItems : [""];
}

export function encodeWeeklyPlanItems(items) {
  return `${WEEKLY_PLAN_V2_PREFIX}${JSON.stringify(items.map((item) => String(item ?? "")))}`;
}

export function getWeeklyPlanEntry(rawValue, dateKey) {
  const items = getWeeklyPlanItems(rawValue).map((item) => item.trim()).filter(Boolean);
  if (!items.length) return { cycleNumber: "", value: "Not Set" };
  const itemIndex = ((getWeekSerial(dateKey) % items.length) + items.length) % items.length;
  return { cycleNumber: items.length > 1 ? itemIndex + 1 : "", value: items[itemIndex] };
}

export function getWeekdayKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return weekDays[(date.getDay() + 6) % 7].key;
}

export function getWeekdayMeta(dateKey) {
  return weekDays.find((day) => day.key === getWeekdayKey(dateKey));
}

export function createKey(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function encodeBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export async function hashText(value) {
  return encodeBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function deriveSyncKey(syncId, pin) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(`dash-board-sync:${syncId}`),
      iterations: SYNC_KDF_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createSyncDocId(syncId, pin) {
  return (await hashText(`dash-board-doc:${syncId}:${pin}`)).slice(0, 48);
}

export function generateSyncIdValue() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("").replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

export function normalizeSyncId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

export function panelClickIsInteractive(target) {
  return Boolean(target.closest("button, input, textarea, select, label, a, summary, details, [contenteditable='true'], .no-panel-toggle"));
}

export function CollapsiblePanel({ children, className, controls, description, isOpen, onToggle, title }) {
  const handleClick = (event) => {
    if (panelClickIsInteractive(event.target)) return;
    onToggle();
  };
  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };
  return h(
    "section",
    { className: `${className} collapsible-panel ${isOpen ? "" : "collapsed"}` },
    h(
      "div",
      {
        className: "section-heading toggle-heading",
        role: "button",
        tabIndex: 0,
        "aria-controls": controls,
        "aria-expanded": String(isOpen),
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      },
      h("div", null, h("h2", null, title), description ? h("p", null, description) : null),
      children?.actions ? h("div", { className: "heading-actions" }, children.actions) : null,
    ),
    children?.body,
  );
}
