export const MINDFOLD_ENGINE_VERSION = 2;
export const MINDFOLD_SCHEMA_REVISION = 4;
export const MINDFOLD_TRASH_DAYS = 30;
export const MINDFOLD_TRASH_MS = MINDFOLD_TRASH_DAYS * 24 * 60 * 60 * 1000;

export const BLOCK_TYPES = [
  "text",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "bullet",
  "check",
  "quote",
  "callout",
];

const INTERNAL_BLOCK_TYPES = [...BLOCK_TYPES, "columns"];

export const BLOCK_TYPE_OPTIONS = [
  { type: "text", label: "본문", hint: "기본 텍스트" },
  { type: "heading-1", label: "제목 1", hint: "가장 큰 제목" },
  { type: "heading-2", label: "제목 2", hint: "큰 제목" },
  { type: "heading-3", label: "제목 3", hint: "중간 제목" },
  { type: "heading-4", label: "제목 4", hint: "작은 제목" },
  { type: "bullet", label: "글머리표", hint: "목록 만들기" },
  { type: "check", label: "체크", hint: "체크리스트" },
  { type: "quote", label: "인용", hint: "인용문 강조" },
  { type: "callout", label: "강조", hint: "메모 강조" },
];

export const TEXT_COLORS = {
  ink: "#20252c",
  graphite: "#525a65",
  navy: "#315d88",
  cobalt: "#326fba",
  teal: "#247e7a",
  forest: "#3d7a58",
  olive: "#6f783e",
  plum: "#795481",
  violet: "#6655a5",
  berry: "#a84d62",
  rose: "#b85e82",
  amber: "#9a6a2f",
  coral: "#b75f4c",
  sky: "#4f7f9e",
  mint: "#3f8573",
  lavender: "#716b9c",
};

export const TEXT_COLOR_OPTIONS = [
  ["ink", "먹색"],
  ["graphite", "연필"],
  ["navy", "남색"],
  ["cobalt", "파랑"],
  ["teal", "청록"],
  ["forest", "초록"],
  ["olive", "올리브"],
  ["plum", "자두"],
  ["violet", "보라"],
  ["berry", "베리"],
  ["rose", "장미"],
  ["amber", "호박"],
  ["coral", "코랄"],
  ["sky", "하늘"],
  ["mint", "민트"],
  ["lavender", "라벤더"],
].map(([id, label]) => ({ id, label, value: TEXT_COLORS[id] }));

const createId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createBlock(overrides = {}) {
  return {
    id: overrides.id || createId("mf2-block"),
    type: INTERNAL_BLOCK_TYPES.includes(overrides.type) ? overrides.type : "text",
    text: String(overrides.text ?? "").replace(/\r\n/g, "\n"),
    color: Object.prototype.hasOwnProperty.call(TEXT_COLORS, overrides.color) ? overrides.color : "ink",
    checked: overrides.checked === true,
    toggle: overrides.toggle === true,
    open: overrides.open !== false,
    columns: [2, 3, 4].includes(Number(overrides.columns)) ? Number(overrides.columns) : 1,
    column: Number.isInteger(overrides.column) ? Math.max(0, Math.min(3, overrides.column)) : null,
    children: [],
    marks: [],
    masks: [],
  };
}

export function createPage(index = 0, overrides = {}) {
  const firstBlock = createBlock();
  return {
    id: overrides.id || createId("mf2-page"),
    label: String(overrides.label || `페이지 ${index + 1}`).slice(0, 40),
    blocks: [firstBlock],
    activeId: firstBlock.id,
  };
}

export function createMindfold() {
  const page = createPage(0, { id: "mindfold-page-main", label: "페이지 1" });
  return {
    engineVersion: MINDFOLD_ENGINE_VERSION,
    schemaRevision: MINDFOLD_SCHEMA_REVISION,
    tabs: [page],
    activeTabId: page.id,
    trash: [],
  };
}

function normalizeRanges(ranges, textLength, allowedTypes = null) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      id: range?.id || createId("mf2-range"),
      type: allowedTypes?.includes(range?.type) ? range.type : undefined,
      start: Math.max(0, Math.min(textLength, Number(range?.start) || 0)),
      end: Math.max(0, Math.min(textLength, Number(range?.end) || 0)),
    }))
    .filter((range) => range.end > range.start && (!allowedTypes || range.type));
}

export function normalizeBlock(source) {
  const block = createBlock(source);
  block.children = (Array.isArray(source?.children) ? source.children : []).filter(Boolean).map(normalizeBlock);
  if (block.type === "columns") {
    block.children.forEach((child) => {
      child.column = Number.isInteger(child.column) && child.column < block.columns ? child.column : 0;
    });
    for (let column = 0; column < block.columns; column += 1) {
      if (!block.children.some((child) => child.column === column)) block.children.push(createBlock({ column }));
    }
  }
  block.marks = normalizeRanges(source?.marks, block.text.length, ["bold", "italic"]);
  block.masks = normalizeRanges(source?.masks, block.text.length).map(({ type, ...mask }) => mask);
  return block;
}

function normalizePage(source, index) {
  const blocks = (Array.isArray(source?.blocks) ? source.blocks : []).filter(Boolean).map(normalizeBlock);
  if (!blocks.length) blocks.push(createBlock());
  const ids = flattenBlocks(blocks).map((item) => item.block.id);
  return {
    id: source?.id || createId("mf2-page"),
    label: String(source?.label || `페이지 ${index + 1}`).trim().slice(0, 40) || `페이지 ${index + 1}`,
    blocks,
    activeId: ids.includes(source?.activeId) ? source.activeId : ids[0],
  };
}

export function normalizeMindfold(source) {
  // V1 data is intentionally not migrated. The V2 editor starts clean while the
  // rest of the dashboard state remains untouched.
  if (source?.engineVersion !== MINDFOLD_ENGINE_VERSION || source?.schemaRevision !== MINDFOLD_SCHEMA_REVISION) return createMindfold();
  const tabs = (Array.isArray(source.tabs) ? source.tabs : []).filter(Boolean).map(normalizePage);
  if (!tabs.length) tabs.push(createPage());
  const trash = (Array.isArray(source.trash) ? source.trash : [])
    .filter((page) => Number.isFinite(Date.parse(page?.deletedAt)))
    .filter((page) => Date.now() - Date.parse(page.deletedAt) < MINDFOLD_TRASH_MS)
    .map((page, index) => ({ ...normalizePage(page, index), deletedAt: page.deletedAt }));
  return {
    engineVersion: MINDFOLD_ENGINE_VERSION,
    schemaRevision: MINDFOLD_SCHEMA_REVISION,
    tabs,
    activeTabId: tabs.some((page) => page.id === source.activeTabId) ? source.activeTabId : tabs[0].id,
    trash,
  };
}

export function cloneMindfold(mindfold) {
  return normalizeMindfold(JSON.parse(JSON.stringify(mindfold)));
}

export function getActivePage(mindfold) {
  return mindfold.tabs.find((page) => page.id === mindfold.activeTabId) || mindfold.tabs[0];
}

export function flattenBlocks(blocks, options = {}, result = [], depth = 0, parentId = "") {
  const includeClosed = options.includeClosed === true;
  (blocks || []).forEach((block) => {
    if (block.type !== "columns" || options.includeContainers) result.push({ block, depth, parentId });
    if (block.children.length && (includeClosed || !block.toggle || block.open)) {
      flattenBlocks(block.children, options, result, depth + 1, block.id);
    }
  });
  return result;
}

export function findBlockLocation(blocks, id, parent = null) {
  for (let index = 0; index < (blocks || []).length; index += 1) {
    const block = blocks[index];
    if (block.id === id) return { block, index, siblings: blocks, parent };
    const nested = findBlockLocation(block.children, id, block);
    if (nested) return nested;
  }
  return null;
}

export function findBlock(blocks, id) {
  return findBlockLocation(blocks, id)?.block || null;
}

export function containsBlock(block, id) {
  return block.id === id || Boolean(findBlock(block.children, id));
}

export function normalizePageAfterMutation(page) {
  if (!page.blocks.length) page.blocks.push(createBlock());
  const ensureColumnInputs = (blocks) => {
    blocks.forEach((block) => {
      ensureColumnInputs(block.children);
      if (block.type !== "columns") return;
      for (let column = 0; column < block.columns; column += 1) {
        if (!block.children.some((child) => child.column === column)) {
          block.children.push(createBlock({ column }));
        }
      }
    });
  };
  ensureColumnInputs(page.blocks);
  const ids = flattenBlocks(page.blocks, { includeClosed: true }).map((item) => item.block.id);
  if (!ids.includes(page.activeId)) page.activeId = ids[0];
  return page;
}

export function removeBlocks(page, ids) {
  const idSet = new Set(ids);
  const removeFrom = (blocks) => {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      if (idSet.has(block.id)) blocks.splice(index, 1);
      else removeFrom(block.children);
    }
  };
  removeFrom(page.blocks);
  return normalizePageAfterMutation(page);
}

export function insertBlockAfter(page, targetId, block) {
  const location = findBlockLocation(page.blocks, targetId);
  if (!location) page.blocks.push(block);
  else location.siblings.splice(location.index + 1, 0, block);
  page.activeId = block.id;
  return block.id;
}

export function insertBlockBefore(page, targetId, block) {
  const location = findBlockLocation(page.blocks, targetId);
  if (!location) page.blocks.unshift(block);
  else location.siblings.splice(location.index, 0, block);
  page.activeId = block.id;
  return block.id;
}

export function moveBlocks(page, movingIds, targetId, placement = "after") {
  const selected = new Set(movingIds);
  if (!selected.size || selected.has(targetId)) return false;
  const ordered = flattenBlocks(page.blocks, { includeClosed: true })
    .map(({ block }) => block)
    .filter((block) => selected.has(block.id))
    .filter((block) => {
      let location = findBlockLocation(page.blocks, block.id);
      while (location?.parent) {
        if (selected.has(location.parent.id)) return false;
        location = findBlockLocation(page.blocks, location.parent.id);
      }
      return true;
    });
  if (!ordered.length || ordered.some((block) => containsBlock(block, targetId))) return false;

  removeBlocks(page, movingIds);
  const target = findBlockLocation(page.blocks, targetId);
  if (!target) return false;
  if (placement === "inside") {
    ordered.forEach((block) => { block.column = null; });
    target.block.toggle = true;
    target.block.open = true;
    target.block.children.push(...ordered);
  } else {
    ordered.forEach((block) => { block.column = target.parent?.type === "columns" ? target.block.column : null; });
    target.siblings.splice(target.index + (placement === "after" ? 1 : 0), 0, ...ordered);
  }
  page.activeId = ordered[0].id;
  return true;
}

export function createColumnsAt(page, id, count) {
  const columns = [2, 3, 4].includes(Number(count)) ? Number(count) : 2;
  const location = findBlockLocation(page.blocks, id);
  if (!location || location.block.type === "columns") return false;
  const [original] = location.siblings.splice(location.index, 1);
  const parentColumn = location.parent?.type === "columns" ? original.column : null;
  original.column = 0;
  const layout = createBlock({ type: "columns", columns, column: parentColumn });
  layout.children = [original];
  for (let column = 1; column < columns; column += 1) layout.children.push(createBlock({ column }));
  location.siblings.splice(location.index, 0, layout);
  page.activeId = original.id;
  return true;
}

export function exitColumnsAt(page, id) {
  const location = findBlockLocation(page.blocks, id);
  if (location?.parent?.type !== "columns") return false;
  const layout = location.parent;
  const layoutLocation = findBlockLocation(page.blocks, layout.id);
  if (!layoutLocation) return false;
  const currentColumn = location.block.column;
  const visibleColumnBlocks = layout.children.filter((block) => block.column === currentColumn);
  const columnIndex = visibleColumnBlocks.findIndex((block) => block.id === id);
  const promotedIds = new Set(visibleColumnBlocks.slice(columnIndex).map((block) => block.id));
  const promoted = layout.children
    .filter((block) => promotedIds.has(block.id))
    .map((block) => ({ ...block, column: null }));
  layout.children = layout.children.filter((block) => !promotedIds.has(block.id));
  layoutLocation.siblings.splice(layoutLocation.index + 1, 0, ...promoted);
  const populatedColumns = new Set(layout.children.map((block) => block.column));
  for (let column = 0; column < layout.columns; column += 1) {
    if (!populatedColumns.has(column)) layout.children.push(createBlock({ column }));
  }
  page.activeId = promoted[0]?.id || id;
  return true;
}

export function indentBlock(page, id) {
  const location = findBlockLocation(page.blocks, id);
  if (!location || location.index === 0) return false;
  const previous = location.parent?.type === "columns"
    ? location.siblings.slice(0, location.index).reverse().find((block) => block.column === location.block.column)
    : location.siblings[location.index - 1];
  if (!previous) return false;
  const [moving] = location.siblings.splice(location.index, 1);
  previous.toggle = true;
  previous.open = true;
  previous.children.push(moving);
  page.activeId = id;
  return true;
}

export function outdentBlock(page, id) {
  const location = findBlockLocation(page.blocks, id);
  if (!location?.parent) return false;
  const parentLocation = findBlockLocation(page.blocks, location.parent.id);
  if (!parentLocation) return false;
  const [moving] = location.siblings.splice(location.index, 1);
  parentLocation.siblings.splice(parentLocation.index + 1, 0, moving);
  page.activeId = id;
  return true;
}

export function adjustRanges(ranges, previousText, nextText) {
  if (!ranges?.length || previousText === nextText) return ranges || [];
  let prefix = 0;
  while (prefix < previousText.length && prefix < nextText.length && previousText[prefix] === nextText[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previousText.length - prefix
    && suffix < nextText.length - prefix
    && previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) suffix += 1;
  const previousEnd = previousText.length - suffix;
  const delta = nextText.length - previousText.length;
  return ranges
    .map((range) => {
      if (range.end <= prefix) return { ...range };
      if (range.start >= previousEnd) return { ...range, start: range.start + delta, end: range.end + delta };
      return { ...range, start: Math.min(range.start, prefix), end: Math.max(prefix, Math.min(nextText.length, range.end + delta)) };
    })
    .filter((range) => range.end > range.start);
}

export function setRange(block, kind, start, end, type = "") {
  if (end <= start) return;
  const source = kind === "marks" ? block.marks : block.masks;
  const isCovered = source.some((range) => (
    range.start <= start && range.end >= end && (kind !== "marks" || range.type === type)
  ));
  if (isCovered) {
    block[kind] = source.flatMap((range) => {
      if ((kind === "marks" && range.type !== type) || range.end <= start || range.start >= end) return [range];
      const pieces = [];
      if (range.start < start) pieces.push({ ...range, id: createId("mf2-range"), end: start });
      if (range.end > end) pieces.push({ ...range, id: createId("mf2-range"), start: end });
      return pieces;
    });
  } else {
    block[kind].push({ id: createId("mf2-range"), start, end, ...(kind === "marks" ? { type } : {}) });
  }
}
