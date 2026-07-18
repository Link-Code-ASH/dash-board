import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "routine-scoreboard-clean-v1";
const SYNC_BACKEND_KEY = "dashboard-sync-backend-v1";
const SYNC_ID_KEY = `${SYNC_BACKEND_KEY}:sync-id`;
const SYNC_PIN_KEY = `${SYNC_BACKEND_KEY}:pin`;
const SYNC_REMEMBER_KEY = `${SYNC_BACKEND_KEY}:remember-device`;
const SYNC_KDF_ITERATIONS = 250000;
const NOTE_IMAGE_DB_NAME = "dashboard-note-images-v1";
const NOTE_IMAGE_STORE_NAME = "images";
const BACKUP_IMAGES_KEY = "_dashboardNoteImages";

const h = React.createElement;

const weekDays = [
  { key: "mon", label: "Mon", full: "Monday" },
  { key: "tue", label: "Tue", full: "Tuesday" },
  { key: "wed", label: "Wed", full: "Wednesday" },
  { key: "thu", label: "Thu", full: "Thursday" },
  { key: "fri", label: "Fri", full: "Friday" },
  { key: "sat", label: "Sat", full: "Saturday" },
  { key: "sun", label: "Sun", full: "Sunday" },
];

const monthNames = [
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

function getOrderedMonthIndexes(startMonth = new Date().getMonth()) {
  return Array.from({ length: 12 }, (_, offset) => (startMonth + offset) % 12);
}

const defaultCategories = [
  { key: "books", label: "Books", yScore: 6, nScore: -3 },
  { key: "sports", label: "Sports", yScore: 5, nScore: -2 },
  { key: "content", label: "Content", yScore: 4, nScore: -2 },
  { key: "gr", label: "GR", yScore: 5, nScore: -2 },
];

const defaultPresets = [
  { key: "daily-exercise", name: "Exercise", yScore: 10, nScore: -4 },
  { key: "daily-reading", name: "Reading", yScore: 6, nScore: -3 },
  { key: "daily-focus", name: "Deep Work", yScore: 8, nScore: -4 },
  { key: "daily-sleep", name: "Enough Sleep", yScore: 7, nScore: -4 },
  { key: "daily-late-snack", name: "No Late Snack", yScore: 4, nScore: -8 },
  { key: "daily-scroll", name: "Less Scrolling", yScore: 4, nScore: -5 },
  { key: "daily-delay", name: "No Procrastination", yScore: 5, nScore: -7 },
  { key: "daily-late-sleep", name: "Late Sleep", yScore: -6, nScore: 3 },
];

const calendarDutyOptions = [
  { key: "afterSchool", label: "방" },
  { key: "nightStudy", label: "야" },
  { key: "clubActivity", label: "동" },
];

const schoolNoteColors = ["cream", "sage", "peach", "blue", "rose", "lavender", "mint", "butter"];
const noteTabColors = ["kraft", "sage", "peach", "blue", "butter", "rose", "mint", "lavender"];

const defaultNoteTabs = [
  { id: "school", label: "School", color: "kraft" },
  { id: "univ", label: "UNIV", color: "sage" },
  { id: "progress", label: "Progress", color: "peach" },
  { id: "life", label: "Life", color: "blue" },
];

function createDefaultMemoCards(globalMemos = {}) {
  return [
    { id: "memo-life", title: "Life", leftTitle: "", leftText: globalMemos.life || "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
    { id: "memo-school", title: "School", leftTitle: "", leftText: globalMemos.school || "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
    { id: "memo-ideas", title: "Ideas", leftTitle: "", leftText: "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
  ];
}

function cloneCategories() {
  return defaultCategories.map((category) => ({ ...category }));
}

function clonePresets() {
  return defaultPresets.map((preset) => ({ ...preset }));
}

function parseScore(value, fallback) {
  if (value === "" || value === "-") return value;
  if (typeof value === "string" && /^\d+\s*(?:~|-|,)\s*\d*$/.test(value.trim())) return value.trim();
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

function scoreNumber(value, fallback = 0) {
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

function createEmptyWeeklyPlan(categories = defaultCategories) {
  return categories.reduce((plan, category) => {
    plan[category.key] = weekDays.reduce((days, day) => {
      days[day.key] = "";
      return days;
    }, {});
    return plan;
  }, {});
}

function normalizeCategories(savedCategories, fallbackCategories = cloneCategories()) {
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

function normalizePresets(savedPresets) {
  const source = Array.isArray(savedPresets) && savedPresets.length ? savedPresets : clonePresets();
  return source
    .filter((preset) => preset && preset.key && preset.name)
    .map((preset) => ({
      key: preset.key,
      name: preset.name,
      yScore: parseScore(preset.yScore, 5),
      nScore: parseScore(preset.nScore, -2),
    }));
}

function normalizeWeeklyPlan(plan, categories) {
  const normalized = createEmptyWeeklyPlan(categories);
  categories.forEach((category) => {
    weekDays.forEach((day) => {
      normalized[category.key][day.key] = plan?.[category.key]?.[day.key] || "";
    });
  });
  return normalized;
}

function normalizeDateMarkers(markers) {
  return Array.from({ length: 8 }, (_, index) => ({
    text: markers?.[index]?.text || "",
    date: markers?.[index]?.date || "",
  }));
}

function normalizeCalendarDuties(duties) {
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

function normalizeCarryPenalties(penalties) {
  if (!penalties || typeof penalties !== "object") return {};
  return Object.entries(penalties).reduce((normalized, [dateKey, value]) => {
    if (value) normalized[dateKey] = true;
    return normalized;
  }, {});
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizeMemos(memos) {
  const global = memos?.global && typeof memos.global === "object" ? memos.global : { life: "", school: "" };
  const sourceCards = Array.isArray(memos?.cards) && memos.cards.length ? memos.cards : createDefaultMemoCards(global);
  const cards = sourceCards
    .filter((card) => card && card.id)
    .map((card, index) => ({
      id: card.id,
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

function normalizeWork(work) {
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

const mindfoldBlockTypes = ["text", "heading-1", "heading-2", "heading-3", "heading-4", "bullet", "callout", "quote"];
const mindfoldTextColors = {
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
const mindfoldTextColorOptions = [
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
const mindfoldBlockTypeOptions = [
  { type: "text", icon: "T", label: "텍스트" },
  { type: "heading-1", icon: "H1", label: "제목 1" },
  { type: "heading-2", icon: "H2", label: "제목 2" },
  { type: "heading-3", icon: "H3", label: "제목 3" },
  { type: "heading-4", icon: "H4", label: "제목 4" },
  { type: "bullet", icon: "\u2022", label: "목록" },
  { type: "callout", icon: "\u2610", label: "체크" },
  { type: "quote", icon: "\u201c", label: "인용" },
];
const mindfoldTrashRetentionDays = 30;
const mindfoldTrashRetentionMs = mindfoldTrashRetentionDays * 24 * 60 * 60 * 1000;

function normalizeMindfoldMasks(masks, textLength) {
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

const mindfoldMarkTypes = ["bold", "italic"];

function normalizeMindfoldMarks(marks, textLength) {
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

function mindfoldSelectionHasMark(marks, type, start, end) {
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

function normalizeMindfoldBlock(block, index = 0) {
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

function ensureMindfoldColumnInputs(block) {
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

function migrateMindfoldNode(node, index = 0) {
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

function collectMindfoldBlockIds(blocks, ids = []) {
  (blocks || []).forEach((block) => {
    ids.push(block.id);
    collectMindfoldBlockIds(block.children, ids);
  });
  return ids;
}

function normalizeMindfold(mindfold) {
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

function getActiveMindfoldTab(mindfold) {
  return mindfold.tabs.find((tab) => tab.id === mindfold.activeTabId) || mindfold.tabs[0];
}

function findMindfoldBlock(blocks, id) {
  for (const block of blocks || []) {
    if (block.id === id) return block;
    const found = findMindfoldBlock(block.children, id);
    if (found) return found;
  }
  return null;
}

function findMindfoldBlockLocation(blocks, id, parent = null) {
  for (let index = 0; index < (blocks || []).length; index += 1) {
    const block = blocks[index];
    if (block.id === id) return { block, index, parent, siblings: blocks };
    const found = findMindfoldBlockLocation(block.children, id, block);
    if (found) return found;
  }
  return null;
}

function mindfoldBlockContains(block, id) {
  return block?.id === id || Boolean(findMindfoldBlock(block?.children, id));
}

function adjustMindfoldMasks(masks, previousText, nextText) {
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

function adjustMindfoldMarks(marks, previousText, nextText) {
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

function getMindfoldEditableSelection(root) {
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

function setMindfoldEditableSelection(root, start, end = start) {
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

function getStableSchoolColor(id, index = 0) {
  const text = String(id || "");
  const hash = Array.from(text).reduce((sum, character) => sum + character.charCodeAt(0), index);
  return schoolNoteColors[Math.abs(hash) % schoolNoteColors.length];
}

function normalizeSchool(school) {
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

function normalizeNoteTabs(tabs) {
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

function createFallbackState() {
  const categories = cloneCategories();
  return {
    days: {},
    memos: normalizeMemos(),
    calendar: {},
    calendarDuties: {},
    routineAttempts: {},
    carryPenalties: {},
    flaggedDate: "",
    carryResetDate: "",
    carryAdjustment: 0,
    schoolPresets: clonePresets(),
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
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(source) {
  const fallback = createFallbackState();
  const categories = normalizeCategories(source?.categories, fallback.categories);
  const noteTabs = normalizeNoteTabs(source?.noteTabs);
  const noteSections = noteTabs.reduce((sections, tab) => {
    sections[tab.id] = normalizeSchool(source?.[tab.id]);
    return sections;
  }, {});
  const knownKeys = new Set([
    "days",
    "memos",
    "calendar",
    "calendarDuties",
    "routineAttempts",
    "carryPenalties",
    "flaggedDate",
    "carryResetDate",
    "carryAdjustment",
    "schoolPresets",
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
    BACKUP_IMAGES_KEY,
    "updatedAt",
  ]);
  const extraTabData =
    source && typeof source === "object"
      ? Object.fromEntries(Object.entries(source).filter(([key]) => !knownKeys.has(key)))
      : {};
  return {
    ...extraTabData,
    days: source?.days && typeof source.days === "object" ? source.days : {},
    memos: normalizeMemos(source?.memos),
    calendar: source?.calendar && typeof source.calendar === "object" ? source.calendar : {},
    calendarDuties: normalizeCalendarDuties(source?.calendarDuties),
    routineAttempts: source?.routineAttempts && typeof source.routineAttempts === "object" ? source.routineAttempts : {},
    carryPenalties: normalizeCarryPenalties(source?.carryPenalties),
    flaggedDate: source?.flaggedDate || "",
    carryResetDate: source?.carryResetDate || "",
    carryAdjustment: scoreNumber(source?.carryAdjustment, 0),
    schoolPresets: normalizePresets(source?.schoolPresets),
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
    updatedAt: source?.updatedAt || new Date().toISOString(),
  };
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return createFallbackState();
  }
}

function downloadTextFile(filename, text) {
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

function openNoteImageDb() {
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

async function withNoteImageStore(mode, action) {
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function putNoteImage(record) {
  await withNoteImageStore("readwrite", (store) => store.put(record));
}

async function deleteNoteImage(id) {
  if (!id) return;
  await withNoteImageStore("readwrite", (store) => store.delete(id));
}

async function getAllNoteImages() {
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

async function restoreNoteImages(records) {
  if (!Array.isArray(records)) return;
  await withNoteImageStore("readwrite", (store) => {
    store.clear();
    records.filter((record) => record?.id && record?.dataUrl).forEach((record) => store.put(record));
  });
}

function createBackupPayload(state, images = []) {
  return {
    ...normalizeState(state),
    [BACKUP_IMAGES_KEY]: images,
  };
}

function splitBackupPayload(payload) {
  const { [BACKUP_IMAGES_KEY]: images, ...state } = payload && typeof payload === "object" ? payload : {};
  return { images: Array.isArray(images) ? images : [], state };
}

function loadSyncBackend() {
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

function toDateKey(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${month} ${date.getDate()} (${weekday})`;
}

function formatScore(score) {
  if (score === "" || score === "-") return String(score);
  const numericScore = scoreNumber(score);
  return numericScore > 0 ? `+${numericScore}` : String(numericScore);
}

function getWeekSerial(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Math.floor(monday.getTime() / 604800000);
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function getDateDiffDays(fromDateKey, toDateKeyValue) {
  if (!fromDateKey || !toDateKeyValue) return "";
  const from = new Date(`${fromDateKey}T00:00:00`);
  const to = new Date(`${toDateKeyValue}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function formatDDay(fromDateKey, toDateKeyValue) {
  const diff = getDateDiffDays(fromDateKey, toDateKeyValue);
  if (diff === "") return "D";
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D+${diff}` : `D${diff}`;
}

function getWeekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return addDays(dateKey, -((date.getDay() + 6) % 7));
}

function formatCompactDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return { day: date.getDate(), month, weekday };
}

function getWeeklyPlanEntry(rawValue, dateKey) {
  const lines = String(rawValue || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { cycleNumber: "", value: "Not Set" };
  const lineIndex = ((getWeekSerial(dateKey) % lines.length) + lines.length) % lines.length;
  return { cycleNumber: lines.length > 1 ? lineIndex + 1 : "", value: lines[lineIndex] };
}

function getWeekdayKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return weekDays[(date.getDay() + 6) % 7].key;
}

function getWeekdayMeta(dateKey) {
  return weekDays.find((day) => day.key === getWeekdayKey(dateKey));
}

function createKey(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function encodeBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function hashText(value) {
  return encodeBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function deriveSyncKey(syncId, pin) {
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

async function createSyncDocId(syncId, pin) {
  return (await hashText(`dash-board-doc:${syncId}:${pin}`)).slice(0, 48);
}

function generateSyncIdValue() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("").replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function normalizeSyncId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function panelClickIsInteractive(target) {
  return Boolean(target.closest("button, input, textarea, select, label, a, summary, details, .no-panel-toggle"));
}

function CollapsiblePanel({ children, className, controls, description, isOpen, onToggle, title }) {
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

function App() {
  const [data, setData] = useState(loadState);
  const [activeView, setActiveView] = useState("dashboard");
  const [activeNoteView, setActiveNoteView] = useState("school");
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [openPanels, setOpenPanels] = useState({
    sync: true,
    system: true,
    schoolDaily: false,
    daily: false,
    weekly: false,
    calendar: false,
  });
  const [openMonths, setOpenMonths] = useState(() => new Set([new Date().getMonth()]));
  const [sync, setSync] = useState({
    backend: loadSyncBackend(),
    pin: localStorage.getItem(SYNC_REMEMBER_KEY) === "true" ? localStorage.getItem(SYNC_PIN_KEY) || "" : "",
    rememberDevice: localStorage.getItem(SYNC_REMEMBER_KEY) === "true",
    syncId: localStorage.getItem(SYNC_ID_KEY) || "",
    busy: false,
    status: localStorage.getItem(SYNC_REMEMBER_KEY) === "true" ? "Ready to auto connect." : "Not connected.",
  });

  const dataRef = useRef(data);
  const syncRef = useRef(sync);
  const pushTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const autoConnectRef = useRef(false);
  const mindfoldUndoRef = useRef([]);
  const mindfoldRedoRef = useRef([]);
  const mindfoldHistoryGroupRef = useRef({ key: "", timestamp: 0 });

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const tabs = normalizeNoteTabs(data.noteTabs);
    if (!tabs.some((tab) => tab.id === activeNoteView)) setActiveNoteView(tabs[0].id);
  }, [activeNoteView, data.noteTabs]);

  const saveData = (updater, options = {}) => {
    setData((current) => {
      const previousMindfold = options.captureMindfold
        ? normalizeMindfold(JSON.parse(JSON.stringify(current.mindfold)))
        : null;
      const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(current))) : updater;
      const normalized = normalizeState({ ...next, updatedAt: new Date().toISOString() });
      if (previousMindfold && JSON.stringify(previousMindfold) !== JSON.stringify(normalized.mindfold)) {
        const now = Date.now();
        const historyGroup = String(options.historyGroup || "");
        const canMerge = historyGroup
          && mindfoldHistoryGroupRef.current.key === historyGroup
          && now - mindfoldHistoryGroupRef.current.timestamp < 800;
        if (!canMerge) {
          mindfoldUndoRef.current.push(previousMindfold);
          if (mindfoldUndoRef.current.length > 100) mindfoldUndoRef.current.shift();
        }
        mindfoldRedoRef.current = [];
        mindfoldHistoryGroupRef.current = { key: historyGroup, timestamp: now };
      }
      dataRef.current = normalized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      if (!options.skipSync) scheduleAutoSync();
      return normalized;
    });
  };

  const updateSync = (updater) => {
    setSync((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      syncRef.current = next;
      return next;
    });
  };

  const setSyncStatus = (status) => {
    updateSync((current) => ({ ...current, status }));
  };

  const syncBackendReady = () => {
    const { backend } = syncRef.current;
    return Boolean(backend.supabaseUrl && backend.supabaseAnonKey);
  };

  const syncIdentityReady = () => Boolean(syncRef.current.syncId && syncRef.current.pin);

  const getSupabaseBaseUrl = () => syncRef.current.backend.supabaseUrl.replace(/\/+$/, "");

  const encryptSyncPayload = async () => {
    const { syncId, pin } = syncRef.current;
    const key = await deriveSyncKey(syncId, pin);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const state = dataRef.current;
    const body = JSON.stringify({ version: 1, state });
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(body));
    return {
      version: 1,
      cipher: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: SYNC_KDF_ITERATIONS,
      updatedAt: state.updatedAt,
      iv: encodeBase64Url(iv),
      data: encodeBase64Url(encrypted),
    };
  };

  const decryptSyncPayload = async (payload) => {
    const { syncId, pin } = syncRef.current;
    const key = await deriveSyncKey(syncId, pin);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(decodeBase64Url(payload.iv)) },
      key,
      decodeBase64Url(payload.data),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)).state;
  };

  const fetchRemoteSyncDoc = async (docId) => {
    const { backend } = syncRef.current;
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/get_dashboard_sync`, {
      method: "POST",
      headers: {
        apikey: backend.supabaseAnonKey,
        Authorization: `Bearer ${backend.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_doc_id: docId }),
    });
    if (!response.ok) throw new Error(`Pull failed (${response.status})`);
    const rows = await response.json();
    return rows[0] || null;
  };

  const upsertRemoteSyncDoc = async (docId, payload) => {
    const { backend } = syncRef.current;
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/upsert_dashboard_sync`, {
      method: "POST",
      headers: {
        apikey: backend.supabaseAnonKey,
        Authorization: `Bearer ${backend.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_doc_id: docId, p_payload: payload }),
    });
    if (!response.ok) throw new Error(`Push failed (${response.status})`);
  };

  const pushSyncData = async ({ silent = false } = {}) => {
    if (!syncBackendReady() || !syncIdentityReady()) {
      if (!silent) setSyncStatus("Enter Supabase URL, Public Key, Sync ID, and PIN first.");
      return;
    }
    updateSync((current) => ({ ...current, busy: true, status: silent ? current.status : "Encrypting and pushing..." }));
    try {
      const docId = await createSyncDocId(syncRef.current.syncId, syncRef.current.pin);
      const payload = await encryptSyncPayload();
      await upsertRemoteSyncDoc(docId, payload);
      setSyncStatus(`Synced at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setSyncStatus(error.message || "Sync push failed.");
    } finally {
      updateSync((current) => ({ ...current, busy: false }));
    }
  };

  const pullSyncData = async ({ silent = false, force = true } = {}) => {
    if (!syncBackendReady() || !syncIdentityReady()) {
      if (!silent) setSyncStatus("Enter Supabase URL, Public Key, Sync ID, and PIN first.");
      return false;
    }
    updateSync((current) => ({ ...current, busy: true, status: silent ? current.status : "Pulling and decrypting..." }));
    try {
      const docId = await createSyncDocId(syncRef.current.syncId, syncRef.current.pin);
      const row = await fetchRemoteSyncDoc(docId);
      if (!row) {
        if (!silent) setSyncStatus("No cloud data yet. Push this device to create it.");
        return false;
      }
      const remoteUpdatedAt = row.payload?.updatedAt || row.updated_at || "";
      if (!force && remoteUpdatedAt && dataRef.current.updatedAt && remoteUpdatedAt <= dataRef.current.updatedAt) {
        if (!silent) setSyncStatus("Already up to date.");
        return false;
      }
      const remoteState = await decryptSyncPayload(row.payload);
      const normalized = normalizeState(remoteState);
      dataRef.current = normalized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setData(normalized);
      setSyncStatus(`Pulled at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
      return true;
    } catch {
      setSyncStatus("Pull failed. Check Supabase setup, Sync ID, and PIN.");
      return false;
    } finally {
      updateSync((current) => ({ ...current, busy: false }));
    }
  };

  const scheduleAutoSync = () => {
    if (!syncBackendReady() || !syncIdentityReady() || syncRef.current.busy) return;
    window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      pushSyncData({ silent: true });
    }, 1400);
  };

  const startAutoSyncPolling = () => {
    window.clearInterval(pollTimerRef.current);
    if (!syncBackendReady() || !syncIdentityReady()) return;
    pollTimerRef.current = window.setInterval(() => {
      const active = document.activeElement;
      const isEditing = active?.matches?.("input, textarea, select");
      if (syncRef.current.busy || pushTimerRef.current || isEditing) return;
      pullSyncData({ silent: true, force: false });
    }, 10000);
  };

  useEffect(() => {
    startAutoSyncPolling();
    return () => {
      window.clearTimeout(pushTimerRef.current);
      window.clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    document.querySelectorAll(".collapsible-panel, .schedule-panel, .memo-panel, .history-panel, .score-meter, .score-details > div, .preset-card, .entry-item").forEach((element) => {
      if (element.dataset.glowReady) return;
      element.dataset.glowReady = "true";
      element.addEventListener("pointermove", (event) => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
        element.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
      });
    });
  });

  const entries = data.days[selectedDate] || [];
  const weekday = getWeekdayMeta(selectedDate);
  const routineTried = Boolean(data.routineAttempts?.[selectedDate]);
  const carryPenaltyMarked = Boolean(data.carryPenalties?.[selectedDate]);

  const getEntries = (dateKey = selectedDate) => (Array.isArray(data.days[dateKey]) ? data.days[dateKey] : []);
  const getDayTotal = (dateKey) => getEntries(dateKey).reduce((sum, entry) => sum + entry.score, 0);
  const getCarryTotal = () => {
    const carryFromEntries = Object.entries(data.days).reduce((sum, [key, dayEntries]) => {
      if (key >= selectedDate || !Array.isArray(dayEntries)) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
      return sum + dayEntries.reduce((daySum, entry) => daySum + entry.score, 0);
    }, 0);
    const carryPenaltyTotal = Object.entries(data.carryPenalties || {}).reduce((sum, [key, marked]) => {
      if (!marked || key > selectedDate) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
      return sum - 2;
    }, 0);
    return carryFromEntries + carryPenaltyTotal + scoreNumber(data.carryAdjustment, 0);
  };

  const scoreInfo = useMemo(() => {
    const plus = entries.filter((entry) => entry.score > 0).reduce((sum, entry) => sum + entry.score, 0);
    const minus = entries.filter((entry) => entry.score < 0).reduce((sum, entry) => sum + entry.score, 0);
    const carry = getCarryTotal();
    const total = carry + plus + minus;
    return { carry, plus, minus, total };
  }, [data, selectedDate]);

  const togglePanel = (key) => {
    setOpenPanels((current) => ({ ...current, [key]: !current[key] }));
  };

  const shiftDate = (days) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(toDateKey(date));
  };

  const toggleChoice = ({ planKey, choice, name, score }) => {
    saveData((draft) => {
      const currentEntries = Array.isArray(draft.days[selectedDate]) ? draft.days[selectedDate] : [];
      const existing = currentEntries.find((entry) => entry.planKey === planKey);
      if (existing?.choice === choice) {
        draft.days[selectedDate] = currentEntries.filter((entry) => entry.id !== existing.id);
      } else {
        draft.days[selectedDate] = currentEntries.filter((entry) => entry.planKey !== planKey);
        draft.days[selectedDate].push({
          id: crypto.randomUUID(),
          name,
          score,
          createdAt: new Date().toISOString(),
          planKey,
          choice,
        });
      }
      return draft;
    });
  };

  const toggleRoutineAttempt = () => {
    saveData((draft) => {
      draft.routineAttempts = draft.routineAttempts || {};
      draft.carryPenalties = normalizeCarryPenalties(draft.carryPenalties);
      if (draft.routineAttempts[selectedDate]) delete draft.routineAttempts[selectedDate];
      else {
        draft.routineAttempts[selectedDate] = true;
        delete draft.carryPenalties[selectedDate];
      }
      return draft;
    });
  };

  const toggleCarryPenalty = () => {
    saveData((draft) => {
      draft.routineAttempts = draft.routineAttempts || {};
      draft.carryPenalties = normalizeCarryPenalties(draft.carryPenalties);
      if (draft.carryPenalties[selectedDate]) delete draft.carryPenalties[selectedDate];
      else {
        draft.carryPenalties[selectedDate] = true;
        delete draft.routineAttempts[selectedDate];
      }
      return draft;
    });
  };

  const toggleFlaggedDate = () => {
    saveData((draft) => {
      draft.flaggedDate = draft.flaggedDate === selectedDate ? "" : selectedDate;
      return draft;
    });
  };

  const resetCarry = () => {
    saveData((draft) => {
      draft.carryResetDate = selectedDate;
      draft.carryAdjustment = 0;
      return draft;
    });
  };

  const adjustCarry = (amount) => {
    saveData((draft) => {
      draft.carryAdjustment = scoreNumber(draft.carryAdjustment, 0) + amount;
      return draft;
    });
  };

  const setActiveMemo = (memoId) => {
    saveData((draft) => {
      draft.memos.activeMemoId = memoId;
      return draft;
    });
  };

  const moveMemoCard = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      const fromIndex = draft.memos.cards.findIndex((card) => card.id === fromId);
      const toIndex = draft.memos.cards.findIndex((card) => card.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [card] = draft.memos.cards.splice(fromIndex, 1);
      draft.memos.cards.splice(toIndex, 0, card);
      draft.memos.activeMemoId = card.id;
      return draft;
    });
  };

  const updateMemoCard = (id, field, value) => {
    saveData((draft) => {
      const card = draft.memos.cards.find((item) => item.id === id);
      if (!card) return draft;
      if (field === "title") card.title = value;
      if (field === "leftTitle") card.leftTitle = value;
      if (field === "leftText") card.leftText = value;
      if (field === "leftExtraTitle") card.leftExtraTitle = value;
      if (field === "leftTextExtra") card.leftTextExtra = value;
      if (field === "centerTitle") card.centerTitle = value;
      if (field === "centerText") card.centerText = value;
      if (field === "centerExtraTitle") card.centerExtraTitle = value;
      if (field === "centerTextExtra") card.centerTextExtra = value;
      if (field === "rightTitle") card.rightTitle = value;
      if (field === "rightText") card.rightText = value;
      if (field === "rightExtraTitle") card.rightExtraTitle = value;
      if (field === "rightTextExtra") card.rightTextExtra = value;
      if (field === "memoSplits") card.memoSplits = { ...(card.memoSplits || {}), ...value };
      if (id === "memo-life") draft.memos.global.life = card.leftText || "";
      if (id === "memo-school") draft.memos.global.school = card.leftText || "";
      return draft;
    });
  };

  const addMemoCard = () => {
    saveData((draft) => {
      const card = { id: createKey("memo"), title: `Memo ${draft.memos.cards.length + 1}`, leftTitle: "", leftText: "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } };
      draft.memos.cards.push(card);
      draft.memos.activeMemoId = card.id;
      return draft;
    });
  };

  const removeMemoCard = (id) => {
    const confirmed = window.confirm("Delete this memo?");
    if (!confirmed) return;
    saveData((draft) => {
      if (draft.memos.cards.length <= 1) return draft;
      const index = draft.memos.cards.findIndex((card) => card.id === id);
      draft.memos.cards = draft.memos.cards.filter((card) => card.id !== id);
      if (draft.memos.activeMemoId === id) {
        draft.memos.activeMemoId = draft.memos.cards[Math.max(0, index - 1)]?.id || draft.memos.cards[0].id;
      }
      return draft;
    });
  };

  const addPresetTo = (listKey, keyPrefix) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      presets.push({ key: createKey(keyPrefix), name: `New Record ${presets.length + 1}`, yScore: 5, nScore: -2 });
      draft[listKey] = presets;
      return draft;
    });
  };

  const updatePresetIn = (listKey, index, field, value) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      const preset = presets[index];
      if (!preset) return draft;
      if (field === "name") preset.name = value;
      if (field === "yScore") preset.yScore = value;
      if (field === "nScore") preset.nScore = value;
      draft[listKey] = presets;
      return draft;
    });
  };

  const movePresetIn = (listKey, fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      const fromIndex = presets.findIndex((preset) => preset.key === fromKey);
      const toIndex = presets.findIndex((preset) => preset.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [preset] = presets.splice(fromIndex, 1);
      presets.splice(toIndex, 0, preset);
      draft[listKey] = presets;
      return draft;
    });
  };

  const removePresetFrom = (listKey, index) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      presets.splice(index, 1);
      draft[listKey] = presets;
      return draft;
    });
  };

  const addPreset = () => addPresetTo("presets", "daily");
  const updatePreset = (index, field, value) => updatePresetIn("presets", index, field, value);
  const movePreset = (fromKey, toKey) => movePresetIn("presets", fromKey, toKey);
  const removePreset = (index) => removePresetFrom("presets", index);
  const addSchoolPreset = () => addPresetTo("schoolPresets", "school");
  const updateSchoolPreset = (index, field, value) => updatePresetIn("schoolPresets", index, field, value);
  const moveSchoolPreset = (fromKey, toKey) => movePresetIn("schoolPresets", fromKey, toKey);
  const removeSchoolPreset = (index) => removePresetFrom("schoolPresets", index);

  const addCategory = () => {
    saveData((draft) => {
      const category = { key: createKey("cat"), label: `New Category ${draft.categories.length + 1}`, yScore: 5, nScore: -2 };
      draft.categories.push(category);
      draft.weeklyPlan[category.key] = createEmptyWeeklyPlan([category])[category.key];
      return draft;
    });
  };

  const updateCategory = (key, field, value) => {
    saveData((draft) => {
      const category = draft.categories.find((item) => item.key === key);
      if (!category) return draft;
      if (field === "label") category.label = value;
      if (field === "yScore") category.yScore = value;
      if (field === "nScore") category.nScore = value;
      return draft;
    });
  };

  const moveCategory = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    saveData((draft) => {
      const fromIndex = draft.categories.findIndex((category) => category.key === fromKey);
      const toIndex = draft.categories.findIndex((category) => category.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [category] = draft.categories.splice(fromIndex, 1);
      draft.categories.splice(toIndex, 0, category);
      return draft;
    });
  };

  const removeCategory = (key) => {
    saveData((draft) => {
      if (draft.categories.length <= 1) return draft;
      draft.categories = draft.categories.filter((category) => category.key !== key);
      delete draft.weeklyPlan[key];
      return draft;
    });
  };

  const updateWeeklyPlan = (categoryKey, dayKey, value) => {
    saveData((draft) => {
      if (!draft.weeklyPlan[categoryKey]) draft.weeklyPlan[categoryKey] = createEmptyWeeklyPlan([{ key: categoryKey }])[categoryKey];
      draft.weeklyPlan[categoryKey][dayKey] = value;
      return draft;
    });
  };

  const updateCalendarNote = (dateKey, value) => {
    saveData((draft) => {
      const note = value.replace(/\r\n/g, "\n");
      if (note) draft.calendar[dateKey] = note;
      else delete draft.calendar[dateKey];
      return draft;
    });
  };

  const toggleCalendarDuty = (dateKey, dutyKey) => {
    saveData((draft) => {
      draft.calendarDuties = normalizeCalendarDuties(draft.calendarDuties);
      const current = draft.calendarDuties[dateKey] || {};
      const next = { ...current, [dutyKey]: !current[dutyKey] };
      const active = Object.fromEntries(Object.entries(next).filter(([, value]) => value));
      if (Object.keys(active).length) draft.calendarDuties[dateKey] = active;
      else delete draft.calendarDuties[dateKey];
      return draft;
    });
  };

  const updateDateMarker = (index, field, value) => {
    saveData((draft) => {
      const markers = normalizeDateMarkers(draft.dateMarkers);
      markers[index] = { ...markers[index], [field]: value };
      draft.dateMarkers = markers;
      return draft;
    });
  };

  const setActiveMindfoldBlock = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      if (findMindfoldBlock(activeTab.blocks, id)) activeTab.activeId = id;
      return draft;
    });
  };

  const restoreMindfoldHistory = (direction) => {
    const source = direction === "redo" ? mindfoldRedoRef.current : mindfoldUndoRef.current;
    const target = direction === "redo" ? mindfoldUndoRef.current : mindfoldRedoRef.current;
    const currentSnapshot = normalizeMindfold(JSON.parse(JSON.stringify(dataRef.current.mindfold)));
    const currentSignature = JSON.stringify(currentSnapshot);
    let snapshot = null;
    while (source.length && !snapshot) {
      const candidate = source.pop();
      if (JSON.stringify(candidate) !== currentSignature) snapshot = candidate;
    }
    if (!snapshot) return false;
    target.push(currentSnapshot);
    if (target.length > 100) target.shift();
    mindfoldHistoryGroupRef.current = { key: "", timestamp: 0 };
    saveData((draft) => {
      draft.mindfold = snapshot;
      return draft;
    });
    return true;
  };

  const updateMindfoldBlock = (id, patch) => {
    const patchObject = typeof patch === "string" ? { text: patch } : patch || {};
    const isTextOnlyChange = Object.prototype.hasOwnProperty.call(patchObject, "text")
      && !patchObject.addMark
      && !patchObject.type
      && !Object.prototype.hasOwnProperty.call(patchObject, "toggle")
      && !Object.prototype.hasOwnProperty.call(patchObject, "checked")
      && !Object.prototype.hasOwnProperty.call(patchObject, "columns")
      && !Object.prototype.hasOwnProperty.call(patchObject, "open")
      && !Object.prototype.hasOwnProperty.call(patchObject, "color");
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      const block = findMindfoldBlock(activeTab.blocks, id);
      if (!block) return draft;
      const nextPatch = typeof patch === "string" ? { text: patch } : patch || {};
      if (Object.prototype.hasOwnProperty.call(nextPatch, "text")) {
        const nextText = String(nextPatch.text).replace(/\r?\n/g, " ");
        block.masks = adjustMindfoldMasks(block.masks, block.text, nextText);
        block.marks = adjustMindfoldMarks(block.marks, block.text, nextText);
        block.text = nextText;
        if (nextText) block.columnPlaceholder = false;
      }
      if (mindfoldBlockTypes.includes(nextPatch.type)) block.type = nextPatch.type;
      if (Object.prototype.hasOwnProperty.call(mindfoldTextColors, nextPatch.color)) block.color = nextPatch.color;
      if (Object.prototype.hasOwnProperty.call(nextPatch, "toggle")) block.toggle = Boolean(nextPatch.toggle);
      if (Object.prototype.hasOwnProperty.call(nextPatch, "checked")) block.checked = Boolean(nextPatch.checked);
      if (Object.prototype.hasOwnProperty.call(nextPatch, "columns")) block.columns = [2, 3, 4].includes(Number(nextPatch.columns)) ? Number(nextPatch.columns) : 1;
      if (Object.prototype.hasOwnProperty.call(nextPatch, "open")) block.open = Boolean(nextPatch.open);
      if (
        nextPatch.addMark
        && mindfoldMarkTypes.includes(nextPatch.addMark.type)
        && Number.isFinite(nextPatch.addMark.start)
        && Number.isFinite(nextPatch.addMark.end)
      ) {
        block.marks = normalizeMindfoldMarks([
          ...block.marks,
          { id: createKey("mindfold-mark"), ...nextPatch.addMark },
        ], block.text.length);
      }
      activeTab.activeId = id;
      return draft;
    }, { captureMindfold: true, historyGroup: isTextOnlyChange ? `text:${id}` : "" });
  };

  const setMindfoldColumns = (id, columns, removeId = "") => {
    const columnCount = [2, 3, 4].includes(Number(columns)) ? Number(columns) : 1;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      let location = findMindfoldBlockLocation(activeTab.blocks, id);
      if (!location) return draft;

      if (location.parent?.columns > 1 && Number.isInteger(location.block.column)) {
        const layout = location.parent;
        const layoutLocation = findMindfoldBlockLocation(activeTab.blocks, layout.id);
        if (!layoutLocation) return draft;
        const splitIndex = layout.children.findIndex((child) => child.id === id);
        const promoted = layout.children
          .splice(splitIndex)
          .filter((child) => child.id !== removeId)
          .filter((child) => !child.columnPlaceholder)
          .map((child) => ({ ...child, column: null }));
        ensureMindfoldColumnInputs(layout);
        layoutLocation.siblings.splice(layoutLocation.index + 1, 0, ...promoted);
        location = findMindfoldBlockLocation(activeTab.blocks, id);
        if (columnCount === 1 || !location) {
          activeTab.activeId = promoted[0]?.id || layout.id;
          return draft;
        }
      }

      const { block } = location;
      if (columnCount === 1) {
        const nestedChildren = block.children.filter((child) => !Number.isInteger(child.column));
        const promotedChildren = block.children
          .filter((child) => Number.isInteger(child.column))
          .filter((child) => child.id !== removeId)
          .filter((child) => !child.columnPlaceholder)
          .map((child) => ({ ...child, column: null }));
        block.columns = 1;
        block.children = nestedChildren;
        location.siblings.splice(location.index + 1, 0, ...promotedChildren);
        activeTab.activeId = id;
        return draft;
      }

      const wasColumnLayout = block.columns > 1;
      if (!wasColumnLayout) {
        let sectionEnd = location.index + 1;
        while (sectionEnd < location.siblings.length && location.siblings[sectionEnd].columns === 1) {
          sectionEnd += 1;
        }
        const followingBlocks = location.siblings.splice(location.index + 1, sectionEnd - location.index - 1);
        followingBlocks.forEach((child) => {
          child.column = 0;
        });
        block.children.push(...followingBlocks);
      }
      block.columns = columnCount;
      block.children.forEach((child) => {
        child.column = Number.isInteger(child.column) && child.column >= 0 && child.column < columnCount
          ? child.column
          : null;
      });
      ensureMindfoldColumnInputs(block);
      activeTab.activeId = id;
      return draft;
    }, { captureMindfold: true });
  };

  const addMindfoldBlock = (parentId = "", afterId = "", type = "text", text = "", column = null) => {
    let nextId = createKey("mindfold-block");
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      const nextBlock = normalizeMindfoldBlock({ id: nextId, type, text, open: true, children: [], masks: [], column });
      if (parentId) {
        const parent = findMindfoldBlock(activeTab.blocks, parentId);
        if (parent) {
          const placeholder = Number.isInteger(column)
            ? parent.children.find((child) => child.column === column && child.columnPlaceholder)
            : null;
          if (placeholder) {
            nextId = placeholder.id;
            activeTab.activeId = nextId;
            return draft;
          }
          if (!(parent.columns > 1 && Number.isInteger(nextBlock.column))) parent.open = true;
          const afterIndex = afterId ? parent.children.findIndex((child) => child.id === afterId) : -1;
          if (afterId === parent.id && Number.isInteger(column)) {
            const firstColumnBlock = parent.children.findIndex((child) => child.column === column);
            if (firstColumnBlock >= 0) parent.children.splice(firstColumnBlock, 0, nextBlock);
            else parent.children.push(nextBlock);
          } else if (afterIndex >= 0) parent.children.splice(afterIndex + 1, 0, nextBlock);
          else parent.children.push(nextBlock);
        } else {
          activeTab.blocks.push(nextBlock);
        }
      } else if (afterId) {
        const location = findMindfoldBlockLocation(activeTab.blocks, afterId);
        if (location) location.siblings.splice(location.index + 1, 0, nextBlock);
        else activeTab.blocks.push(nextBlock);
      } else {
        activeTab.blocks.push(nextBlock);
      }
      activeTab.activeId = nextId;
      return draft;
    }, { captureMindfold: true });
    return nextId;
  };

  const removeMindfoldBlock = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      const location = findMindfoldBlockLocation(activeTab.blocks, id);
      if (!location) return draft;
      location.siblings.splice(location.index, 1);
      if (location.parent?.columns > 1) ensureMindfoldColumnInputs(location.parent);
      if (!activeTab.blocks.length) activeTab.blocks.push(normalizeMindfoldBlock({ type: "text", text: "" }));
      if (!findMindfoldBlock(activeTab.blocks, activeTab.activeId)) {
        activeTab.activeId = collectMindfoldBlockIds(activeTab.blocks)[0] || "";
      }
      return draft;
    }, { captureMindfold: true });
  };

  const moveMindfoldBlock = (fromId, toId, placement = "after", targetColumn = null) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      const source = findMindfoldBlockLocation(activeTab.blocks, fromId);
      const targetBlock = findMindfoldBlock(activeTab.blocks, toId);
      if (!source || !targetBlock || mindfoldBlockContains(source.block, toId)) return draft;
      const sourceLayout = source.parent?.columns > 1 ? source.parent : null;
      const [movingBlock] = source.siblings.splice(source.index, 1);
      const target = findMindfoldBlockLocation(activeTab.blocks, toId);
      if (!target) {
        source.siblings.splice(source.index, 0, movingBlock);
        return draft;
      }
      if (placement === "column") {
        const column = Math.max(0, Math.min(target.block.columns - 1, Number(targetColumn) || 0));
        movingBlock.column = column;
        movingBlock.columnPlaceholder = false;
        target.block.children = target.block.children.filter((child) => (
          child.id === movingBlock.id || child.column !== column || !child.columnPlaceholder
        ));
        target.block.children.push(movingBlock);
      } else if (placement === "inside") {
        movingBlock.column = null;
        target.block.toggle = true;
        target.block.open = true;
        target.block.children.push(movingBlock);
      } else {
        movingBlock.column = target.parent?.columns > 1
          ? (Number.isInteger(target.block.column) ? target.block.column : 0)
          : null;
        target.siblings.splice(target.index + (placement === "after" ? 1 : 0), 0, movingBlock);
      }
      ensureMindfoldColumnInputs(sourceLayout);
      if (placement === "column") ensureMindfoldColumnInputs(target.block);
      else if (target.parent?.columns > 1) ensureMindfoldColumnInputs(target.parent);
      activeTab.activeId = fromId;
      return draft;
    }, { captureMindfold: true });
  };

  const indentMindfoldBlock = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      const location = findMindfoldBlockLocation(activeTab.blocks, id);
      if (!location || location.index <= 0) return draft;
      const previous = location.siblings[location.index - 1];
      const [movingBlock] = location.siblings.splice(location.index, 1);
      previous.toggle = true;
      previous.open = true;
      previous.children.push(movingBlock);
      activeTab.activeId = id;
      return draft;
    }, { captureMindfold: true });
  };

  const outdentMindfoldBlock = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const activeTab = getActiveMindfoldTab(draft.mindfold);
      const location = findMindfoldBlockLocation(activeTab.blocks, id);
      if (!location?.parent) return draft;
      const parentLocation = findMindfoldBlockLocation(activeTab.blocks, location.parent.id);
      if (!parentLocation) return draft;
      const [movingBlock] = location.siblings.splice(location.index, 1);
      parentLocation.siblings.splice(parentLocation.index + 1, 0, movingBlock);
      activeTab.activeId = id;
      return draft;
    }, { captureMindfold: true });
  };

  const maskMindfoldSelection = (id, start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const block = findMindfoldBlock(getActiveMindfoldTab(draft.mindfold).blocks, id);
      if (!block) return draft;
      block.masks = normalizeMindfoldMasks([...block.masks, { id: createKey("mindfold-mask"), start, end }], block.text.length);
      return draft;
    }, { captureMindfold: true });
  };

  const clearMindfoldMasks = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const block = findMindfoldBlock(getActiveMindfoldTab(draft.mindfold).blocks, id);
      if (block) block.masks = [];
      return draft;
    }, { captureMindfold: true });
  };

  const toggleMindfoldMark = (id, type, start, end) => {
    if (!mindfoldMarkTypes.includes(type) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const block = findMindfoldBlock(getActiveMindfoldTab(draft.mindfold).blocks, id);
      if (!block) return draft;
      const marks = normalizeMindfoldMarks(block.marks, block.text.length);
      if (mindfoldSelectionHasMark(marks, type, start, end)) {
        block.marks = normalizeMindfoldMarks(marks.flatMap((mark) => {
          if (mark.type !== type || mark.end <= start || mark.start >= end) return [mark];
          const pieces = [];
          if (mark.start < start) pieces.push({ ...mark, id: createKey("mindfold-mark"), end: start });
          if (mark.end > end) pieces.push({ ...mark, id: createKey("mindfold-mark"), start: end });
          return pieces;
        }), block.text.length);
      } else {
        block.marks = normalizeMindfoldMarks([
          ...marks,
          { id: createKey("mindfold-mark"), type, start, end },
        ], block.text.length);
      }
      return draft;
    }, { captureMindfold: true });
  };

  const setActiveMindfoldTab = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      if (draft.mindfold.tabs.some((tab) => tab.id === id)) draft.mindfold.activeTabId = id;
      return draft;
    });
  };

  const addMindfoldTab = () => {
    const nextId = createKey("mindfold-tab");
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const nextIndex = draft.mindfold.tabs.length + 1;
      const firstBlock = normalizeMindfoldBlock({ type: "text", text: "" });
      draft.mindfold.tabs.push({ id: nextId, label: `페이지 ${nextIndex}`, blocks: [firstBlock], activeId: firstBlock.id });
      draft.mindfold.activeTabId = nextId;
      return draft;
    }, { captureMindfold: true });
    return nextId;
  };

  const renameMindfoldTab = (id, label) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const tab = draft.mindfold.tabs.find((item) => item.id === id);
      if (tab) tab.label = String(label || "이름 없는 페이지").trim().slice(0, 28) || "이름 없는 페이지";
      return draft;
    }, { captureMindfold: true });
  };

  const moveMindfoldTab = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const fromIndex = draft.mindfold.tabs.findIndex((tab) => tab.id === fromId);
      const toIndex = draft.mindfold.tabs.findIndex((tab) => tab.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [movingTab] = draft.mindfold.tabs.splice(fromIndex, 1);
      draft.mindfold.tabs.splice(toIndex, 0, movingTab);
      return draft;
    }, { captureMindfold: true });
  };

  const removeMindfoldTab = (id) => {
    const currentMindfold = normalizeMindfold(dataRef.current.mindfold);
    if (currentMindfold.tabs.length <= 1) return;
    const target = currentMindfold.tabs.find((tab) => tab.id === id);
    if (!window.confirm(`'${target?.label || "이 페이지"}' 페이지를 휴지통으로 이동하시겠습니까?`)) return;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const index = draft.mindfold.tabs.findIndex((tab) => tab.id === id);
      if (index < 0 || draft.mindfold.tabs.length <= 1) return draft;
      const [removedTab] = draft.mindfold.tabs.splice(index, 1);
      draft.mindfold.trash.push({ ...removedTab, deletedAt: new Date().toISOString() });
      if (draft.mindfold.activeTabId === id) draft.mindfold.activeTabId = draft.mindfold.tabs[Math.min(index, draft.mindfold.tabs.length - 1)].id;
      return draft;
    }, { captureMindfold: true });
  };

  const restoreMindfoldTab = (id) => {
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      const index = draft.mindfold.trash.findIndex((tab) => tab.id === id);
      if (index < 0) return draft;
      const [restoredTab] = draft.mindfold.trash.splice(index, 1);
      delete restoredTab.deletedAt;
      draft.mindfold.tabs.push(restoredTab);
      draft.mindfold.activeTabId = restoredTab.id;
      return draft;
    }, { captureMindfold: true });
  };

  const permanentlyRemoveMindfoldTab = (id) => {
    const currentMindfold = normalizeMindfold(dataRef.current.mindfold);
    const target = currentMindfold.trash.find((tab) => tab.id === id);
    if (!target || !window.confirm(`'${target.label}' 페이지를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    saveData((draft) => {
      draft.mindfold = normalizeMindfold(draft.mindfold);
      draft.mindfold.trash = draft.mindfold.trash.filter((tab) => tab.id !== id);
      return draft;
    }, { captureMindfold: true });
  };

  const addMemoNote = (sectionKey, idPrefix) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const nextId = createKey(idPrefix);
      draft[sectionKey].notes.push({
        id: nextId,
        title: `Memo ${draft[sectionKey].notes.length + 1}`,
        content: "",
        open: true,
        color: "lavender",
      });
      return draft;
    });
  };

  const updateMemoNote = (sectionKey, id, field, value) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const note = draft[sectionKey].notes.find((item) => item.id === id);
      if (!note) return draft;
      if (field === "title") note.title = value;
      if (field === "content") note.content = value;
      if (field === "color" && schoolNoteColors.includes(value)) note.color = value;
      if (field === "images") note.images = Array.isArray(value) ? value.filter((image) => image?.id).map((image) => ({ id: image.id, name: String(image.name || "Attached image") })) : [];
      return draft;
    });
  };

  const toggleMemoNote = (sectionKey, id) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const note = draft[sectionKey].notes.find((item) => item.id === id);
      if (note) note.open = !note.open;
      return draft;
    });
  };

  const removeMemoNote = async (sectionKey, id, label) => {
    const confirmed = window.confirm(`Delete this ${label} memo?`);
    if (!confirmed) return;
    const currentNotes = normalizeSchool(dataRef.current[sectionKey]).notes;
    if (currentNotes.length <= 1) return;
    const currentNote = currentNotes.find((note) => note.id === id);
    await Promise.all((currentNote?.images || []).map((image) => image.id).filter(Boolean).map(deleteNoteImage));
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      if (draft[sectionKey].notes.length <= 1) return draft;
      draft[sectionKey].notes = draft[sectionKey].notes.filter((note) => note.id !== id);
      return draft;
    });
  };

  const moveMemoNote = (sectionKey, fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const fromIndex = draft[sectionKey].notes.findIndex((note) => note.id === fromId);
      const toIndex = draft[sectionKey].notes.findIndex((note) => note.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [note] = draft[sectionKey].notes.splice(fromIndex, 1);
      draft[sectionKey].notes.splice(toIndex, 0, note);
      return draft;
    });
  };

  const attachMemoImage = async (sectionKey, id, files) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
    if (!imageFiles.length) {
      window.alert("Please choose an image file.");
      return;
    }
    const currentNote = normalizeSchool(dataRef.current[sectionKey]).notes.find((note) => note.id === id);
    try {
      const nextImages = [...(currentNote?.images || [])];
      for (const file of imageFiles) {
        const imageId = createKey("note-image");
        const dataUrl = await readFileAsDataUrl(file);
        await putNoteImage({ id: imageId, dataUrl, name: file.name, type: file.type, updatedAt: new Date().toISOString() });
        nextImages.push({ id: imageId, name: file.name });
      }
      updateMemoNote(sectionKey, id, "images", nextImages);
    } catch {
      window.alert("Image attach failed. Please try a different file.");
    }
  };

  const removeMemoImage = async (sectionKey, id, imageId) => {
    const currentNote = normalizeSchool(dataRef.current[sectionKey]).notes.find((note) => note.id === id);
    if (!imageId) return;
    await deleteNoteImage(imageId);
    updateMemoNote(sectionKey, id, "images", (currentNote?.images || []).filter((image) => image.id !== imageId));
  };

  const addNoteTab = () => {
    const nextId = createKey("note");
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs);
      const nextLabel = `Note ${draft.noteTabs.length + 1}`;
      draft.noteTabs.push({ id: nextId, label: nextLabel, color: noteTabColors[draft.noteTabs.length % noteTabColors.length] });
      draft[nextId] = normalizeSchool({ notes: [{ id: createKey(`${nextId}-memo`), title: "Memo 1", content: "", open: true }] });
      return draft;
    });
    setActiveNoteView(nextId);
  };

  const updateNoteTab = (id, label) => {
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs).map((tab) => (tab.id === id ? { ...tab, label: label.slice(0, 24) } : tab));
      return draft;
    });
  };

  const removeNoteTab = async (id) => {
    const tabs = normalizeNoteTabs(dataRef.current.noteTabs);
    if (tabs.length <= 1) return;
    const tab = tabs.find((item) => item.id === id);
    const confirmed = window.confirm(`Delete the ${tab?.label || "Note"} tab?`);
    if (!confirmed) return;
    await Promise.all(normalizeSchool(dataRef.current[id]).notes.flatMap((note) => note.images || []).map((image) => image.id).filter(Boolean).map(deleteNoteImage));
    const nextActive = activeNoteView === id ? tabs.find((item) => item.id !== id)?.id || tabs[0].id : activeNoteView;
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs).filter((item) => item.id !== id);
      delete draft[id];
      return draft;
    });
    setActiveNoteView(nextActive);
  };

  const moveNoteTab = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs);
      const fromIndex = draft.noteTabs.findIndex((tab) => tab.id === fromId);
      const toIndex = draft.noteTabs.findIndex((tab) => tab.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [tab] = draft.noteTabs.splice(fromIndex, 1);
      draft.noteTabs.splice(toIndex, 0, tab);
      return draft;
    });
  };

  const connectSync = async () => {
    const nextSyncId = normalizeSyncId(syncRef.current.syncId);
    updateSync((current) => ({ ...current, syncId: nextSyncId }));
    localStorage.setItem(SYNC_BACKEND_KEY, JSON.stringify(syncRef.current.backend));
    localStorage.setItem(SYNC_ID_KEY, nextSyncId);
    if (!syncBackendReady()) {
      setSyncStatus("Enter Supabase URL and Public Key.");
      return;
    }
    if (!syncIdentityReady()) {
      setSyncStatus("Enter Sync ID and PIN.");
      return;
    }
    if (syncRef.current.rememberDevice) {
      localStorage.setItem(SYNC_REMEMBER_KEY, "true");
      localStorage.setItem(SYNC_PIN_KEY, syncRef.current.pin);
    } else {
      localStorage.removeItem(SYNC_REMEMBER_KEY);
      localStorage.removeItem(SYNC_PIN_KEY);
    }
    startAutoSyncPolling();
    const pulled = await pullSyncData({ force: true });
    if (!pulled) await pushSyncData();
  };

  useEffect(() => {
    if (autoConnectRef.current) return;
    if (!sync.rememberDevice || !sync.backend.supabaseUrl || !sync.backend.supabaseAnonKey || !sync.syncId || !sync.pin) return;
    autoConnectRef.current = true;
    setSyncStatus("Auto connecting...");
    connectSync();
  }, []);

  const forgetThisDevice = () => {
    const confirmed = window.confirm(
      "This will remove local app data, Sync ID, saved PIN, Supabase URL, and public key from this browser only. Cloud data will not be deleted. Continue?",
    );
    if (!confirmed) return;
    window.clearTimeout(pushTimerRef.current);
    window.clearInterval(pollTimerRef.current);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SYNC_BACKEND_KEY);
    localStorage.removeItem(SYNC_ID_KEY);
    localStorage.removeItem(SYNC_PIN_KEY);
    localStorage.removeItem(SYNC_REMEMBER_KEY);
    window.location.reload();
  };

  const exportBackup = async () => {
    const payload = createBackupPayload(dataRef.current, await getAllNoteImages());
    const filename = `dashboard-backup-${toDateKey(new Date())}.json`;
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
  };

  const copyBackup = async () => {
    try {
      const payload = createBackupPayload(dataRef.current, await getAllNoteImages());
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      window.alert("Dashboard backup data, including memo images, was copied to the clipboard.");
    } catch {
      window.alert("Copy failed. Please try Download Data instead.");
    }
  };

  const importBackup = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { images, state } = splitBackupPayload(JSON.parse(text));
      const normalized = normalizeState(state);
      const confirmed = window.confirm("This will replace the dashboard data in this browser with the selected backup file. Continue?");
      if (!confirmed) return;
      await restoreNoteImages(images);
      dataRef.current = normalized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setData(normalized);
      scheduleAutoSync();
    } catch {
      window.alert("Backup import failed. Please choose a valid dashboard backup JSON file.");
    }
  };

  const dashboardView = h(
    React.Fragment,
    null,
    h(SchedulePanel, { calendar: data.calendar, calendarDuties: data.calendarDuties, selectedDate }),
    h(
      "div",
      { className: "daily-workspace" },
      h(MemoPanel, {
        activeMemoId: data.memos.activeMemoId,
        addMemoCard,
        cards: data.memos.cards,
        moveMemoCard,
        removeMemoCard,
        setActiveMemo,
        updateMemoCard,
      }),
      h(
        "div",
        { className: "daily-left-rail" },
        h(ScorePanel, { carryPenaltyMarked, entryCount: entries.length, onAdjustCarry: adjustCarry, onResetCarry: resetCarry, onToggleAttempt: toggleRoutineAttempt, onToggleCarryPenalty: toggleCarryPenalty, routineTried, scoreInfo }),
        h(DateMarkerPanel, { dateMarkers: data.dateMarkers, selectedDate, updateDateMarker }),
      ),
    ),
    h(TodayPlanPanel, {
      categories: data.categories,
      entries,
      presets: data.presets,
      schoolPresets: data.schoolPresets,
      selectedDate,
      weekday,
      weeklyPlan: data.weeklyPlan,
      toggleChoice,
    }),
    h(CalendarPanel, {
      calendar: data.calendar,
      calendarDuties: data.calendarDuties,
      isOpen: openPanels.calendar,
      onToggle: () => togglePanel("calendar"),
      openMonths,
      selectedDate,
      setOpenMonths,
      toggleCalendarDuty,
      updateCalendarNote,
    }),
    h(DailyPanel, {
      addPreset: addSchoolPreset,
      controlsId: "schoolPresetGrid",
      isOpen: openPanels.schoolDaily,
      movePreset: moveSchoolPreset,
      onToggle: () => togglePanel("schoolDaily"),
      presets: data.schoolPresets,
      removePreset: removeSchoolPreset,
      title: "School",
      updatePreset: updateSchoolPreset,
    }),
    h(DailyPanel, {
      addPreset,
      controlsId: "presetGrid",
      isOpen: openPanels.daily,
      movePreset,
      onToggle: () => togglePanel("daily"),
      presets: data.presets,
      removePreset,
      title: "Daily",
      updatePreset,
    }),
    h(WeeklyPanel, {
      addCategory,
      categories: data.categories,
      isOpen: openPanels.weekly,
      moveCategory,
      onToggle: () => togglePanel("weekly"),
      removeCategory,
      selectedDate,
      updateCategory,
      updateWeeklyPlan,
      weeklyPlan: data.weeklyPlan,
    }),
    h(HistoryPanel, { carryPenalties: data.carryPenalties, flaggedDate: data.flaggedDate, getDayTotal, onToggleFlag: toggleFlaggedDate, routineAttempts: data.routineAttempts, selectedDate }),
  );

  const noteTabs = normalizeNoteTabs(data.noteTabs);
  const activeNoteKey = noteTabs.some((tab) => tab.id === activeNoteView) ? activeNoteView : noteTabs[0].id;
  const memoView = {
    addSchoolNote: () => addMemoNote(activeNoteKey, `${activeNoteKey}-note`),
    attachMemoImage: (id, file) => attachMemoImage(activeNoteKey, id, file),
    moveSchoolNote: (fromId, toId) => moveMemoNote(activeNoteKey, fromId, toId),
    notes: normalizeSchool(data[activeNoteKey]).notes,
    removeMemoImage: (id, imageId) => removeMemoImage(activeNoteKey, id, imageId),
    removeSchoolNote: (id) => removeMemoNote(activeNoteKey, id, activeNoteKey),
    toggleSchoolNote: (id) => toggleMemoNote(activeNoteKey, id),
    updateSchoolNote: (id, field, value) => updateMemoNote(activeNoteKey, id, field, value),
  };
  const settingsPanels = h(
    React.Fragment,
    null,
    h(SyncPanel, {
      forgetThisDevice,
      isOpen: openPanels.sync,
      onToggle: () => togglePanel("sync"),
      onConnect: connectSync,
      onGenerate: () => {
        const syncId = generateSyncIdValue();
        localStorage.setItem(SYNC_ID_KEY, syncId);
        updateSync((current) => ({ ...current, syncId }));
      },
      onPull: () => pullSyncData({ force: true }),
      onPush: () => pushSyncData(),
      setSync: updateSync,
      sync,
      syncReady: syncBackendReady() && Boolean(sync.syncId && sync.pin),
    }),
    h(SystemPanel, {
      copyBackup,
      exportBackup,
      importBackup,
      isOpen: openPanels.system,
      onToggle: () => togglePanel("system"),
    }),
  );

  return h(
    "main",
    { className: `app-shell hub-shell hub-view-${activeView}` },
    h(HubBar, { activeView, setActiveView }),
    activeView === "mindfold"
      ? h(MindfoldView, {
          addBlock: addMindfoldBlock,
          addTab: addMindfoldTab,
          clearMasks: clearMindfoldMasks,
          indentBlock: indentMindfoldBlock,
          maskSelection: maskMindfoldSelection,
          mindfold: data.mindfold,
          moveBlock: moveMindfoldBlock,
          moveTab: moveMindfoldTab,
          outdentBlock: outdentMindfoldBlock,
          removeBlock: removeMindfoldBlock,
          removeTab: removeMindfoldTab,
          permanentlyRemoveTab: permanentlyRemoveMindfoldTab,
          renameTab: renameMindfoldTab,
          restoreTab: restoreMindfoldTab,
          setActiveBlock: setActiveMindfoldBlock,
          setActiveTab: setActiveMindfoldTab,
          setColumns: setMindfoldColumns,
          toggleMark: toggleMindfoldMark,
          redo: () => restoreMindfoldHistory("redo"),
          undo: () => restoreMindfoldHistory("undo"),
          updateBlock: updateMindfoldBlock,
        })
      : activeView === "vault"
        ? h(VaultView, { settingsPanels })
        : h(
            React.Fragment,
            null,
            h(Topbar, { activeView, selectedDate, setActiveView, setSelectedDate, shiftDate }),
            activeView === "note"
              ? h(NoteView, { activeNoteView: activeNoteKey, addNoteTab, memoView, moveNoteTab, noteTabs, removeNoteTab, setActiveNoteView, updateNoteTab })
              : dashboardView,
          ),
  );
}

function HubBar({ activeView, setActiveView }) {
  const hubItems = [
    { key: "studio", label: "Studio", target: "dashboard", active: activeView === "dashboard" || activeView === "note" },
    { key: "mindfold", label: "Mindfold", target: "mindfold", active: activeView === "mindfold" },
  ];
  return h(
    "header",
    { className: "hub-bar", "aria-label": "Hub navigation" },
    h("div", { className: "hub-brand" }, h("span", null, "Hub"), h("small", null, "Studio / Mindfold")),
    h(
      "div",
      { className: "hub-actions" },
      h(
        "nav",
        { className: "hub-nav", "aria-label": "Hub sections" },
        hubItems.map((item) =>
          h(
            "button",
            {
              className: `hub-nav-button ${item.active ? "active" : ""}`,
              key: item.key,
              type: "button",
              "aria-current": item.active ? "page" : undefined,
              onClick: () => setActiveView(item.target),
            },
            item.label,
          ),
        ),
      ),
      h(
        "button",
        {
          className: `hub-vault-button ${activeView === "vault" ? "active" : ""}`,
          type: "button",
          title: "Vault",
          "aria-label": "Vault",
          "aria-current": activeView === "vault" ? "page" : undefined,
          onClick: () => setActiveView("vault"),
        },
        "\u2699",
      ),
    ),
  );
}

function AppNavigation({ activeView, setActiveView }) {
  const items = [
    { key: "dashboard", label: "Dash Board" },
    { key: "note", label: "Note" },
  ];
  const renderNavButton = (item) =>
    h(
      "button",
      {
        className: `nav-button ${activeView === item.key ? "active" : ""}`,
        key: item.key,
        type: "button",
        "aria-current": activeView === item.key ? "page" : undefined,
        onClick: () => setActiveView(item.key),
      },
      item.label,
    );
  return h(
    "nav",
    { className: "app-navigation", "aria-label": "Main menu" },
    h(
      "div",
      { className: "nav-buttons" },
      h("div", { className: "nav-row" }, items.map(renderNavButton)),
    ),
  );
}

function NoteView({ activeNoteView, addNoteTab, memoView, moveNoteTab, noteTabs, removeNoteTab, setActiveNoteView, updateNoteTab }) {
  const [dragTabId, setDragTabId] = useState("");
  const [editingTabId, setEditingTabId] = useState("");
  return h(
    React.Fragment,
    null,
    h(
      "nav",
      { className: "note-subnav", "aria-label": "Note categories" },
      h(
        "div",
        { className: "note-subnav-tabs" },
        noteTabs.map((item) =>
          h(
            "div",
            {
              className: `note-subnav-item ${activeNoteView === item.id ? "active" : ""} ${dragTabId === item.id ? "dragging" : ""}`,
              draggable: true,
              key: item.id,
              "data-color": item.color || "kraft",
              "aria-current": activeNoteView === item.id ? "page" : undefined,
              onClick: () => setActiveNoteView(item.id),
              onDragStart: (event) => {
                if (event.target.closest?.(".note-subnav-editor")) {
                  event.preventDefault();
                  return;
                }
                setDragTabId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/note-tab", item.id);
              },
              onDragOver: (event) => {
                if (!dragTabId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                const fromId = event.dataTransfer.getData("text/note-tab") || dragTabId;
                if (!fromId) return;
                event.preventDefault();
                moveNoteTab(fromId, item.id);
                setDragTabId("");
              },
              onDragEnd: () => setDragTabId(""),
            },
            editingTabId === item.id
              ? h("input", {
                  autoFocus: true,
                  className: "note-subnav-editor",
                  defaultValue: item.label,
                  "aria-label": "Edit note tab name",
                  onClick: (event) => event.stopPropagation(),
                  onBlur: (event) => {
                    updateNoteTab(item.id, event.currentTarget.value || "Note");
                    setEditingTabId("");
                  },
                  onKeyDown: (event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingTabId("");
                  },
                })
              : h("span", { className: "note-subnav-label" }, item.label),
          ),
        ),
      ),
      h(
        "div",
        { className: "note-tab-toolbar" },
        h("button", { className: "note-tab-tool note-tab-add", type: "button", onClick: addNoteTab, title: "Add note tab", "aria-label": "Add note tab" }, "+"),
        h("button", { className: "note-tab-tool note-tab-edit", type: "button", onClick: () => setEditingTabId(activeNoteView), title: "Rename selected tab", "aria-label": "Rename selected tab" }),
        h("button", { className: "note-tab-tool note-tab-delete", type: "button", disabled: noteTabs.length <= 1, onClick: () => removeNoteTab(activeNoteView), title: "Delete selected tab", "aria-label": "Delete selected tab" }),
      ),
    ),
    h(SchoolView, memoView),
  );
}

function SchoolView({ addSchoolNote, attachMemoImage, moveSchoolNote, notes, removeMemoImage, removeSchoolNote, toggleSchoolNote, updateSchoolNote }) {
  const [dragNoteId, setDragNoteId] = useState("");
  const [openColorNoteId, setOpenColorNoteId] = useState("");
  const [noteImageUrls, setNoteImageUrls] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [previewDragging, setPreviewDragging] = useState(false);
  const previewPanRef = useRef({ x: 0, y: 0 });
  const previewDragRef = useRef(null);
  const previewImageRef = useRef(null);
  const dragJustEndedRef = useRef(false);
  useEffect(() => {
    if (!openColorNoteId) return undefined;
    const closeColorMenu = () => setOpenColorNoteId("");
    document.addEventListener("click", closeColorMenu);
    return () => document.removeEventListener("click", closeColorMenu);
  }, [openColorNoteId]);
  useEffect(() => {
    let mounted = true;
    const imageIds = new Set(notes.flatMap((note) => note.images || []).map((image) => image.id).filter(Boolean));
    getAllNoteImages()
      .then((records) => {
        if (!mounted) return;
        const nextUrls = records.reduce((urls, record) => {
          if (imageIds.has(record.id)) urls[record.id] = record.dataUrl;
          return urls;
        }, {});
        setNoteImageUrls(nextUrls);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [notes.map((note) => `${note.id}:${(note.images || []).map((image) => image.id).join(",")}`).join("|")]);
  const closeImagePreview = () => {
    setPreviewImage(null);
    setPreviewDragging(false);
    previewDragRef.current = null;
  };
  const openImagePreview = (image) => {
    setPreviewZoom(1);
    previewPanRef.current = { x: 0, y: 0 };
    setPreviewPan({ x: 0, y: 0 });
    setPreviewDragging(false);
    previewDragRef.current = null;
    setPreviewImage(image);
  };
  const applyPreviewPan = (pan) => {
    previewPanRef.current = pan;
    if (previewImageRef.current) {
      previewImageRef.current.style.setProperty("--preview-pan-x", `${pan.x}px`);
      previewImageRef.current.style.setProperty("--preview-pan-y", `${pan.y}px`);
    }
  };
  const startPreviewDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    previewDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewPanRef.current.x,
      originY: previewPanRef.current.y,
    };
    setPreviewDragging(true);
  };
  const movePreviewDrag = (event) => {
    const previewDrag = previewDragRef.current;
    if (!previewDrag || previewDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyPreviewPan({
      x: previewDrag.originX + event.clientX - previewDrag.startX,
      y: previewDrag.originY + event.clientY - previewDrag.startY,
    });
  };
  const endPreviewDrag = (event) => {
    const previewDrag = previewDragRef.current;
    if (!previewDrag || previewDrag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    previewDragRef.current = null;
    setPreviewPan(previewPanRef.current);
    setPreviewDragging(false);
  };
  return h(
    "section",
    { className: "school-view", "aria-label": "School memos" },
    h(
      "div",
      { className: "school-note-list" },
      notes.map((note) =>
        h(
          "article",
          {
            className: `school-note ${note.open ? "" : "collapsed"} ${dragNoteId === note.id ? "dragging" : ""}`,
            draggable: true,
            key: note.id,
            "data-color": note.color || "cream",
            onClick: (event) => {
              if (dragJustEndedRef.current) {
                dragJustEndedRef.current = false;
                return;
              }
              if (panelClickIsInteractive(event.target)) return;
              toggleSchoolNote(note.id);
            },
            onDragStart: (event) => {
              if (panelClickIsInteractive(event.target)) {
                event.preventDefault();
                return;
              }
              dragJustEndedRef.current = true;
              setDragNoteId(note.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/school-note", note.id);
            },
            onDragOver: (event) => {
              if (!dragNoteId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            },
            onDrop: (event) => {
              const fromId = event.dataTransfer.getData("text/school-note") || dragNoteId;
              if (!fromId) return;
              event.preventDefault();
              moveSchoolNote(fromId, note.id);
              setDragNoteId("");
            },
            onDragEnd: () => {
              setDragNoteId("");
              window.setTimeout(() => {
                dragJustEndedRef.current = false;
              }, 120);
            },
          },
          h(
            "div",
            { className: "school-note-heading" },
            h("textarea", {
              value: note.title,
              "aria-label": "School memo title",
              rows: Math.min(4, Math.max(1, String(note.title || "").split("\n").reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 24)), 0))),
              onChange: (event) => updateSchoolNote(note.id, "title", event.target.value),
              onKeyDown: (event) => {
                event.stopPropagation();
                if (event.key === "Enter") event.currentTarget.blur();
              },
            }),
            h(
              "div",
              { className: "school-note-actions" },
              h(
                "div",
                { className: "school-color-picker" },
                h(
                  "button",
                  {
                    className: "school-color-button",
                    type: "button",
                    title: "Choose memo color",
                    "aria-label": "Choose memo color",
                    "aria-expanded": openColorNoteId === note.id,
                    onClick: (event) => {
                      event.stopPropagation();
                      setOpenColorNoteId((current) => (current === note.id ? "" : note.id));
                    },
                  },
                  h("span", { className: "school-color-icon", "aria-hidden": "true" }),
                ),
                openColorNoteId === note.id
                  ? h(
                      "div",
                      { className: "school-color-menu", role: "menu", "aria-label": "Memo colors" },
                      schoolNoteColors.map((color) =>
                        h("button", {
                          className: `school-color-swatch ${note.color === color ? "active" : ""}`,
                          key: color,
                          type: "button",
                          title: color,
                          "aria-label": `Use ${color} memo color`,
                          "data-color": color,
                          onClick: (event) => {
                            event.stopPropagation();
                            updateSchoolNote(note.id, "color", color);
                            setOpenColorNoteId("");
                          },
                        }),
                      ),
                    )
                  : null,
              ),
              h("button", { className: "school-delete-note", type: "button", disabled: notes.length <= 1, title: "Delete memo", "aria-label": "Delete memo", onClick: () => removeSchoolNote(note.id) }, "\u00d7"),
            ),
          ),
          h("button", {
            className: `school-note-toggle-tab ${note.open ? "open" : ""}`,
            type: "button",
            title: note.open ? "Close memo" : "Open memo",
            "aria-label": note.open ? "Close memo" : "Open memo",
            onClick: (event) => {
              event.stopPropagation();
              toggleSchoolNote(note.id);
            },
          }),
          note.open
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "school-note-image-panel no-panel-toggle" },
                  (note.images || []).some((image) => noteImageUrls[image.id])
                    ? h(
                        "div",
                        { className: "school-note-image-grid" },
                        (note.images || [])
                          .filter((image) => noteImageUrls[image.id])
                          .map((image) =>
                            h(
                              "figure",
                              { className: "school-note-image-preview", key: image.id },
                              h(
                                "button",
                                {
                                  className: "school-note-image-thumb",
                                  type: "button",
                                  onClick: () => openImagePreview({ name: image.name || "Attached image", src: noteImageUrls[image.id] }),
                                },
                                h("img", { alt: image.name || "Attached memo image", src: noteImageUrls[image.id] }),
                              ),
                              h("figcaption", null, image.name || "Attached image"),
                              h("button", { className: "school-image-remove", type: "button", onClick: () => removeMemoImage(note.id, image.id) }, "Remove"),
                            ),
                          ),
                      )
                    : null,
                  h(
                    "div",
                    { className: "school-note-image-tools" },
                    h(
                      "label",
                      { className: "school-image-upload" },
                      h("input", {
                        accept: "image/*",
                        type: "file",
                        multiple: true,
                        onChange: (event) => {
                          if (event.target.files?.length) attachMemoImage(note.id, event.target.files);
                          event.target.value = "";
                        },
                      }),
                      "Add Images",
                    ),
                  ),
                ),
                h("textarea", {
                  className: "school-note-textarea",
                  placeholder: "Write school notes here...",
                  value: note.content,
                  onChange: (event) => updateSchoolNote(note.id, "content", event.target.value),
                  onKeyDown: (event) => event.stopPropagation(),
                }),
              )
            : null,
        ),
      ),
      previewImage
        ? h(
            "div",
            {
              className: "note-image-lightbox",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": previewImage.name,
              onClick: closeImagePreview,
              onWheel: (event) => {
                event.preventDefault();
                setPreviewZoom((current) => clampNumber(current + (event.deltaY < 0 ? 0.12 : -0.12), 0.4, 3));
              },
            },
            h(
              "figure",
              { className: "note-image-lightbox-content", onClick: (event) => event.stopPropagation() },
              h("button", { className: "note-image-lightbox-close", type: "button", "aria-label": "Close image preview", onClick: closeImagePreview }, "\u00d7"),
              h(
                "div",
                {
                  className: `note-image-zoom-stage ${previewDragging ? "dragging" : ""}`,
                  onWheel: (event) => event.preventDefault(),
                  onPointerDown: startPreviewDrag,
                  onPointerMove: movePreviewDrag,
                  onPointerUp: endPreviewDrag,
                  onPointerCancel: endPreviewDrag,
                  onDoubleClick: () => {
                    setPreviewZoom(1);
                    applyPreviewPan({ x: 0, y: 0 });
                    setPreviewPan({ x: 0, y: 0 });
                  },
                },
                h("img", {
                  alt: previewImage.name,
                  draggable: false,
                  ref: previewImageRef,
                  src: previewImage.src,
                  style: {
                    "--preview-pan-x": `${previewPan.x}px`,
                    "--preview-pan-y": `${previewPan.y}px`,
                    transform: `translate3d(var(--preview-pan-x), var(--preview-pan-y), 0) scale(${previewZoom})`,
                  },
                }),
              ),
              h("figcaption", null, `${previewImage.name} · ${Math.round(previewZoom * 100)}%`),
            ),
          )
        : null,
      h("button", { className: "school-add-note", type: "button", onClick: addSchoolNote }, "+ Memo"),
    ),
  );
}

function MindfoldView({ addBlock, addTab, clearMasks, indentBlock, maskSelection, mindfold, moveBlock, moveTab, outdentBlock, permanentlyRemoveTab, redo, removeBlock, removeTab, renameTab, restoreTab, setActiveBlock, setActiveTab, setColumns, toggleMark, undo, updateBlock }) {
  const normalized = normalizeMindfold(mindfold);
  const activeTab = getActiveMindfoldTab(normalized);
  const [dragBlockId, setDragBlockId] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [menuBlockId, setMenuBlockId] = useState("");
  const [editingBlockId, setEditingBlockId] = useState("");
  const [editingTabId, setEditingTabId] = useState("");
  const [editingTabLabel, setEditingTabLabel] = useState("");
  const [dragTabId, setDragTabId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [trashOpen, setTrashOpen] = useState(false);
  const selectionRef = useRef({});
  const pendingFocusRef = useRef(null);
  const pointerDragRef = useRef(null);
  const suppressMenuClickRef = useRef(false);
  const composingBlockIdsRef = useRef(new Set());

  const beginTabRename = (tab) => {
    setEditingTabId(tab.id);
    setEditingTabLabel(tab.label);
  };

  const finishTabRename = () => {
    if (!editingTabId) return;
    renameTab(editingTabId, editingTabLabel);
    setEditingTabId("");
    setEditingTabLabel("");
  };

  useEffect(() => {
    if (!menuBlockId) return undefined;
    const closeMenu = (event) => {
      if (event.target.closest?.(".mindfold-block-menu-wrap")) return;
      setMenuBlockId("");
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [menuBlockId]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = pointerDragRef.current;
      if (!dragState) return;
      const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
      if (!dragState.dragging && distance < 6) return;
      if (!dragState.dragging) {
        dragState.dragging = true;
        suppressMenuClickRef.current = true;
        setDragBlockId(dragState.id);
        setMenuBlockId("");
        document.getSelection()?.removeAllRanges();
        document.body.classList.add("mindfold-pointer-dragging");
      }
      event.preventDefault();
      const pointElement = document.elementFromPoint(event.clientX, event.clientY);
      const columnElement = pointElement?.closest?.("[data-column-layout-id]");
      const targetElement = pointElement?.closest?.("[data-block-id]");
      const targetId = targetElement?.getAttribute("data-block-id") || "";
      const layoutId = columnElement?.getAttribute("data-column-layout-id") || "";
      if (layoutId && (!targetId || targetId === layoutId || targetId === dragState.id)) {
        const column = Number(columnElement.getAttribute("data-column-index")) || 0;
        dragState.target = { id: layoutId, placement: "column", column };
        setDropTarget(dragState.target);
        return;
      }
      if (!targetId || targetId === dragState.id) {
        dragState.target = null;
        setDropTarget(null);
        return;
      }
      const targetBlock = findMindfoldBlock(activeTab.blocks, targetId);
      if (!targetBlock) return;
      const rect = targetElement.getBoundingClientRect();
      const edgeZone = Math.min(12, rect.height * 0.24);
      const placement = event.clientY < rect.top + edgeZone
        ? "before"
        : event.clientY > rect.bottom - edgeZone
          ? "after"
          : targetBlock.toggle && event.clientX > rect.left + 54
            ? "inside"
            : "after";
      dragState.target = { id: targetId, placement };
      setDropTarget(dragState.target);
    };
    const handlePointerUp = () => {
      const dragState = pointerDragRef.current;
      if (!dragState) return;
      if (dragState.dragging && dragState.target) {
        moveBlock(dragState.id, dragState.target.id, dragState.target.placement, dragState.target.column);
      }
      if (dragState.sourceElement?.hasPointerCapture?.(dragState.pointerId)) {
        dragState.sourceElement.releasePointerCapture(dragState.pointerId);
      }
      document.body.classList.remove("mindfold-pointer-dragging");
      pointerDragRef.current = null;
      setDragBlockId("");
      setDropTarget(null);
      window.setTimeout(() => {
        suppressMenuClickRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.classList.remove("mindfold-pointer-dragging");
    };
  }, [activeTab.blocks, moveBlock]);

  const beginPointerDrag = (event, id) => {
    if (event.button !== 0 || menuBlockId) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerDragRef.current = {
      id,
      pointerId: event.pointerId,
      sourceElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      target: null,
    };
  };

  useEffect(() => {
    if (!editingBlockId) return;
    const pending = pendingFocusRef.current;
    const field = document.querySelector(`[data-block-id="${editingBlockId}"] .mindfold-rich-editor`);
    if (!field) return;
    field.focus();
    const caret = pending?.id === editingBlockId ? pending.caret : field.textContent.length;
    setMindfoldEditableSelection(field, caret ?? field.textContent.length);
    pendingFocusRef.current = null;
  }, [editingBlockId]);

  const focusBlock = (id, caret = null) => {
    pendingFocusRef.current = { id, caret };
    setEditingBlockId(id);
    setActiveBlock(id);
  };

  const flattenBlocks = (blocks, result = []) => {
    blocks.forEach((block) => {
      result.push(block);
      if (!block.toggle || block.open) flattenBlocks(block.children || [], result);
    });
    return result;
  };

  const focusAdjacentBlock = (id, direction) => {
    const visibleBlocks = flattenBlocks(activeTab.blocks);
    const currentIndex = visibleBlocks.findIndex((item) => item.id === id);
    const target = visibleBlocks[currentIndex + direction];
    if (!target) return false;
    focusBlock(target.id, direction < 0 ? target.text.length : 0);
    return true;
  };

  const reorderBlockWithKeyboard = (id, direction) => {
    const visibleBlocks = flattenBlocks(activeTab.blocks);
    const currentIndex = visibleBlocks.findIndex((item) => item.id === id);
    const target = visibleBlocks[currentIndex + direction];
    if (!target) return false;
    moveBlock(id, target.id, direction < 0 ? "before" : "after");
    window.requestAnimationFrame(() => focusBlock(id));
    return true;
  };

  const handleMindfoldHistoryShortcut = (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (!modifier || event.altKey || (key !== "z" && key !== "y")) return;
    event.preventDefault();
    event.stopPropagation();
    const activeEditor = document.activeElement?.classList?.contains("mindfold-rich-editor")
      ? document.activeElement
      : null;
    const activeId = activeEditor?.closest?.("[data-block-id]")?.getAttribute("data-block-id") || "";
    const restored = key === "y" || event.shiftKey ? redo() : undo();
    if (!restored || !activeId) return;
    window.requestAnimationFrame(() => {
      const field = document.querySelector(`[data-block-id="${activeId}"] .mindfold-rich-editor`);
      if (field) {
        field.focus();
        setMindfoldEditableSelection(field, field.textContent.length);
      }
    });
  };

  const renderRichEditor = (block) => {
    const masks = normalizeMindfoldMasks(block.masks, block.text.length);
    const marks = normalizeMindfoldMarks(block.marks, block.text.length);
    const boundaries = [...new Set([
      0,
      block.text.length,
      ...masks.flatMap((mask) => [mask.start, mask.end]),
      ...marks.flatMap((mark) => [mark.start, mark.end]),
    ])].sort((a, b) => a - b);
    const parts = boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1];
      if (end <= start) return null;
      const isMasked = masks.some((mask) => mask.start <= start && mask.end >= end);
      const activeMarks = marks.filter((mark) => mark.start <= start && mark.end >= end).map((mark) => mark.type);
      const className = [
        isMasked ? "mindfold-mask" : "",
        activeMarks.includes("bold") ? "mindfold-inline-bold" : "",
        activeMarks.includes("italic") ? "mindfold-inline-italic" : "",
      ].filter(Boolean).join(" ");
      return h("span", {
        className: className || undefined,
        key: `${start}-${end}`,
      }, block.text.slice(start, end));
    }).filter(Boolean);
    return h(
      "div",
      {
        key: `editor-${block.id}-${block.text}-${masks.map((mask) => `${mask.start}:${mask.end}`).join(".")}-${marks.map((mark) => `${mark.type}:${mark.start}:${mark.end}`).join(".")}`,
        className: "mindfold-rich-editor",
        contentEditable: "plaintext-only",
        suppressContentEditableWarning: true,
        role: "textbox",
        tabIndex: 0,
        "aria-label": "Mindfold block text",
        "data-placeholder": block.toggle ? "토글 제목" : "내용 입력...",
        onFocus: () => {
          setEditingBlockId(block.id);
          setActiveBlock(block.id);
        },
        onBlur: () => window.setTimeout(() => {
          if (menuBlockId !== block.id) setEditingBlockId((current) => (current === block.id ? "" : current));
        }, 80),
        onMouseUp: (event) => {
          selectionRef.current[block.id] = getMindfoldEditableSelection(event.currentTarget);
        },
        onKeyUp: (event) => {
          selectionRef.current[block.id] = getMindfoldEditableSelection(event.currentTarget);
        },
        onCompositionStart: () => {
          composingBlockIdsRef.current.add(block.id);
        },
        onCompositionEnd: (event) => {
          composingBlockIdsRef.current.delete(block.id);
          const field = event.currentTarget;
          const selection = getMindfoldEditableSelection(field);
          const value = field.textContent.replace(/\u00a0/g, " ").replace(/\r?\n/g, " ");
          selectionRef.current[block.id] = selection;
          updateBlock(block.id, { text: value });
        },
        onInput: (event) => {
          if (event.nativeEvent.isComposing || composingBlockIdsRef.current.has(block.id)) return;
          const field = event.currentTarget;
          const selection = getMindfoldEditableSelection(field);
          const value = field.textContent.replace(/\u00a0/g, " ").replace(/\r?\n/g, " ");
          let patch = { text: value };
          let caret = selection.end;
          const headingMatch = value.match(/^(#{1,4}) (.*)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            patch = { type: `heading-${level}`, text: headingMatch[2] };
            caret = Math.max(0, caret - level - 1);
          } else {
            const bulletMatch = value.match(/^([-*+]) (.*)$/);
            if (bulletMatch) {
              patch = { type: "bullet", text: bulletMatch[2] };
              caret = Math.max(0, caret - 2);
            } else if (value === "> ") {
              patch = { type: "quote", text: "" };
            } else {
              const boldMatch = value.match(/^(.*)\*\*([^*]+)\*\*(.*)$/);
              const italicMatch = !boldMatch ? value.match(/^(.*)_([^_]+)_(.*)$/) : null;
              if (boldMatch) {
                const nextText = `${boldMatch[1]}${boldMatch[2]}${boldMatch[3]}`;
                patch = {
                  text: nextText,
                  addMark: { type: "bold", start: boldMatch[1].length, end: boldMatch[1].length + boldMatch[2].length },
                };
                caret = Math.max(boldMatch[1].length, caret - 4);
              } else if (italicMatch) {
                const nextText = `${italicMatch[1]}${italicMatch[2]}${italicMatch[3]}`;
                patch = {
                  text: nextText,
                  addMark: { type: "italic", start: italicMatch[1].length, end: italicMatch[1].length + italicMatch[2].length },
                };
                caret = Math.max(italicMatch[1].length, caret - 2);
              }
            }
          }
          if (patch.text === "") caret = 0;
          selectionRef.current[block.id] = { start: caret, end: caret };
          updateBlock(block.id, patch);
          window.requestAnimationFrame(() => {
            const nextField = document.querySelector(`[data-block-id="${block.id}"] .mindfold-rich-editor`);
            if (nextField) {
              nextField.focus();
              setMindfoldEditableSelection(nextField, caret);
            }
          });
        },
        onKeyDown: (event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          const modifier = event.ctrlKey || event.metaKey;
          const selection = getMindfoldEditableSelection(event.currentTarget);
          const selectionStart = selection.start;
          const selectionEnd = selection.end;
          const selectedStart = selectionStart === selectionEnd ? 0 : selectionStart;
          const selectedEnd = selectionStart === selectionEnd ? block.text.length : selectionEnd;

          if (modifier && !event.altKey && ["b", "i"].includes(event.key.toLowerCase())) {
            event.preventDefault();
            if (selectedEnd > selectedStart) {
              toggleMark(block.id, event.key.toLowerCase() === "b" ? "bold" : "italic", selectedStart, selectedEnd);
              window.requestAnimationFrame(() => {
                const field = document.querySelector(`[data-block-id="${block.id}"] .mindfold-rich-editor`);
                if (field) {
                  field.focus();
                  setMindfoldEditableSelection(field, selectionStart, selectionEnd);
                }
              });
            }
            return;
          }
          if (modifier && event.altKey && /^[0-4]$/.test(event.key)) {
            event.preventDefault();
            updateBlock(block.id, { type: event.key === "0" ? "text" : `heading-${event.key}` });
            return;
          }
          if (modifier && event.shiftKey && event.code === "Digit8") {
            event.preventDefault();
            updateBlock(block.id, { type: "bullet" });
            return;
          }
          if (modifier && event.shiftKey && event.key === "ArrowUp") {
            event.preventDefault();
            reorderBlockWithKeyboard(block.id, -1);
            return;
          }
          if (modifier && event.shiftKey && event.key === "ArrowDown") {
            event.preventDefault();
            reorderBlockWithKeyboard(block.id, 1);
            return;
          }
          if (!modifier && !event.altKey && !event.shiftKey && event.key === "ArrowUp" && selectionStart === 0 && selectionEnd === 0) {
            if (focusAdjacentBlock(block.id, -1)) event.preventDefault();
            return;
          }
          if (!modifier && !event.altKey && !event.shiftKey && event.key === "ArrowDown" && selectionStart === block.text.length && selectionEnd === block.text.length) {
            if (focusAdjacentBlock(block.id, 1)) event.preventDefault();
            return;
          }
          if (event.key === "/" && !block.text) {
            event.preventDefault();
            setMenuBlockId(block.id);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const left = block.text.slice(0, selectionStart);
            const right = block.text.slice(selectionEnd);
            const location = findMindfoldBlockLocation(activeTab.blocks, block.id);
            updateBlock(block.id, { text: left });
            if (block.columns > 1) {
              addAndFocus({ parentId: block.id, afterId: block.id, text: right, caret: 0, column: 0 });
            } else if (location?.parent?.columns > 1) {
              addAndFocus({
                parentId: location.parent.id,
                afterId: block.id,
                text: right,
                caret: 0,
                column: Number.isInteger(block.column) ? block.column : 0,
              });
            } else {
              addAndFocus({ afterId: block.id, text: right, caret: 0 });
            }
            return;
          }
          if (event.key === "Tab") {
            event.preventDefault();
            if (event.shiftKey) outdentBlock(block.id);
            else indentBlock(block.id);
            return;
          }
          if (event.key === "Backspace" && !block.text) {
            const visibleBlocks = flattenBlocks(activeTab.blocks);
            const blockIndex = visibleBlocks.findIndex((item) => item.id === block.id);
            const location = findMindfoldBlockLocation(activeTab.blocks, block.id);
            if (location?.parent?.columns > 1) {
              event.preventDefault();
              const previous = visibleBlocks[Math.max(0, blockIndex - 1)] || location.parent;
              setColumns(block.id, 1, block.id);
              window.requestAnimationFrame(() => focusBlock(previous.id, previous.text.length));
              return;
            }
            if (block.columns > 1) {
              event.preventDefault();
              setColumns(block.id, 1);
              window.requestAnimationFrame(() => focusBlock(block.id, 0));
              return;
            }
            if (blockIndex > 0) {
              event.preventDefault();
              const previous = visibleBlocks[blockIndex - 1];
              removeBlock(block.id);
              window.requestAnimationFrame(() => focusBlock(previous.id, previous.text.length));
            }
            return;
          }
          if (event.key === "Escape") {
            event.currentTarget.blur();
            setMenuBlockId("");
          }
        },
      },
      ...parts,
    );
  };

  const addAndFocus = ({ parentId = "", afterId = "", type = "text", text = "", caret = 0, column = null } = {}) => {
    const nextId = addBlock(parentId, afterId, type, text, column);
    window.requestAnimationFrame(() => focusBlock(nextId, caret));
    return nextId;
  };

  const renderMenu = (block, location) => {
    const selection = selectionRef.current[block.id];
    const hasSelection = selection && selection.end > selection.start;
    const inheritedColumns = location.parent?.columns > 1 && Number.isInteger(block.column)
      ? location.parent.columns
      : 1;
    const activeColumns = block.columns > 1 ? block.columns : inheritedColumns;
    return h(
      "div",
      { className: "mindfold-block-menu", role: "menu", onPointerDown: (event) => event.stopPropagation() },
      h("p", { className: "mindfold-menu-label" }, "블록 유형"),
      h(
        "div",
        { className: "mindfold-type-grid" },
        ...mindfoldBlockTypeOptions.map((option) =>
          h(
            "button",
            {
              className: `mindfold-type-option ${block.type === option.type ? "active" : ""}`,
              type: "button",
              role: "menuitem",
              key: option.type,
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => {
                updateBlock(block.id, { type: option.type });
                setMenuBlockId("");
              },
            },
            h("span", { "aria-hidden": "true" }, option.icon),
            option.label,
          ),
        ),
      ),
      h("div", { className: "mindfold-menu-divider" }),
      h("p", { className: "mindfold-menu-label mindfold-columns-label" }, "열 나누기"),
      h(
        "div",
        { className: "mindfold-columns-grid", role: "group", "aria-label": "열 나누기" },
        ...[2, 3, 4].map((columns) =>
          h("button", {
            className: `mindfold-columns-option ${activeColumns === columns ? "active" : ""}`,
            type: "button",
            role: "menuitem",
            key: columns,
            "aria-pressed": activeColumns === columns,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => {
              setColumns(block.id, columns);
              setMenuBlockId("");
            },
          }, h("span", { "aria-hidden": "true" }, columns), `${columns}열`),
        ),
      ),
      block.columns > 1 || inheritedColumns > 1
        ? h("button", {
            className: "mindfold-columns-reset",
            type: "button",
            role: "menuitem",
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => {
              setColumns(block.id, 1);
              setMenuBlockId("");
            },
          }, h("span", { "aria-hidden": "true" }, "1"), "여기서부터 1열")
        : null,
      h("button", {
        className: `mindfold-toggle-option ${block.toggle ? "active" : ""}`,
        type: "button",
        role: "menuitem",
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => {
          updateBlock(block.id, { toggle: !block.toggle, open: true });
          setMenuBlockId("");
        },
      }, h("span", { "aria-hidden": "true" }, "\u25b8"), block.toggle ? "토글 해제" : "토글로 전환"),
      h("div", { className: "mindfold-menu-divider" }),
      h("p", { className: "mindfold-menu-label mindfold-color-label" }, "글자 색상"),
      h(
        "div",
        { className: "mindfold-color-grid", role: "group", "aria-label": "글자 색상" },
        ...mindfoldTextColorOptions.map((option) =>
          h("button", {
            className: `mindfold-color-option ${block.color === option.id ? "active" : ""}`,
            type: "button",
            role: "menuitem",
            key: option.id,
            title: option.label,
            "aria-label": option.label,
            "aria-pressed": block.color === option.id,
            style: { "--mindfold-swatch": mindfoldTextColors[option.id] },
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => {
              updateBlock(block.id, { color: option.id });
              setMenuBlockId("");
            },
          }),
        ),
      ),
      h("div", { className: "mindfold-menu-divider" }),
      h("p", { className: "mindfold-menu-label mindfold-format-label" }, "글자 서식"),
      h(
        "div",
        { className: "mindfold-format-grid", role: "group", "aria-label": "글자 서식" },
        h("button", {
          className: `mindfold-format-option ${hasSelection && mindfoldSelectionHasMark(block.marks, "bold", selection.start, selection.end) ? "active" : ""}`,
          type: "button",
          role: "menuitem",
          disabled: !hasSelection,
          title: "굵게 (Ctrl+B)",
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => {
            if (hasSelection) toggleMark(block.id, "bold", selection.start, selection.end);
            setMenuBlockId("");
          },
        }, h("span", { "aria-hidden": "true" }, "B"), "굵게"),
        h("button", {
          className: `mindfold-format-option ${hasSelection && mindfoldSelectionHasMark(block.marks, "italic", selection.start, selection.end) ? "active" : ""}`,
          type: "button",
          role: "menuitem",
          disabled: !hasSelection,
          title: "기울임 (Ctrl+I)",
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => {
            if (hasSelection) toggleMark(block.id, "italic", selection.start, selection.end);
            setMenuBlockId("");
          },
        }, h("span", { "aria-hidden": "true" }, "I"), "기울임"),
      ),
      h("div", { className: "mindfold-menu-divider" }),
      h("button", { type: "button", role: "menuitem", disabled: !hasSelection, onMouseDown: (event) => event.preventDefault(), onClick: () => {
        if (hasSelection) maskSelection(block.id, selection.start, selection.end);
        setMenuBlockId("");
      } }, h("span", { "aria-hidden": "true" }, "\u25a0"), "선택 영역 가리기"),
      block.masks.length
        ? h("button", { type: "button", role: "menuitem", onMouseDown: (event) => event.preventDefault(), onClick: () => {
            clearMasks(block.id);
            setMenuBlockId("");
          } }, h("span", { "aria-hidden": "true" }, "\u25a1"), "마스킹 모두 해제")
        : null,
      h("button", { type: "button", role: "menuitem", onClick: () => {
        setMenuBlockId("");
        addAndFocus({ afterId: block.id });
      } }, h("span", { "aria-hidden": "true" }, "+"), "아래에 블록 추가"),
      h("button", { type: "button", role: "menuitem", onClick: () => {
        updateBlock(block.id, { toggle: true, open: true });
        setMenuBlockId("");
        addAndFocus({ parentId: block.id });
      } }, h("span", { "aria-hidden": "true" }, "\u21b3"), "안쪽에 블록 추가"),
      h("button", { type: "button", role: "menuitem", disabled: location.index <= 0, onClick: () => {
        indentBlock(block.id);
        setMenuBlockId("");
      } }, h("span", { "aria-hidden": "true" }, "\u2192"), "들여쓰기"),
      h("button", { type: "button", role: "menuitem", disabled: !location.parent, onClick: () => {
        outdentBlock(block.id);
        setMenuBlockId("");
      } }, h("span", { "aria-hidden": "true" }, "\u2190"), "내어쓰기"),
      h("div", { className: "mindfold-menu-divider" }),
      h("button", { className: "danger", type: "button", role: "menuitem", onClick: () => {
        removeBlock(block.id);
        setMenuBlockId("");
      } }, h("span", { "aria-hidden": "true" }, "\u00d7"), "블록 삭제"),
    );
  };

  const renderBlock = (block, depth = 0, layoutColumn = null) => {
    const location = findMindfoldBlockLocation(activeTab.blocks, block.id);
    const isEditing = editingBlockId === block.id;
    const isMenuOpen = menuBlockId === block.id;
    const dropClass = dropTarget?.id === block.id ? `drop-${dropTarget.placement}` : "";
    const childrenVisible = !block.toggle || block.open;
    const visibleChildren = (block.children || []).filter((child) => (
      block.columns > 1 && Number.isInteger(child.column)
        ? true
        : childrenVisible
    ));
    const blockRow = h(
      "div",
      { className: "mindfold-block-row" },
      h(
        "div",
        { className: "mindfold-block-menu-wrap" },
        h("button", {
          className: `mindfold-block-menu-trigger ${isMenuOpen ? "active" : ""}`,
          type: "button",
          title: "블록 메뉴",
          "aria-label": "블록 메뉴",
          "aria-expanded": isMenuOpen,
          onPointerDown: (event) => beginPointerDrag(event, block.id),
          onMouseDown: (event) => {
            const activeField = document.activeElement;
            if (activeField?.classList?.contains("mindfold-rich-editor") && activeField.closest?.("[data-block-id]")?.getAttribute("data-block-id") === block.id) {
              selectionRef.current[block.id] = getMindfoldEditableSelection(activeField);
            }
          },
          onClick: (event) => {
            if (suppressMenuClickRef.current) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.stopPropagation();
            setMenuBlockId((current) => (current === block.id ? "" : block.id));
          },
        }, h("span", { className: "mindfold-menu-glyph", "aria-hidden": "true" })),
        isMenuOpen ? renderMenu(block, location) : null,
      ),
      block.toggle
        ? h("button", {
            className: `mindfold-notion-toggle ${block.open ? "open" : ""}`,
            type: "button",
            title: block.open ? "Collapse" : "Expand",
            "aria-label": block.open ? "Collapse" : "Expand",
            onClick: () => updateBlock(block.id, { open: !block.open }),
          })
        : block.type === "callout"
          ? h("button", {
              className: "mindfold-check-control",
              type: "button",
              title: block.checked ? "완료 취소" : "완료로 표시",
              "aria-label": block.checked ? "완료 취소" : "완료로 표시",
              "aria-pressed": block.checked,
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => updateBlock(block.id, { checked: !block.checked }),
            }, h("span", { "aria-hidden": "true" }))
          : h("span", { className: "mindfold-type-mark", "aria-hidden": "true" }, block.type === "bullet" ? "\u2022" : block.type === "quote" ? "\u201c" : ""),
      h(
        "div",
        { className: `mindfold-block-editor ${isEditing ? "editing" : ""}` },
        renderRichEditor(block),
      ),
    );
    const columnBlocks = visibleChildren.filter((child) => Number.isInteger(child.column));
    const nestedBlocks = visibleChildren.filter((child) => !Number.isInteger(child.column));
    const renderColumnTrack = (column) => h(
      "div",
      {
        className: `mindfold-column-track ${dropTarget?.id === block.id && dropTarget.placement === "column" && dropTarget.column === column ? "drop-target" : ""}`,
        key: `column-track-${block.id}-${column}`,
        "data-column-layout-id": block.id,
        "data-column-index": column,
      },
      column === 0 ? blockRow : null,
      column === 0 && nestedBlocks.length
        ? h(
            "div",
            {
              className: `mindfold-block-children ${dropTarget?.id === block.id && dropTarget.placement === "inside" ? "drop-target" : ""}`,
            },
            ...nestedBlocks.map((child) => renderBlock(child, depth + 1)),
          )
        : null,
      ...columnBlocks
        .filter((child) => child.column === column)
        .map((child) => renderBlock(child, depth + 1)),
    );
    return h(
      "article",
      {
        className: `mindfold-notion-block type-${block.type} ${block.toggle ? "is-toggle" : ""} ${block.columns > 1 ? `is-columns columns-${block.columns}` : ""} ${layoutColumn != null ? "is-column-item" : ""} ${block.checked ? "is-checked" : ""} ${isMenuOpen ? "menu-open" : ""} ${dragBlockId === block.id ? "dragging" : ""} ${dropClass}`,
        draggable: false,
        key: block.id,
        "data-block-id": block.id,
        style: {
          "--mindfold-depth": depth,
          "--mindfold-text-color": mindfoldTextColors[block.color],
          "--mindfold-columns": block.columns,
          "--mindfold-column": layoutColumn == null ? undefined : layoutColumn + 1,
        },
        onPointerDownCapture: (event) => {
          const button = event.target.closest?.("button");
          if (button) return;
          if (event.target.closest?.(".mindfold-block-menu")) return;
          beginPointerDrag(event, block.id);
        },
      },
      ...(block.columns > 1
        ? Array.from({ length: block.columns }, (_, column) => renderColumnTrack(column))
        : [blockRow]),
      block.columns === 1 && visibleChildren.length
        ? h(
            "div",
            {
              className: `mindfold-block-children ${dropTarget?.id === block.id && dropTarget.placement === "inside" ? "drop-target" : ""}`,
            },
            ...visibleChildren.map((child) => renderBlock(
              child,
              depth + 1,
            )),
          )
        : null,
      block.toggle && block.open && block.columns === 1
        ? h("button", { className: "mindfold-add-child", type: "button", onClick: () => addAndFocus({ parentId: block.id }) }, "+ 안쪽에 블록 추가")
        : null,
    );
  };

  return h(
    "section",
    {
      className: `mindfold-view mindfold-document-view mindfold-notion-view ${menuBlockId ? "menu-open" : ""}`,
      "aria-label": "Mindfold workspace",
      onKeyDownCapture: handleMindfoldHistoryShortcut,
    },
    h(
      "div",
      { className: `mindfold-workspace ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}` },
      h(
        "aside",
        { className: "mindfold-page-sidebar", "aria-label": "마인드폴드 페이지 메뉴", "aria-hidden": !sidebarOpen },
        h(
          "div",
          { className: "mindfold-sidebar-head" },
          h("strong", null, "페이지"),
          h("button", {
            className: "mindfold-sidebar-toggle",
            type: "button",
            title: "사이드바 닫기",
            "aria-label": "사이드바 닫기",
            onClick: () => setSidebarOpen(false),
          }, h("span", { className: "mindfold-sidebar-glyph", "aria-hidden": "true" })),
        ),
        h(
          "div",
          { className: "mindfold-tabs", role: "tablist", "aria-label": "마인드폴드 페이지" },
          ...normalized.tabs.map((tab) =>
            h(
              "div",
              {
                className: `mindfold-tab-item ${tab.id === activeTab.id ? "active" : ""} ${dragTabId === tab.id ? "dragging" : ""}`,
                draggable: editingTabId !== tab.id,
                key: tab.id,
                onDragStart: (event) => {
                  setDragTabId(tab.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/mindfold-tab", tab.id);
                },
                onDragOver: (event) => {
                  if (!dragTabId || dragTabId === tab.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                },
                onDrop: (event) => {
                  event.preventDefault();
                  const fromId = event.dataTransfer.getData("text/mindfold-tab") || dragTabId;
                  moveTab(fromId, tab.id);
                  setDragTabId("");
                },
                onDragEnd: () => setDragTabId(""),
              },
              editingTabId === tab.id
                ? h("input", {
                    className: "mindfold-tab-input",
                    value: editingTabLabel,
                    maxLength: 28,
                    autoFocus: true,
                    "aria-label": "탭 이름",
                    onChange: (event) => setEditingTabLabel(event.target.value),
                    onBlur: finishTabRename,
                    onKeyDown: (event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        setEditingTabId("");
                        setEditingTabLabel("");
                      }
                    },
                  })
                : h("button", {
                    className: "mindfold-tab-button",
                    type: "button",
                    role: "tab",
                    "aria-selected": tab.id === activeTab.id,
                    onClick: () => {
                      setActiveTab(tab.id);
                      setEditingBlockId("");
                      setMenuBlockId("");
                      if (window.innerWidth <= 760) setSidebarOpen(false);
                    },
                  }, tab.label),
              editingTabId !== tab.id
                ? h(
                    "div",
                    { className: "mindfold-tab-actions" },
                    h("button", {
                      type: "button",
                      title: "페이지 이름 수정",
                      "aria-label": `${tab.label} 이름 수정`,
                      onClick: (event) => {
                        event.stopPropagation();
                        beginTabRename(tab);
                      },
                    }, "수정"),
                    h("button", {
                      className: "danger",
                      type: "button",
                      title: "휴지통으로 이동",
                      "aria-label": `${tab.label} 삭제`,
                      disabled: normalized.tabs.length <= 1,
                      onClick: (event) => {
                        event.stopPropagation();
                        removeTab(tab.id);
                      },
                    }, "삭제"),
                  )
                : null,
            ),
          ),
        ),
        h(
          "div",
          { className: "mindfold-tab-tools" },
          h("button", { type: "button", onClick: () => {
            const nextId = addTab();
            setEditingTabId(nextId);
            setEditingTabLabel(`페이지 ${normalized.tabs.length + 1}`);
          } }, "+ 페이지 추가"),
        ),
        h(
          "div",
          { className: `mindfold-trash ${trashOpen ? "open" : ""}` },
          h("button", {
            className: "mindfold-trash-toggle",
            type: "button",
            "aria-expanded": trashOpen,
            onClick: () => setTrashOpen((current) => !current),
          }, h("span", null, "휴지통"), h("small", null, normalized.trash.length)),
          trashOpen
            ? h(
                "div",
                { className: "mindfold-trash-list" },
                normalized.trash.length
                  ? normalized.trash.map((tab) => {
                      const remainingDays = Math.max(1, Math.ceil((mindfoldTrashRetentionMs - (Date.now() - Date.parse(tab.deletedAt))) / (24 * 60 * 60 * 1000)));
                      return h(
                        "div",
                        { className: "mindfold-trash-item", key: tab.id },
                        h("div", null, h("span", null, tab.label), h("small", null, `${remainingDays}일 후 삭제`)),
                        h("div", { className: "mindfold-trash-actions" },
                          h("button", { type: "button", onClick: () => restoreTab(tab.id) }, "복원"),
                          h("button", { className: "danger", type: "button", onClick: () => permanentlyRemoveTab(tab.id) }, "영구 삭제"),
                        ),
                      );
                    })
                  : h("p", null, "휴지통이 비어 있습니다."),
              )
            : null,
        ),
      ),
      sidebarOpen
        ? h("button", { className: "mindfold-sidebar-backdrop", type: "button", "aria-label": "사이드바 닫기", onClick: () => setSidebarOpen(false) })
        : h("button", {
            className: "mindfold-sidebar-toggle mindfold-sidebar-open-button",
            type: "button",
            title: "사이드바 열기",
            "aria-label": "사이드바 열기",
            onClick: () => setSidebarOpen(true),
          }, h("span", { className: "mindfold-sidebar-glyph", "aria-hidden": "true" })),
      h(
        "article",
        { className: "mindfold-editor" },
        h("div", { className: "mindfold-document mindfold-block-tree" }, ...activeTab.blocks.map((block) => renderBlock(block))),
      ),
    ),
  );
}

function Topbar({ activeView, selectedDate, settingsPanels, setActiveView, setSelectedDate, shiftDate }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const viewLabels = {
    dashboard: "DASH BOARD",
    note: "NOTE",
  };
  const viewLabel = viewLabels[activeView] || "DASH BOARD";
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeSettings = (event) => {
      if (settingsRef.current?.contains(event.target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("click", closeSettings);
    return () => document.removeEventListener("click", closeSettings);
  }, [settingsOpen]);
  return h(
    "section",
    { className: "topbar", "aria-label": "Date selector", "data-view-label": viewLabel },
    h("div", null, h("p", { className: "eyebrow" }, viewLabel), h("h1", null, formatDayLabel(selectedDate))),
    h(
      "div",
      { className: "topbar-controls" },
      h(
        "div",
        { className: "settings-menu", ref: settingsRef },
        h(
          "button",
          {
            className: "settings-button",
            type: "button",
            title: "Settings",
            "aria-label": "Settings",
            "aria-expanded": settingsOpen,
            onClick: (event) => {
              event.stopPropagation();
              setSettingsOpen((current) => !current);
            },
          },
          "⚙",
        ),
        settingsOpen
          ? h(
              "div",
              { className: "settings-popover", onClick: (event) => event.stopPropagation() },
              settingsPanels,
            )
          : null,
      ),
      h(
        "div",
        { className: "day-switcher" },
        h("button", { className: "icon-button", type: "button", title: "Previous day", "aria-label": "Previous day", onClick: () => shiftDate(-1) }, "\u2039"),
        h("input", { type: "date", value: selectedDate, "aria-label": "Record date", onChange: (event) => setSelectedDate(event.target.value || toDateKey(new Date())) }),
        h("button", { className: "icon-button", type: "button", title: "Next day", "aria-label": "Next day", onClick: () => shiftDate(1) }, "\u203a"),
      ),
      h(AppNavigation, { activeView, setActiveView }),
    ),
  );
}

function VaultView({ settingsPanels }) {
  return h(
    "section",
    { className: "vault-view", "aria-label": "Vault" },
    h(
      "div",
      { className: "vault-heading" },
      h("div", null, h("p", { className: "eyebrow" }, "HUB VAULT"), h("h1", null, "Storage & Security")),
      h("p", null, "Sync, backup, import, and device security for Dash Board, Note, and Mindfold."),
    ),
    h("div", { className: "vault-grid" }, settingsPanels),
  );
}

function SyncPanel({ forgetThisDevice, isOpen, onConnect, onGenerate, onPull, onPush, onToggle, setSync, sync, syncReady }) {
  return h(CollapsiblePanel, {
    className: "sync-panel",
    controls: "syncBody",
    description: "Connect devices with Sync ID + PIN.",
    isOpen,
    onToggle,
    title: "Sync",
    children: {
      body: h(
        "div",
        { className: "sync-body", id: "syncBody" },
        h(
          "div",
          { className: "sync-grid" },
          h("label", null, h("span", null, "Supabase URL"), h("input", { type: "url", autoComplete: "off", placeholder: "https://project.supabase.co", value: sync.backend.supabaseUrl, onChange: (event) => setSync((current) => ({ ...current, backend: { ...current.backend, supabaseUrl: event.target.value.trim() } })) })),
          h("label", null, h("span", null, "Public Key"), h("input", { type: "password", autoComplete: "off", placeholder: "anon public key", value: sync.backend.supabaseAnonKey, onChange: (event) => setSync((current) => ({ ...current, backend: { ...current.backend, supabaseAnonKey: event.target.value.trim() } })) })),
          h("label", null, h("span", null, "Sync ID"), h("input", { type: "text", autoComplete: "off", placeholder: "Generate or enter Sync ID", value: sync.syncId, onChange: (event) => setSync((current) => ({ ...current, syncId: event.target.value })) })),
          h("label", null, h("span", null, "PIN"), h("input", { type: "password", inputMode: "numeric", autoComplete: "current-password", placeholder: "PIN", value: sync.pin, onChange: (event) => setSync((current) => ({ ...current, pin: event.target.value.trim() })) })),
          h(
            "label",
            { className: "remember-device" },
            h("input", {
              type: "checkbox",
              checked: sync.rememberDevice,
              onChange: (event) =>
                setSync((current) => {
                  if (!event.target.checked) {
                    localStorage.removeItem(SYNC_REMEMBER_KEY);
                    localStorage.removeItem(SYNC_PIN_KEY);
                  }
                  return { ...current, rememberDevice: event.target.checked };
                }),
            }),
            h("span", null, "Remember this device"),
          ),
          h(
            "div",
            { className: "sync-actions" },
            h("button", { className: "text-button", type: "button", onClick: onGenerate }, "Generate"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy, onClick: onConnect }, "Connect"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy || !syncReady, onClick: onPull }, "Pull"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy || !syncReady, onClick: onPush }, "Push"),
            h("button", { className: "text-button danger", type: "button", onClick: forgetThisDevice }, "Forget This Device"),
          ),
        ),
        h("p", { className: "sync-status" }, sync.status),
      ),
    },
  });
}

function SystemPanel({ copyBackup, exportBackup, importBackup, isOpen, onToggle }) {
  const fileInputRef = useRef(null);
  return h(CollapsiblePanel, {
    className: "system-panel",
    controls: "systemBody",
    description: "Export or restore dashboard data.",
    isOpen,
    onToggle,
    title: "System",
    children: {
      body: h(
        "div",
        { className: "system-body", id: "systemBody" },
        h(
          "button",
          { className: "system-action export-action", type: "button", onClick: exportBackup },
          h("span", null, "Download Data"),
          h("strong", null, "Save data and memo images"),
        ),
        h(
          "button",
          { className: "system-action copy-action", type: "button", onClick: copyBackup },
          h("span", null, "Copy Data"),
          h("strong", null, "Copy data and memo images"),
        ),
        h(
          "button",
          {
            className: "system-action import-action",
            type: "button",
            onClick: () => fileInputRef.current?.click(),
          },
          h("span", null, "Upload Data"),
          h("strong", null, "Restore from a JSON backup"),
        ),
        h("input", {
          ref: fileInputRef,
          type: "file",
          accept: "application/json,.json",
          className: "backup-file-input",
          onChange: (event) => {
            importBackup(event.target.files?.[0]);
            event.target.value = "";
          },
        }),
      ),
    },
  });
}

function SchedulePanel({ calendar, calendarDuties, selectedDate }) {
  const weekStart = getWeekStart(selectedDate);
  const weeks = [0, 7].map((offset) => Array.from({ length: 7 }, (_, index) => addDays(weekStart, offset + index)));
  return h(
    "section",
    { className: "schedule-panel two-week-schedule", "aria-label": "Two-week schedule" },
    h("div", { className: "section-heading" }, h("div", null, h("h2", null, "Today's Schedule"))),
    h(
      "div",
      { className: "schedule-weeks" },
      weeks.map((week, weekIndex) =>
        h(
          "div",
          { className: "schedule-week", key: `week-${weekIndex}` },
          h("div", { className: "schedule-week-title" }, weekIndex === 0 ? "This Week" : "Next Week"),
          h(
            "div",
            { className: "schedule-week-scroll" },
            h("div", { className: "schedule-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label))),
            h(
              "div",
              { className: "schedule-week-grid" },
          week.map((dateKey) => {
            const schedule = calendar[dateKey]?.trim() || "";
            const dutyItems = calendarDutyOptions
              .filter((option) => calendarDuties?.[dateKey]?.[option.key])
              .map((option) => ({ type: "duty", label: option.label }));
            const lines = schedule.split(/\n+/).filter(Boolean).map((line) => ({ type: "note", label: line }));
            const items = [...dutyItems, ...lines];
            const dateLabel = formatCompactDate(dateKey);
            const isSelected = dateKey === selectedDate;
            return h(
              "article",
              { className: `schedule-day ${isSelected ? "selected today" : ""}`, key: dateKey },
              h("div", { className: "schedule-date" }, h("b", null, `${dateLabel.month} ${dateLabel.day}`)),
              h(
                "div",
                { className: `schedule-day-items ${items.length ? "" : "empty"}` },
                items.length
                  ? items.map((item, index) =>
                      h(
                        "span",
                        { className: item.type === "duty" ? "schedule-duty-item" : "", key: `${dateKey}-${index}` },
                        item.type === "duty" ? h("input", { type: "checkbox", checked: true, readOnly: true, tabIndex: -1 }) : null,
                        item.label,
                      ),
                    )
                  : h("i", null, "No schedule"),
              ),
            );
          }),
            ),
          ),
        ),
      ),
    ),
  );
}

function MemoPanel({ activeMemoId, addMemoCard, cards, moveMemoCard, removeMemoCard, setActiveMemo, updateMemoCard }) {
  const [drag, setDrag] = useState({ active: false, startX: 0, deltaX: 0 });
  const [dragMemoId, setDragMemoId] = useState("");
  const activeIndex = Math.max(0, cards.findIndex((card) => card.id === activeMemoId));
  const goToOffset = (offset) => {
    if (!cards.length) return;
    const nextIndex = (activeIndex + offset + cards.length) % cards.length;
    setActiveMemo(cards[nextIndex].id);
  };
  const handlePointerDown = (event) => {
    if (panelClickIsInteractive(event.target)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ active: true, startX: event.clientX, deltaX: 0 });
  };
  const handlePointerMove = (event) => {
    if (!drag.active) return;
    setDrag((current) => ({ ...current, deltaX: event.clientX - current.startX }));
  };
  const endDrag = () => {
    if (!drag.active) return;
    if (drag.deltaX > 64) goToOffset(-1);
    if (drag.deltaX < -64) goToOffset(1);
    setDrag({ active: false, startX: 0, deltaX: 0 });
  };
  return h(
    "section",
    { className: "memo-panel stacked-memo-panel", "aria-label": "Memo" },
    h(
      "div",
      { className: "memo-stack-layout" },
      h(
        "div",
        {
          className: `memo-stack ${drag.active ? "dragging" : ""}`,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          style: { "--drag-x": `${drag.deltaX}px` },
        },
        cards.map((card, index) => {
          const stackIndex = (index - activeIndex + cards.length) % cards.length;
          const visible = stackIndex < Math.min(cards.length, 4);
          const isActive = index === activeIndex;
          const memoAreas = [
            { key: "left", titleField: "leftTitle", titleValue: card.leftTitle || "", field: "leftText", value: card.leftText || "" },
            { key: "center", titleField: "centerTitle", titleValue: card.centerTitle || "", field: "centerText", value: card.centerText || "" },
            { key: "right", titleField: "rightTitle", titleValue: card.rightTitle || "", field: "rightText", value: card.rightText || "" },
            { key: "left-extra", titleField: "leftExtraTitle", titleValue: card.leftExtraTitle || "", field: "leftTextExtra", value: card.leftTextExtra || "" },
            { key: "center-extra", titleField: "centerExtraTitle", titleValue: card.centerExtraTitle || "", field: "centerTextExtra", value: card.centerTextExtra || "" },
            { key: "right-extra", titleField: "rightExtraTitle", titleValue: card.rightExtraTitle || "", field: "rightTextExtra", value: card.rightTextExtra || "" },
          ];
          return h(
            "article",
            {
              className: `memo-card ${isActive ? "active" : ""} ${visible ? "" : "hidden"}`,
              key: card.id,
              style: { "--stack-index": stackIndex },
              onClick: () => {
                if (!isActive) setActiveMemo(card.id);
              },
            },
            h(
              "div",
              { className: "memo-card-grip" },
              h("span", null, String(index + 1).padStart(2, "0")),
              h("input", {
                type: "text",
                maxLength: 32,
                "aria-label": "Memo title",
                value: card.title,
                onChange: (event) => updateMemoCard(card.id, "title", event.target.value),
                disabled: !isActive,
              }),
              h("button", { className: "mini-button danger", type: "button", disabled: cards.length <= 1 || !isActive, title: "Delete memo", onClick: () => removeMemoCard(card.id) }, "\u00d7"),
            ),
            isActive
              ? h(
                  "div",
                  { className: "memo-card-columns memo-six-grid" },
                  memoAreas.map((area) =>
                    h(MemoArea, {
                      cardId: card.id,
                      field: area.field,
                      key: area.key,
                      titleField: area.titleField,
                      titleValue: area.titleValue,
                      updateMemoCard,
                      value: area.value,
                    }),
                  ),
                )
              : h(
                  "div",
                  { className: "memo-card-preview-grid" },
                  memoAreas.slice(0, 6).map((area) => h("p", { className: "memo-card-preview", key: area.key }, area.value || "Empty memo")),
                ),
          );
        }),
      ),
      h(
        "div",
        { className: "memo-index", "aria-label": "Memo cards" },
        h("button", { className: "memo-index-button add-memo", type: "button", title: "Add memo", onClick: addMemoCard }, "+"),
        cards.map((card, index) =>
          h(
            "button",
            {
              className: `memo-index-button ${index === activeIndex ? "active" : ""} ${dragMemoId === card.id ? "dragging" : ""}`,
              draggable: true,
              key: card.id,
              type: "button",
              onDragStart: (event) => {
                setDragMemoId(card.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/memo-card", card.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromId = event.dataTransfer.getData("text/memo-card") || dragMemoId;
                moveMemoCard(fromId, card.id);
                setDragMemoId("");
              },
              onDragEnd: () => setDragMemoId(""),
              onClick: () => setActiveMemo(card.id),
            },
            index + 1,
          ),
        ),
      ),
    ),
  );
}

function MemoArea({ cardId, field, titleField, titleValue, updateMemoCard, value }) {
  const [quickMemo, setQuickMemo] = useState("");
  const addQuickMemo = () => {
    const text = quickMemo.trim();
    if (!text) return;
    const taggedText = text.startsWith("#") ? text : `# ${text}`;
    updateMemoCard(cardId, field, value ? `${taggedText}\n${value}` : taggedText);
    setQuickMemo("");
  };
  return h(
    "section",
    { className: "memo-area" },
    h("input", {
      className: "memo-title-input",
      maxLength: 48,
      placeholder: "Title",
      type: "text",
      value: titleValue,
      onChange: (event) => updateMemoCard(cardId, titleField, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    }),
    h("textarea", {
      className: "memo-quick-textarea",
      placeholder: "Quick add...",
      rows: 1,
      value: quickMemo,
      onChange: (event) => setQuickMemo(event.target.value),
      onKeyDown: (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          addQuickMemo();
        }
      },
    }),
    h("textarea", {
      className: "memo-large-textarea",
      placeholder: "Write freely...",
      value,
      onChange: (event) => updateMemoCard(cardId, field, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    }),
  );
}

function ScorePanel({ carryPenaltyMarked, entryCount, onAdjustCarry, onResetCarry, onToggleAttempt, onToggleCarryPenalty, routineTried, scoreInfo }) {
  const totalClass = scoreInfo.total < 0 ? "negative" : scoreInfo.total === 0 ? "neutral" : "";
  const fillClass = scoreInfo.total > 0 ? "positive" : scoreInfo.total < 0 ? "negative" : "neutral";
  const totalSign = scoreInfo.total > 0 ? "+" : scoreInfo.total < 0 ? "\u2212" : "";
  const totalMagnitude = String(Math.abs(scoreNumber(scoreInfo.total)));
  return h(
    "section",
    { className: "score-panel score-panel-compact", "aria-label": "Score summary" },
    h(
      "div",
      { className: "score-meter score-meter-compact" },
      h("span", { className: "score-kicker score-kicker-compact" }, "Total Score"),
      h(
        "div",
        { className: "score-actions" },
        h(
          "div",
          { className: "score-checks score-checks-compact" },
          h(
            "button",
            {
              className: `score-toggle-button score-toggle-good ${routineTried ? "active" : ""}`,
              type: "button",
              "aria-pressed": String(routineTried),
              "aria-label": "Tried today",
              title: "Tried today",
              onClick: onToggleAttempt,
            },
            h("span", { className: "score-toggle-mark", "aria-hidden": "true" }),
          ),
          h(
            "button",
            {
              className: `score-toggle-button score-toggle-bad ${carryPenaltyMarked ? "active" : ""}`,
              type: "button",
              "aria-pressed": String(carryPenaltyMarked),
              "aria-label": "Add -2 Carry",
              title: "Add -2 Carry",
              onClick: onToggleCarryPenalty,
            },
            h("span", { className: "score-toggle-mark", "aria-hidden": "true" }),
          ),
        ),
        h(
          "div",
          { className: "carry-controls score-carry-controls score-carry-controls-compact" },
          h("button", { className: "carry-adjust-button", type: "button", title: "Decrease Carry", "aria-label": "Decrease Carry", onClick: () => onAdjustCarry(-1) }, "-"),
          h("button", { className: "carry-reset-button", type: "button", title: "Reset Carry", "aria-label": "Reset Carry", onClick: onResetCarry }, "R"),
          h("button", { className: "carry-adjust-button", type: "button", title: "Increase Carry", "aria-label": "Increase Carry", onClick: () => onAdjustCarry(1) }, "+"),
        ),
      ),
      h(
        "div",
        { className: `score-number score-number-compact ${totalClass}` },
        h("span", { className: `score-number-sign ${totalSign ? "" : "empty"}` }, totalSign),
        h("span", { className: "score-number-digits" }, totalMagnitude),
      ),
      h("div", { className: "score-track score-track-compact", "aria-hidden": "true" }, h("span", { className: fillClass, style: { width: `${Math.max(0, Math.min(100, 50 + scoreInfo.total * 2))}%` } })),
    ),
    h(
      "div",
      { className: "score-details score-details-compact" },
      h(
        "div",
        { className: "carry-detail" },
        h("span", { className: "detail-label" }, "Carry"),
        h("strong", { className: "score-detail-value" }, formatScore(scoreInfo.carry)),
      ),
      h("div", { className: "score-detail-row score-detail-plus" }, h("span", { className: "detail-label" }, "Plus"), h("strong", { className: "score-detail-value" }, formatScore(scoreInfo.plus))),
      h("div", { className: "score-detail-row score-detail-minus" }, h("span", { className: "detail-label" }, "Minus"), h("strong", { className: "score-detail-value" }, formatScore(scoreInfo.minus))),
      h("div", { className: "score-detail-row score-detail-records" }, h("span", { className: "detail-label" }, "Records"), h("strong", { className: "score-detail-value" }, entryCount)),
    ),
  );
}

function DateMarkerPanel({ dateMarkers, selectedDate, updateDateMarker }) {
  return h(
    "section",
    { className: "date-marker-panel", "aria-label": "Date markers" },
    h(
      "div",
      { className: "date-marker-list" },
      normalizeDateMarkers(dateMarkers).map((marker, index) =>
        h(
          "label",
          { className: "date-marker", key: `marker-${index}` },
          h("input", {
            className: "date-marker-text",
            type: "text",
            maxLength: 36,
            placeholder: `Marker ${index + 1}`,
            value: marker.text,
            onChange: (event) => updateDateMarker(index, "text", event.target.value),
          }),
          h("input", {
            className: "date-marker-date",
            type: "date",
            value: marker.date,
            onClick: (event) => event.currentTarget.showPicker?.(),
            onChange: (event) => updateDateMarker(index, "date", event.target.value),
          }),
          h("span", { className: `date-marker-dday ${marker.date ? "" : "empty"}` }, formatDDay(marker.date, selectedDate)),
        ),
      ),
    ),
  );
}

function isRangeCategory(category) {
  const label = String(category?.label || "").toUpperCase().replace(/\s+/g, "");
  return label === "R.ORG" || label === "D.ORG";
}

function parseScoreRange(value) {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  const text = String(value || "").trim();
  const rangeMatch = text.match(/^(\d+)\s*(?:~|-|,)\s*(\d+)$/);
  if (!rangeMatch) {
    const score = scoreNumber(text, 0);
    return [score];
  }
  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  const step = start <= end ? 1 : -1;
  const length = Math.min(31, Math.abs(end - start) + 1);
  return Array.from({ length }, (_, index) => start + index * step);
}

function getCategoryScoreRange(category) {
  return parseScoreRange(category.yScore).filter((score) => score > 0);
}

function getPresetScoreRange(preset) {
  const range = parseScoreRange(preset.yScore).filter((score) => score > 0);
  return range.length > 1 ? range : null;
}

function TodayPlanPanel({ categories, entries, presets, schoolPresets, selectedDate, toggleChoice, weekday, weeklyPlan }) {
  return h(
    "section",
    { className: "today-plan-panel", "aria-label": "Today plan" },
    h("div", { className: "section-heading" }, h("h2", null, "Today"), h("span", null, weekday.full)),
    h(
      "div",
      { className: "today-plan-grid" },
      h(PlanRow, {
        className: "school-plan-row",
        title: "School",
        cards: schoolPresets.map((preset) => {
          const planKey = `school:${selectedDate}:${preset.key}`;
          const selectedEntry = entries.find((entry) => entry.planKey === planKey);
          const scoreRange = getPresetScoreRange(preset);
          if (scoreRange) {
            return {
              key: preset.key,
              label: "",
              scoreRange,
              selectedChoice: selectedEntry?.choice || "",
              value: preset.name,
              nScore: preset.nScore,
              onToggle: (choice) =>
                toggleChoice({
                  planKey,
                  choice: choice === "N" ? "N" : String(choice),
                  name: `School: ${preset.name} (${choice === "N" ? "N" : formatScore(choice)})`,
                  score: choice === "N" ? scoreNumber(preset.nScore) : scoreNumber(choice),
                }),
            };
          }
          return {
            key: preset.key,
            label: "",
            value: preset.name,
            yScore: preset.yScore,
            nScore: preset.nScore,
            selectedChoice: selectedEntry?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `School: ${preset.name} (${choice})`, score: scoreNumber(choice === "Y" ? preset.yScore : preset.nScore) }),
          };
        }),
      }),
      h(PlanRow, {
        className: "daily-plan-row",
        title: "Daily",
        cards: presets.map((preset) => {
          const planKey = `daily:${selectedDate}:${preset.key}`;
          return {
            key: preset.key,
            label: "",
            value: preset.name,
            yScore: preset.yScore,
            nScore: preset.nScore,
            selectedChoice: entries.find((entry) => entry.planKey === planKey)?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `Daily: ${preset.name} (${choice})`, score: scoreNumber(choice === "Y" ? preset.yScore : preset.nScore) }),
          };
        }),
      }),
      h(PlanRow, {
        className: "weekly-plan-row",
        title: "Weekly",
        cards: categories.map((category) => {
          const planEntry = getWeeklyPlanEntry(weeklyPlan[category.key]?.[weekday.key], selectedDate);
          const value = planEntry.value;
          const planKey = `plan:${selectedDate}:${category.key}`;
          const selectedEntry = entries.find((entry) => entry.planKey === planKey);
          if (isRangeCategory(category)) {
            return {
              key: category.key,
              isRangeCard: true,
              label: category.label,
              scoreRange: getCategoryScoreRange(category),
              selectedChoice: selectedEntry?.choice || "",
              value,
              nScore: category.nScore,
              onToggle: (choice) =>
                toggleChoice({
                  planKey,
                  choice: choice === "N" ? "N" : String(choice),
                  name: `${category.label}: ${value} (${choice === "N" ? "N" : formatScore(choice)})`,
                  score: choice === "N" ? scoreNumber(category.nScore) : scoreNumber(choice),
                }),
            };
          }
          return {
            key: category.key,
            label: category.label,
            value,
            yScore: category.yScore,
            nScore: category.nScore,
            selectedChoice: selectedEntry?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `${category.label}: ${value} (${choice})`, score: scoreNumber(choice === "Y" ? category.yScore : category.nScore) }),
          };
        }),
      }),
    ),
  );
}

function PlanRow({ cards, className = "", title }) {
  return h("section", { className: `plan-row ${className}` }, h("h3", null, title), h("div", { className: "plan-card-grid" }, cards.map((card) => h(PlanCard, { ...card }))));
}

function PlanCard({ label, nScore, onToggle, scoreRange, selectedChoice, value, yScore }) {
  const selectedScore = scoreNumber(selectedChoice, 0);
  const isRangeCard = Array.isArray(scoreRange);
  const isNegativeSelection = selectedChoice === "N" || (isRangeCard && selectedScore < 0);
  const selectionClass = selectedChoice ? (isNegativeSelection ? "selected-negative" : "selected-positive") : "";
  return h(
    "article",
    { className: `today-plan-card ${isRangeCard ? "range-card" : ""} ${selectionClass}` },
    h("span", { className: "edge-light", "aria-hidden": "true" }),
    h("span", { className: "plan-label" }, label),
    h("strong", { className: "plan-title" }, value),
    isRangeCard
      ? h(
        "div",
        { className: "range-score-buttons" },
          ...scoreRange.map((score) =>
            h(
              "button",
              { className: `range-score-button ${scoreNumber(score) < 0 ? "no" : "yes"} ${String(score) === selectedChoice ? "selected" : ""}`, key: score, type: "button", onClick: () => onToggle(score) },
              formatScore(score),
            ),
          ),
          h("button", { className: `range-score-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, formatScore(nScore)),
        )
      : h(
          "div",
          { className: "choice-buttons" },
          h("button", { className: `choice-button yes ${selectedChoice === "Y" ? "selected" : ""}`, type: "button", onClick: () => onToggle("Y") }, h("i", null, "Y"), h("b", null, formatScore(yScore))),
          h("button", { className: `choice-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, h("i", null, "N"), h("b", null, formatScore(nScore))),
        ),
  );
}

function DailyPanel({ addPreset, controlsId = "presetGrid", isOpen, movePreset, onToggle, presets, removePreset, title = "Daily", updatePreset }) {
  const [dragPresetKey, setDragPresetKey] = useState("");
  return h(CollapsiblePanel, {
    className: "quick-panel",
    controls: controlsId,
    description: `Set recurring ${title.toLowerCase()} checks and scores.`,
    isOpen,
    onToggle,
    title,
    children: {
      actions: h("button", { className: "text-button daily-tool", type: "button", onClick: addPreset }, "+"),
      body: h(
        "div",
        { className: "preset-grid", id: controlsId },
        presets.map((preset, index) =>
          h(
            "article",
            {
              className: `preset-card ${dragPresetKey === preset.key ? "dragging" : ""}`,
              draggable: true,
              key: preset.key,
              onDragStart: (event) => {
                if (panelClickIsInteractive(event.target)) {
                  event.preventDefault();
                  return;
                }
                setDragPresetKey(preset.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(`text/${controlsId}-preset`, preset.key);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromKey = event.dataTransfer.getData(`text/${controlsId}-preset`) || dragPresetKey;
                movePreset(fromKey, preset.key);
                setDragPresetKey("");
              },
              onDragEnd: () => setDragPresetKey(""),
            },
            h("span", { className: "drag-handle", title: "Drag to reorder", "aria-hidden": "true" }, "\u22ee\u22ee"),
            h("input", { className: "preset-name-input", type: "text", maxLength: 32, "aria-label": `${title} name`, value: preset.name, onChange: (event) => updatePreset(index, "name", event.target.value) }),
            h("label", { className: "score-field positive-score", title: "Y score" }, h("input", { className: "preset-score-input y-score", type: "text", inputMode: "numeric", value: preset.yScore, onChange: (event) => updatePreset(index, "yScore", event.target.value) })),
            h("label", { className: "score-field negative-score", title: "N score" }, h("input", { className: "preset-score-input n-score", type: "text", inputMode: "numeric", value: preset.nScore, onChange: (event) => updatePreset(index, "nScore", event.target.value) })),
            h("button", { className: "mini-button danger", type: "button", onClick: () => removePreset(index) }, "\u00d7"),
          ),
        ),
      ),
    },
  });
}

function WeeklyPanel({ addCategory, categories, isOpen, moveCategory, onToggle, removeCategory, selectedDate, updateCategory, updateWeeklyPlan, weeklyPlan }) {
  const [dragCategoryKey, setDragCategoryKey] = useState("");
  const selectedWeekday = getWeekdayKey(selectedDate);
  return h(CollapsiblePanel, {
    className: "weekly-panel",
    controls: "weeklyGrid",
    description: "Create categories and assign plans for each weekday.",
    isOpen,
    onToggle,
    title: "Weekly",
    children: {
      actions: h("button", { className: "text-button weekly-tool", type: "button", onClick: addCategory }, "+"),
      body: h(
        "div",
        { className: "weekly-grid", id: "weeklyGrid" },
        h("div", { className: "weekly-corner" }, "Category"),
        ...weekDays.map((day) => h("div", { className: `weekly-day ${day.key === selectedWeekday ? "active" : ""}`, key: day.key }, day.label)),
        ...categories.flatMap((category, index) => [
          h(
            "div",
            {
              className: `weekly-category ${dragCategoryKey === category.key ? "dragging" : ""}`,
              draggable: true,
              key: `${category.key}-label`,
              onDragStart: (event) => {
                if (panelClickIsInteractive(event.target)) {
                  event.preventDefault();
                  return;
                }
                setDragCategoryKey(category.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/weekly-category", category.key);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromKey = event.dataTransfer.getData("text/weekly-category") || dragCategoryKey;
                moveCategory(fromKey, category.key);
                setDragCategoryKey("");
              },
              onDragEnd: () => setDragCategoryKey(""),
            },
            h("span", { className: "drag-handle", title: "Drag to reorder", "aria-hidden": "true" }, "\u22ee\u22ee"),
            h("input", {
              className: "category-name-input",
              type: "text",
              maxLength: 24,
              value: category.label,
              onChange: (event) => updateCategory(category.key, "label", event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
            h("label", { className: `score-field y-field ${isRangeCategory(category) ? "range-score" : "positive-score"}`, title: isRangeCategory(category) ? "Y range" : "Y score" }, h("input", { className: "category-score-input y-score", type: "text", inputMode: isRangeCategory(category) ? "text" : "numeric", value: category.yScore, onChange: (event) => updateCategory(category.key, "yScore", event.target.value), onKeyDown: (event) => event.stopPropagation() })),
            h("label", { className: "score-field n-field negative-score", title: "N score" }, h("input", { className: "category-score-input n-score", type: "text", inputMode: "numeric", value: category.nScore, onChange: (event) => updateCategory(category.key, "nScore", event.target.value), onKeyDown: (event) => event.stopPropagation() })),
            h(
              "div",
              { className: "category-actions" },
              h("button", { className: "mini-button danger", type: "button", disabled: categories.length <= 1, onClick: () => removeCategory(category.key) }, "\u00d7"),
            ),
          ),
          ...weekDays.map((day) =>
            h("textarea", {
              className: `weekly-input ${day.key === selectedWeekday ? "active" : ""}`,
              key: `${category.key}-${day.key}`,
              maxLength: 180,
              placeholder: `${day.label} ${category.label}`,
              value: weeklyPlan[category.key]?.[day.key] || "",
              onChange: (event) => updateWeeklyPlan(category.key, day.key, event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
          ),
        ]),
      ),
    },
  });
}

function HistoryPanel({ carryPenalties, flaggedDate, getDayTotal, onToggleFlag, routineAttempts, selectedDate }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + index - 3);
    const key = toDateKey(date);
    const penalized = Boolean(carryPenalties?.[key]);
    return { key, flagged: key === flaggedDate, penalized, total: getDayTotal(key), tried: !penalized && Boolean(routineAttempts?.[key]) };
  });
  const scoreScaleMax = 25;
  let uncheckedSinceFlag = 0;
  if (flaggedDate && flaggedDate < selectedDate) {
    let cursor = flaggedDate;
    let guard = 0;
    while (cursor < selectedDate && guard < 10000) {
      if (!routineAttempts?.[cursor]) uncheckedSinceFlag += 1;
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }
  const flagSummary = flaggedDate ? `Unchecked ${uncheckedSinceFlag} days` : "Set a flag";
  return h(
    "section",
    { className: "history-panel", "aria-label": "Last 7 days" },
    h(
      "div",
      { className: "section-heading history-heading" },
      h("h2", null, "Weekly Overview"),
      h(
        "div",
        { className: "history-heading-actions" },
        h("span", null, flagSummary),
        h(
          "button",
          {
            className: `flag-button ${flaggedDate === selectedDate ? "active" : ""}`,
            type: "button",
            title: flaggedDate === selectedDate ? "Remove flag from selected date" : "Flag selected date",
            "aria-pressed": String(flaggedDate === selectedDate),
            onClick: onToggleFlag,
          },
          "\u2691",
        ),
      ),
    ),
    h(
      "div",
      { className: "history-bars" },
      days.map((day) =>
        h(
          "div",
          { className: `history-day ${day.key === selectedDate ? "today" : ""}`, key: day.key },
          h(
            "div",
            { className: `history-fill ${day.total > 0 ? "plus" : day.total < 0 ? "minus" : ""}`, style: { height: `${Math.max(16, (Math.min(scoreScaleMax, Math.abs(day.total)) / scoreScaleMax) * 112)}px` } },
            h("span", { className: `history-flag ${day.flagged ? "active" : ""}`, title: day.flagged ? "Flagged date" : "" }, day.flagged ? "\u2691" : ""),
            h("span", { className: `history-attempt ${day.penalized ? "history-penalty checked" : day.tried ? "checked" : ""}`, title: day.penalized ? "Carry -2 marked" : day.tried ? "Routine tried" : "Not checked" }, day.penalized || day.tried ? "\u2713" : ""),
          ),
          h("span", { className: "history-date" }, day.key.slice(5).replace("-", ".")),
          h("strong", { className: "history-score" }, formatScore(day.total)),
        ),
      ),
    ),
  );
}

function CalendarPanel({ calendar, calendarDuties, isOpen, onToggle, openMonths, selectedDate, setOpenMonths, toggleCalendarDuty, updateCalendarNote }) {
  const year = new Date(`${selectedDate}T00:00:00`).getFullYear();
  const orderedMonthIndexes = getOrderedMonthIndexes();
  const toggleMonth = (monthIndex) => {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(monthIndex)) next.delete(monthIndex);
      else next.add(monthIndex);
      return next;
    });
  };
  return h(CollapsiblePanel, {
    className: "calendar-panel",
    controls: "calendarMonths",
    description: "Open a month and write schedule notes or duty checks for each date.",
    isOpen,
    onToggle,
    title: "Calendar",
    children: {
      body: h(
        "div",
        { className: "calendar-months no-panel-toggle", id: "calendarMonths" },
        orderedMonthIndexes.map((monthIndex) => {
          const monthName = monthNames[monthIndex];
          const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          const dutyDates = Object.keys(calendarDuties || {}).filter((dateKey) => dateKey.startsWith(prefix));
          const noteCount = new Set([...Object.keys(calendar).filter((dateKey) => dateKey.startsWith(prefix)), ...dutyDates]).size;
          const monthOpen = openMonths.has(monthIndex);
          return h(
            "section",
            {
              className: `calendar-month ${monthOpen ? "open" : ""}`,
              key: monthName,
            },
            h(
              "button",
              {
                className: "calendar-month-toggle",
                type: "button",
                "aria-expanded": String(monthOpen),
                onClick: (event) => {
                  event.stopPropagation();
                  toggleMonth(monthIndex);
                },
              },
              h("span", null, monthName),
              h("strong", null, `${noteCount} items`),
            ),
            monthOpen ? h(MonthDays, { calendar, calendarDuties, monthIndex, selectedDate, toggleCalendarDuty, updateCalendarNote, year }) : null,
          );
        }),
      ),
    },
  });
}

function MonthDays({ calendar, calendarDuties, monthIndex, selectedDate, toggleCalendarDuty, updateCalendarNote, year }) {
  const todayKey = toDateKey(new Date());
  const scrollStartRef = useRef(null);
  const handleCalendarTouchStart = (event) => {
    if (!event.target.closest("textarea")) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    scrollStartRef.current = { x: touch.clientX, y: touch.clientY, target: event.target };
  };
  const handleCalendarTouchMove = (event) => {
    const start = scrollStartRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      start.target.blur();
      scrollStartRef.current = null;
    }
  };
  const handleCalendarTouchEnd = () => {
    scrollStartRef.current = null;
  };
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayIndex = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstDayIndex }, (_, index) => ({ key: `blank-start-${monthIndex}-${index}`, type: "blank" })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, key: `day-${monthIndex}-${index + 1}`, type: "day" })),
  ];
  const trailingBlanks = (7 - (cells.length % 7)) % 7;
  Array.from({ length: trailingBlanks }, (_, index) => cells.push({ key: `blank-end-${monthIndex}-${index}`, type: "blank" }));
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return h(
    "div",
    { className: "calendar-weeks", onTouchCancel: handleCalendarTouchEnd, onTouchEnd: handleCalendarTouchEnd, onTouchMove: handleCalendarTouchMove, onTouchStart: handleCalendarTouchStart },
    weeks.map((week, weekIndex) =>
      h(
      "div",
      { className: "calendar-week-scroll", key: `week-${monthIndex}-${weekIndex}` },
      h("div", { className: "calendar-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label))),
      h(
        "div",
        { className: "calendar-days" },
        week.map((cell, cellIndex) => {
          if (cell.type === "blank") return h("div", { className: "calendar-day-spacer", key: cell.key, "aria-hidden": "true" });
          const day = cell.day;
          const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const date = new Date(`${dateKey}T00:00:00`);
          const weekday = weekDays[(date.getDay() + 6) % 7].label;
          const duties = calendarDuties?.[dateKey] || {};
          return h(
            "article",
            { className: `calendar-day ${dateKey === selectedDate ? "selected" : ""} ${dateKey === todayKey ? "today" : ""}`, key: dateKey },
            h(
              "span",
              { className: "calendar-date" },
              h("b", null, day),
              h(
                "span",
                { className: "calendar-duty-checks" },
                calendarDutyOptions.map((option) =>
                  h(
                    "span",
                    { className: `calendar-duty ${duties[option.key] ? "checked" : ""}`, key: option.key },
                    h("input", {
                      type: "checkbox",
                      checked: Boolean(duties[option.key]),
                      "aria-label": `${dateKey} ${option.label}`,
                      onChange: () => toggleCalendarDuty(dateKey, option.key),
                      onClick: (event) => event.stopPropagation(),
                    }),
                    h("em", null, option.label),
                  ),
                ),
              ),
              h("i", null, weekday),
            ),
            h("textarea", {
              maxLength: 600,
              placeholder: "Schedule",
              value: calendar[dateKey] || "",
              onChange: (event) => updateCalendarNote(dateKey, event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
          );
        }),
      ),
      ),
    ),
  );
}

export default App;
