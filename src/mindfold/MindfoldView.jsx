import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RichEditor from "./RichEditor.jsx";
import {
  BLOCK_TYPE_OPTIONS,
  MINDFOLD_TRASH_DAYS,
  MINDFOLD_TRASH_MS,
  TEXT_COLORS,
  TEXT_COLOR_OPTIONS,
  adjustRanges,
  cloneMindfold,
  createBlock,
  createColumnsAt,
  createPage,
  exitColumnsAt,
  findBlock,
  findBlockLocation,
  flattenBlocks,
  getActivePage,
  indentBlock,
  insertBlockAfter,
  moveBlocks,
  normalizeMindfold,
  normalizePageAfterMutation,
  outdentBlock,
  removeBlocks,
  setRange,
} from "./model.js";

const slashCommands = [
  ...BLOCK_TYPE_OPTIONS.map((option) => ({ id: option.type, label: option.label, hint: option.hint, action: "type", value: option.type })),
  { id: "toggle", label: "토글", hint: "현재 블록을 접을 수 있게 변경", action: "toggle" },
  { id: "columns-2", label: "2열", hint: "이 블록부터 두 개의 열로 나누기", action: "columns", value: 2 },
  { id: "columns-3", label: "3열", hint: "이 블록부터 세 개의 열로 나누기", action: "columns", value: 3 },
  { id: "columns-4", label: "4열", hint: "이 블록부터 네 개의 열로 나누기", action: "columns", value: 4 },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function splitRanges(ranges, offset) {
  const left = [];
  const right = [];
  (ranges || []).forEach((range) => {
    if (range.start < offset) left.push({ ...range, end: Math.min(range.end, offset) });
    if (range.end > offset) right.push({ ...range, start: Math.max(0, range.start - offset), end: range.end - offset });
  });
  return {
    left: left.filter((range) => range.end > range.start),
    right: right.filter((range) => range.end > range.start),
  };
}

function selectionIntersects(rect, selection) {
  return !(rect.right < selection.left || rect.left > selection.right || rect.bottom < selection.top || rect.top > selection.bottom);
}

function duplicateBlockTree(source) {
  const copy = createBlock({
    type: source.type,
    text: source.text,
    color: source.color,
    checked: source.checked,
    toggle: source.toggle,
    open: source.open,
    columns: source.columns,
    column: source.column,
  });
  copy.marks = source.marks.map((mark) => ({ ...mark }));
  copy.masks = source.masks.map((mask) => ({ ...mask }));
  copy.children = source.children.map(duplicateBlockTree);
  return copy;
}

export default function MindfoldView({ mindfold, onCommit, onRedo, onUndo }) {
  const documentState = useMemo(() => normalizeMindfold(mindfold), [mindfold]);
  const activePage = getActivePage(documentState);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [editingPageId, setEditingPageId] = useState("");
  const [editingPageLabel, setEditingPageLabel] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState([]);
  const [focusedBlockId, setFocusedBlockId] = useState("");
  const [blockMenu, setBlockMenu] = useState(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dragState, setDragState] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const editorRefs = useRef(new Map());
  const selectedBlockIdsRef = useRef([]);
  const savedSelectionsRef = useRef(new Map());
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const suppressMenuClickRef = useRef({ id: "", until: 0 });
  const marqueeRef = useRef(null);
  const selectAllRef = useRef(0);
  const composingRef = useRef(new Set());

  const visibleBlocks = useMemo(
    () => flattenBlocks(activePage.blocks).map(({ block }) => block),
    [activePage.blocks],
  );

  useEffect(() => {
    selectedBlockIdsRef.current = selectedBlockIds;
  }, [selectedBlockIds]);

  const commit = useCallback((recipe, options = {}) => {
    const next = cloneMindfold(documentState);
    const page = getActivePage(next);
    recipe(next, page);
    normalizePageAfterMutation(page);
    onCommit(next, options);
    return next;
  }, [documentState, onCommit]);

  const focusBlock = useCallback((id, offset = 0, end = offset) => {
    requestAnimationFrame(() => {
      editorRefs.current.get(id)?.focusAt(offset, end);
    });
  }, []);

  const restoreHistory = useCallback((direction) => {
    const id = focusedBlockId;
    const selection = id ? editorRefs.current.get(id)?.getSelection() : null;
    document.activeElement?.blur();
    const restored = direction === "redo" ? onRedo() : onUndo();
    setBlockMenu(null);
    setSlashMenu(null);
    selectedBlockIdsRef.current = [];
    setSelectedBlockIds([]);
    if (restored && id) {
      requestAnimationFrame(() => focusBlock(id, selection?.start || 0, selection?.end || selection?.start || 0));
    }
  }, [focusBlock, focusedBlockId, onRedo, onUndo]);

  useEffect(() => {
    selectedBlockIdsRef.current = [];
    setSelectedBlockIds([]);
    setFocusedBlockId("");
    setBlockMenu(null);
    setSlashMenu(null);
  }, [activePage.id]);

  useEffect(() => {
    const valid = new Set(flattenBlocks(activePage.blocks, { includeClosed: true }).map(({ block }) => block.id));
    setSelectedBlockIds((current) => {
      const next = current.filter((id) => valid.has(id));
      selectedBlockIdsRef.current = next;
      return next;
    });
  }, [activePage.blocks]);

  useEffect(() => {
    if (!blockMenu && !slashMenu) return undefined;
    const close = (event) => {
      if (event.target.closest?.(".mf2-floating-menu, .mf2-menu-button")) return;
      setBlockMenu(null);
      setSlashMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [blockMenu, slashMenu]);

  const updateText = useCallback((id, text, selection = null) => {
    let nextBlock = null;
    commit((next, page) => {
      const block = findBlock(page.blocks, id);
      if (!block || block.text === text) return;
      block.marks = adjustRanges(block.marks, block.text, text);
      block.masks = adjustRanges(block.masks, block.text, text);
      block.text = text;
      nextBlock = block;
      page.activeId = id;
    }, { historyGroup: `text:${id}` });
    if (nextBlock && selection && (nextBlock.marks.length || nextBlock.masks.length)) {
      requestAnimationFrame(() => editorRefs.current.get(id)?.repaint(nextBlock, selection));
    }
  }, [commit]);

  const addAfter = useCallback((id, text = "", options = {}) => {
    let nextId = "";
    commit((next, page) => {
      const location = findBlockLocation(page.blocks, id);
      const block = createBlock({
        text,
        type: options.type || "text",
        column: location?.parent?.type === "columns" ? location.block.column : null,
        marks: options.marks || [],
        masks: options.masks || [],
      });
      block.marks = options.marks || [];
      block.masks = options.masks || [];
      nextId = block.id;
      insertBlockAfter(page, id, block);
    });
    focusBlock(nextId, 0);
    return nextId;
  }, [commit, focusBlock]);

  const splitBlock = useCallback((id, offset) => {
    let nextId = "";
    let leftBlock = null;
    commit((next, page) => {
      const location = findBlockLocation(page.blocks, id);
      if (!location) return;
      const block = location.block;
      const splitAt = clamp(offset, 0, block.text.length);
      const nextText = block.text.slice(splitAt);
      const markParts = splitRanges(block.marks, splitAt);
      const maskParts = splitRanges(block.masks, splitAt);
      block.text = block.text.slice(0, splitAt);
      block.marks = markParts.left;
      block.masks = maskParts.left;
      leftBlock = block;
      const nextBlock = createBlock({
        type: ["bullet", "check"].includes(block.type) ? block.type : "text",
        text: nextText,
        color: block.color,
        column: location.parent?.type === "columns" ? block.column : null,
      });
      nextBlock.marks = markParts.right;
      nextBlock.masks = maskParts.right;
      nextId = nextBlock.id;
      location.siblings.splice(location.index + 1, 0, nextBlock);
      page.activeId = nextId;
    });
    if (leftBlock) editorRefs.current.get(id)?.repaint(leftBlock, { start: offset, end: offset });
    focusBlock(nextId, 0);
  }, [commit, focusBlock]);

  const splitIntoToggleChild = useCallback((id, offset) => {
    let nextId = "";
    let parentBlock = null;
    let splitAt = offset;
    commit((next, page) => {
      const location = findBlockLocation(page.blocks, id);
      if (!location?.block.toggle) return;
      const block = location.block;
      splitAt = clamp(offset, 0, block.text.length);
      const nextText = block.text.slice(splitAt);
      const markParts = splitRanges(block.marks, splitAt);
      const maskParts = splitRanges(block.masks, splitAt);
      block.text = block.text.slice(0, splitAt);
      block.marks = markParts.left;
      block.masks = maskParts.left;
      block.open = true;
      parentBlock = block;

      const child = createBlock({
        type: "text",
        text: nextText,
        color: block.color,
        column: null,
      });
      child.marks = markParts.right;
      child.masks = maskParts.right;
      nextId = child.id;
      block.children.unshift(child);
      page.activeId = nextId;
    });
    if (parentBlock) editorRefs.current.get(id)?.repaint(parentBlock, { start: splitAt, end: splitAt });
    if (nextId) focusBlock(nextId, 0);
  }, [commit, focusBlock]);

  const deleteBlocksById = useCallback((idsToDelete) => {
    if (!idsToDelete.length) return;
    const currentVisible = flattenBlocks(activePage.blocks).map(({ block }) => block.id);
    const firstIndex = Math.min(...idsToDelete.map((id) => currentVisible.indexOf(id)).filter((index) => index >= 0));
    let focusId = "";
    commit((next, page) => {
      removeBlocks(page, idsToDelete);
      const remaining = flattenBlocks(page.blocks).map(({ block }) => block.id);
      focusId = remaining[Math.min(firstIndex, remaining.length - 1)] || remaining[0];
      page.activeId = focusId;
    });
    selectedBlockIdsRef.current = [];
    setSelectedBlockIds([]);
    window.getSelection()?.removeAllRanges();
    if (focusId) focusBlock(focusId, 0);
  }, [activePage.blocks, commit, focusBlock]);

  const deleteSelected = useCallback(() => {
    deleteBlocksById(selectedBlockIdsRef.current);
  }, [deleteBlocksById]);

  const mergeBackward = useCallback((id) => {
    const list = flattenBlocks(activePage.blocks).map(({ block }) => block);
    const index = list.findIndex((block) => block.id === id);
    if (index <= 0) return;
    const previous = list[index - 1];
    const current = list[index];
    const previousLength = previous.text.length;
    commit((next, page) => {
      const previousBlock = findBlock(page.blocks, previous.id);
      const currentLocation = findBlockLocation(page.blocks, current.id);
      if (!previousBlock || !currentLocation) return;
      previousBlock.text += currentLocation.block.text;
      previousBlock.marks.push(...currentLocation.block.marks.map((mark) => ({ ...mark, start: mark.start + previousLength, end: mark.end + previousLength })));
      previousBlock.masks.push(...currentLocation.block.masks.map((mask) => ({ ...mask, start: mask.start + previousLength, end: mask.end + previousLength })));
      previousBlock.children.push(...currentLocation.block.children);
      currentLocation.siblings.splice(currentLocation.index, 1);
      page.activeId = previousBlock.id;
    });
    focusBlock(previous.id, previousLength);
  }, [activePage.blocks, commit, focusBlock]);

  const applyMarkdownShortcut = useCallback((id, marker, selection, liveText = null) => {
    const mapping = {
      "#": "heading-1",
      "##": "heading-2",
      "###": "heading-3",
      "####": "heading-4",
      "*": "bullet",
      "-": "bullet",
      "[]": "check",
      "[ ]": "check",
    };
    const type = mapping[marker];
    const createsToggle = marker === ">";
    if (!type && !createsToggle) return false;
    let nextBlock = null;
    commit((next, page) => {
      const block = findBlock(page.blocks, id);
      if (!block) return;
      const previousText = liveText == null ? block.text : liveText;
      const removeLength = marker.length + (previousText[marker.length] === " " ? 1 : 0);
      block.text = previousText.slice(removeLength);
      block.marks = adjustRanges(block.marks, previousText, block.text);
      block.masks = adjustRanges(block.masks, previousText, block.text);
      if (createsToggle) {
        block.toggle = true;
        block.open = true;
      } else {
        block.type = type;
        block.checked = false;
      }
      nextBlock = block;
      page.activeId = id;
    });
    if (nextBlock) {
      editorRefs.current.get(id)?.repaint(nextBlock, { start: 0, end: 0 });
      savedSelectionsRef.current.set(id, { start: 0, end: 0 });
    }
    return true;
  }, [commit]);

  const applyInlineFormat = useCallback((id, kind, type = "") => {
    const editor = editorRefs.current.get(id);
    const selection = editor?.getSelection() || savedSelectionsRef.current.get(id) || { start: 0, end: 0 };
    if (selection.end <= selection.start) return;
    let nextBlock = null;
    commit((next, page) => {
      const block = findBlock(page.blocks, id);
      if (!block) return;
      setRange(block, kind, selection.start, selection.end, type);
      nextBlock = block;
      page.activeId = id;
    });
    if (nextBlock) editor?.repaint(nextBlock, selection);
  }, [commit]);

  const changeBlock = useCallback((id, patch) => {
    let nextBlock = null;
    commit((next, page) => {
      const block = findBlock(page.blocks, id);
      if (!block) return;
      Object.assign(block, patch);
      nextBlock = block;
      page.activeId = id;
    });
    if (nextBlock) requestAnimationFrame(() => editorRefs.current.get(id)?.repaint(nextBlock, savedSelectionsRef.current.get(id)));
    setBlockMenu(null);
  }, [commit]);

  const setColumns = useCallback((id, count) => {
    commit((next, page) => createColumnsAt(page, id, count));
    setBlockMenu(null);
    focusBlock(id, 0);
  }, [commit, focusBlock]);

  const exitColumns = useCallback((id) => {
    commit((next, page) => exitColumnsAt(page, id));
    setBlockMenu(null);
    focusBlock(id, 0);
  }, [commit, focusBlock]);

  const executeSlashCommand = useCallback((id, queryLength, command, liveText = null) => {
    let nextBlock = null;
    commit((next, page) => {
      const block = findBlock(page.blocks, id);
      if (!block) return;
      const previousText = liveText == null ? block.text : liveText;
      block.text = previousText.slice(queryLength);
      block.marks = adjustRanges(block.marks, previousText, block.text);
      block.masks = adjustRanges(block.masks, previousText, block.text);
      if (command.action === "type") block.type = command.value;
      if (command.action === "toggle") {
        block.toggle = true;
        block.open = true;
      }
      if (command.action === "columns") createColumnsAt(page, id, command.value);
      nextBlock = block;
      page.activeId = id;
    });
    if (nextBlock) {
      editorRefs.current.get(id)?.repaint(nextBlock, { start: 0, end: 0 });
    }
    setSlashMenu(null);
  }, [commit]);

  const runSlashCommand = useCallback((command) => {
    if (!slashMenu) return;
    executeSlashCommand(slashMenu.id, slashMenu.queryLength, command);
  }, [executeSlashCommand, slashMenu]);

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu?.query?.trim().toLowerCase() || "";
    return slashCommands.filter((command) => !query || `${command.label} ${command.hint}`.toLowerCase().includes(query));
  }, [slashMenu]);

  useEffect(() => setSlashIndex(0), [slashMenu?.query]);

  const moveFocus = useCallback((id, direction) => {
    const ids = flattenBlocks(activePage.blocks).map(({ block }) => block.id);
    const index = ids.indexOf(id);
    const nextId = ids[index + direction];
    if (!nextId) return false;
    const nextBlock = findBlock(activePage.blocks, nextId);
    focusBlock(nextId, direction < 0 ? nextBlock.text.length : 0);
    return true;
  }, [activePage.blocks, focusBlock]);

  const handleEditorKeyDown = useCallback((event, selection, block) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229 || composingRef.current.has(block.id)) return;
    const commandKey = event.ctrlKey || event.metaKey;
    if (commandKey && event.key === "Enter" && block.toggle) {
      event.preventDefault();
      changeBlock(block.id, { open: !block.open });
      return;
    }
    if (event.key === "Enter") {
      const liveText = editorRefs.current.get(block.id)?.getText() || block.text;
      if (liveText.startsWith("/") && !liveText.includes("\n")) {
        const query = liveText.slice(1).trim().toLowerCase();
        const command = slashCommands.find((item) => item.label.toLowerCase() === query)
          || slashCommands.find((item) => `${item.label} ${item.hint}`.toLowerCase().includes(query));
        if (command) {
          event.preventDefault();
          executeSlashCommand(block.id, liveText.length, command, liveText);
          return;
        }
      }
    }
    if (slashMenu?.id === block.id) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((current) => (current + 1) % Math.max(1, filteredSlashCommands.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex((current) => (current - 1 + Math.max(1, filteredSlashCommands.length)) % Math.max(1, filteredSlashCommands.length));
        return;
      }
      if (event.key === "Enter" && filteredSlashCommands.length) {
        event.preventDefault();
        runSlashCommand(filteredSlashCommands[slashIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenu(null);
        return;
      }
    }
    if (commandKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      setSlashMenu(null);
      setBlockMenu(null);
      if (event.shiftKey) restoreHistory("redo");
      else restoreHistory("undo");
      return;
    }
    if (commandKey && event.key.toLowerCase() === "y") {
      event.preventDefault();
      restoreHistory("redo");
      return;
    }
    if (commandKey && event.key.toLowerCase() === "b") {
      event.preventDefault();
      applyInlineFormat(block.id, "marks", "bold");
      return;
    }
    if (commandKey && event.key.toLowerCase() === "i") {
      event.preventDefault();
      applyInlineFormat(block.id, "marks", "italic");
      return;
    }
    if (commandKey && event.shiftKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      applyInlineFormat(block.id, "masks");
      return;
    }
    if (commandKey && event.key.toLowerCase() === "a") {
      const now = Date.now();
      if (now - selectAllRef.current < 700) {
        event.preventDefault();
        document.activeElement?.blur();
        const allIds = visibleBlocks.map((item) => item.id);
        selectedBlockIdsRef.current = allIds;
        setSelectedBlockIds(allIds);
      }
      selectAllRef.current = now;
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      let changed = false;
      commit((next, page) => { changed = event.shiftKey ? outdentBlock(page, block.id) : indentBlock(page, block.id); });
      if (changed) focusBlock(block.id, selection.start, selection.end);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const location = findBlockLocation(activePage.blocks, block.id);
      if (event.shiftKey && location?.parent && location.parent.type !== "columns") {
        let changed = false;
        commit((next, page) => { changed = outdentBlock(page, block.id); });
        if (changed) focusBlock(block.id, selection.start, selection.end);
      } else if (event.shiftKey) {
        const text = `${block.text.slice(0, selection.start)}\n${block.text.slice(selection.end)}`;
        editorRefs.current.get(block.id)?.replaceText(text, selection.start + 1);
        updateText(block.id, text, { start: selection.start + 1, end: selection.start + 1 });
      } else if (block.toggle) {
        splitIntoToggleChild(block.id, selection.start);
      } else if (!block.text && (["bullet", "check", "quote"].includes(block.type) || block.type.startsWith("heading-"))) {
        changeBlock(block.id, { type: "text", checked: false });
      } else {
        splitBlock(block.id, selection.start);
      }
      return;
    }
    if (event.key === "Backspace" && selection.start === 0 && selection.end === 0) {
      event.preventDefault();
      if (!block.text && (block.type !== "text" || block.toggle)) changeBlock(block.id, { type: "text", toggle: false, checked: false });
      else if (block.text || visibleBlocks.length > 1) mergeBackward(block.id);
      return;
    }
    if (event.key === "ArrowUp" && selection.start === 0 && selection.end === 0) {
      if (moveFocus(block.id, -1)) event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown" && selection.start === block.text.length && selection.end === block.text.length) {
      if (moveFocus(block.id, 1)) event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      selectedBlockIdsRef.current = [block.id];
      setSelectedBlockIds([block.id]);
      setFocusedBlockId("");
      return;
    }
    if (event.key === " " && selection.start === selection.end) {
      const liveText = editorRefs.current.get(block.id)?.getText() || block.text;
      const marker = liveText.slice(0, selection.start);
      if (["#", "##", "###", "####", "*", "-", "[]", "[ ]", ">"].includes(marker)) {
        event.preventDefault();
        applyMarkdownShortcut(block.id, marker, selection, liveText);
      }
    }
  }, [activePage.blocks, applyInlineFormat, applyMarkdownShortcut, changeBlock, commit, executeSlashCommand, filteredSlashCommands, focusBlock, mergeBackward, moveFocus, restoreHistory, runSlashCommand, slashIndex, slashMenu, splitBlock, splitIntoToggleChild, updateText, visibleBlocks]);

  const handleBlockInput = useCallback((block, text, selection) => {
    const shortcut = text.slice(0, selection.start).match(/^(#{1,4}|\*|-|\[\]|\[ \]|>) $/);
    if (shortcut && applyMarkdownShortcut(block.id, shortcut[1], selection, text)) return;
    updateText(block.id, text, selection);
    savedSelectionsRef.current.set(block.id, selection);
    const prefix = text.slice(0, selection.start);
    if (prefix.startsWith("/") && !prefix.includes("\n") && !prefix.slice(1).includes("/")) {
      const rect = editorRefs.current.get(block.id)?.getSelection ? document.querySelector(`[data-mf2-id="${block.id}"]`)?.getBoundingClientRect() : null;
      setSlashMenu({
        id: block.id,
        query: prefix.slice(1),
        queryLength: prefix.length,
        left: rect ? Math.min(rect.left + 34, window.innerWidth - 310) : 80,
        top: rect ? Math.min(rect.bottom + 4, window.innerHeight - 360) : 120,
      });
    } else if (slashMenu?.id === block.id) {
      setSlashMenu(null);
    }
  }, [applyMarkdownShortcut, slashMenu?.id, updateText]);

  const selectBlock = useCallback((id, event) => {
    const ids = visibleBlocks.map((block) => block.id);
    setSelectedBlockIds((current) => {
      let next;
      if (event.shiftKey && current.length) {
        const anchor = ids.indexOf(current[current.length - 1]);
        const target = ids.indexOf(id);
        if (anchor >= 0 && target >= 0) next = ids.slice(Math.min(anchor, target), Math.max(anchor, target) + 1);
      }
      if (!next && (event.ctrlKey || event.metaKey)) next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next) next = [id];
      selectedBlockIdsRef.current = next;
      return next;
    });
    setFocusedBlockId("");
    document.activeElement?.blur();
  }, [visibleBlocks]);

  const beginBlockDrag = useCallback((event, id, fromEditor = false, fromHandle = false) => {
    if (event.button !== 0 || (event.target.closest("button") && !fromHandle)) return;
    if (fromEditor && event.pointerType === "touch") return;
    if (!fromEditor) event.preventDefault();
    const movingIds = selectedBlockIds.includes(id) ? selectedBlockIds : [id];
    const sourceRect = event.currentTarget.closest("[data-mf2-id]")?.getBoundingClientRect();
    const previewWidth = Math.min(Math.max(sourceRect?.width || 280, 180), 460, window.innerWidth - 24);
    const captureTarget = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      captureTarget.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is an enhancement; window listeners remain the fallback.
    }
    const selectionEvent = {
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    };
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      movingIds,
      active: false,
      fromEditor,
      fromHandle,
      captureTarget,
      pointerId,
      previewWidth,
      target: null,
    };

    const move = (pointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      if (!state.active) {
        const deltaX = pointerEvent.clientX - state.startX;
        const deltaY = pointerEvent.clientY - state.startY;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < 4) return;

        state.active = true;
        pointerEvent.preventDefault();
        window.getSelection()?.removeAllRanges();
        document.activeElement?.blur();
        setFocusedBlockId("");
        setBlockMenu(null);
        setSlashMenu(null);
        selectedBlockIdsRef.current = state.movingIds;
        setSelectedBlockIds(state.movingIds);
        document.body.classList.add("mf2-dragging");
      }
      const targetElement = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest?.("[data-mf2-id]");
      const targetId = targetElement?.dataset.mf2Id || "";
      if (!targetId || state.movingIds.includes(targetId)) {
        state.target = null;
        setDragState({ movingIds: state.movingIds, previewWidth: state.previewWidth, target: null, x: pointerEvent.clientX, y: pointerEvent.clientY });
        return;
      }
      const rowElement = targetElement.querySelector(":scope > .mf2-block-row") || targetElement;
      const rect = rowElement.getBoundingClientRect();
      const verticalPosition = clamp((pointerEvent.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const placement = verticalPosition < 0.25
        ? "before"
        : verticalPosition > 0.75 ? "after" : "inside";
      state.target = { id: targetId, placement };
      setDragState({ movingIds: state.movingIds, previewWidth: state.previewWidth, target: state.target, x: pointerEvent.clientX, y: pointerEvent.clientY });
    };
    const end = (pointerEvent) => {
      const state = dragRef.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.classList.remove("mf2-dragging");
      if (state?.captureTarget?.hasPointerCapture?.(state.pointerId)) {
        state.captureTarget.releasePointerCapture(state.pointerId);
      }
      dragRef.current = null;
      setDragState(null);
      if (state?.active && state.fromHandle) {
        suppressMenuClickRef.current = { id, until: Date.now() + 350 };
      }
      if (pointerEvent.type !== "pointercancel" && state?.active && state.target) {
        commit((next, page) => moveBlocks(page, state.movingIds, state.target.id, state.target.placement));
      } else if (pointerEvent.type !== "pointercancel" && state && !state.fromEditor) {
        selectBlock(id, selectionEvent);
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }, [activePage.blocks, commit, selectBlock, selectedBlockIds]);

  const beginMarquee = useCallback((event) => {
    if (event.button !== 0 || event.target.closest(".mf2-block-shell, .mf2-page-sidebar, button, input, .mf2-floating-menu")) return;
    document.activeElement?.blur();
    setFocusedBlockId("");
    setBlockMenu(null);
    setSlashMenu(null);
    const start = { x: event.clientX, y: event.clientY };
    marqueeRef.current = { start, additive: event.ctrlKey || event.metaKey, original: selectedBlockIds, active: false };
    const move = (pointerEvent) => {
      const state = marqueeRef.current;
      if (!state) return;
      if (!state.active && Math.hypot(pointerEvent.clientX - start.x, pointerEvent.clientY - start.y) < 5) return;
      state.active = true;
      const selection = {
        left: Math.min(start.x, pointerEvent.clientX),
        right: Math.max(start.x, pointerEvent.clientX),
        top: Math.min(start.y, pointerEvent.clientY),
        bottom: Math.max(start.y, pointerEvent.clientY),
      };
      setMarquee(selection);
      const hits = [...document.querySelectorAll(".mf2-block-shell[data-mf2-id]")]
        .filter((element) => selectionIntersects(element.getBoundingClientRect(), selection))
        .map((element) => element.dataset.mf2Id);
      const nextSelection = state.additive ? [...new Set([...state.original, ...hits])] : hits;
      selectedBlockIdsRef.current = nextSelection;
      setSelectedBlockIds(nextSelection);
    };
    const end = () => {
      const state = marqueeRef.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      marqueeRef.current = null;
      setMarquee(null);
      if (!state?.active && !state?.additive) {
        selectedBlockIdsRef.current = [];
        setSelectedBlockIds([]);
        const lastBlock = visibleBlocks.at(-1);
        if (lastBlock) focusBlock(lastBlock.id, lastBlock.text.length);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }, [focusBlock, selectedBlockIds, visibleBlocks]);

  useEffect(() => {
    const handleNativeSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const getShell = (node) => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest?.(".mf2-block-shell[data-mf2-id]");
      const anchorShell = getShell(selection.anchorNode);
      const focusShell = getShell(selection.focusNode);
      if (!anchorShell || !focusShell || anchorShell === focusShell) return;
      const ids = visibleBlocks.map((block) => block.id);
      const anchorIndex = ids.indexOf(anchorShell.dataset.mf2Id);
      const focusIndex = ids.indexOf(focusShell.dataset.mf2Id);
      if (anchorIndex < 0 || focusIndex < 0) return;
      const nextSelection = ids.slice(Math.min(anchorIndex, focusIndex), Math.max(anchorIndex, focusIndex) + 1);
      selectedBlockIdsRef.current = nextSelection;
      setSelectedBlockIds(nextSelection);
    };
    document.addEventListener("selectionchange", handleNativeSelection);
    return () => document.removeEventListener("selectionchange", handleNativeSelection);
  }, [visibleBlocks]);

  useEffect(() => {
    const handleGlobalKeys = (event) => {
      const selectedIds = selectedBlockIdsRef.current;
      if (!selectedIds.length) return;
      const eventTarget = event.target instanceof Element ? event.target : null;
      const editableTarget = eventTarget?.closest("input, textarea, select, button, [contenteditable='true']");
      const blockControl = eventTarget?.closest(".mf2-block-shell");
      if (editableTarget && !eventTarget.closest(".mf2-rich-editor") && !blockControl) return;
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) restoreHistory("redo");
        else restoreHistory("undo");
      } else if (commandKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        restoreHistory("redo");
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        event.stopPropagation();
        deleteSelected();
      } else if (event.key === "Escape") {
        event.preventDefault();
        selectedBlockIdsRef.current = [];
        setSelectedBlockIds([]);
      } else if (commandKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selectedSet = new Set(selectedIds);
        const sourceBlocks = flattenBlocks(activePage.blocks, { includeClosed: true })
          .map(({ block }) => block)
          .filter((block) => selectedSet.has(block.id));
        let newIds = [];
        commit((next, page) => {
          sourceBlocks.forEach((source) => {
            const target = findBlockLocation(page.blocks, source.id);
            if (!target) return;
            const copy = duplicateBlockTree(source);
            target.siblings.splice(target.index + 1, 0, copy);
            newIds.push(copy.id);
          });
        });
        selectedBlockIdsRef.current = newIds;
        setSelectedBlockIds(newIds);
      } else if (commandKey && event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const ids = visibleBlocks.map((block) => block.id);
        const selectedIndexes = selectedIds.map((id) => ids.indexOf(id)).filter((index) => index >= 0);
        const boundary = event.key === "ArrowUp" ? Math.min(...selectedIndexes) - 1 : Math.max(...selectedIndexes) + 1;
        const targetId = ids[boundary];
        if (targetId) commit((next, page) => moveBlocks(page, selectedIds, targetId, event.key === "ArrowUp" ? "before" : "after"));
      }
    };
    document.addEventListener("keydown", handleGlobalKeys, true);
    return () => document.removeEventListener("keydown", handleGlobalKeys, true);
  }, [activePage.blocks, commit, deleteSelected, restoreHistory, visibleBlocks]);

  const openBlockMenu = useCallback((event, id) => {
    event.preventDefault();
    event.stopPropagation();
    const suppressed = suppressMenuClickRef.current;
    if (suppressed.id === id && Date.now() < suppressed.until) {
      suppressMenuClickRef.current = { id: "", until: 0 };
      return;
    }
    const row = event.currentTarget.closest(".mf2-block-row");
    const rect = row.getBoundingClientRect();
    const width = 292;
    setBlockMenu((current) => current?.id === id ? null : {
      id,
      left: clamp(rect.left + 26, 10, window.innerWidth - width - 10),
      top: clamp(rect.top + 30, 10, window.innerHeight - 560),
    });
    setSlashMenu(null);
  }, []);

  const addPage = useCallback(() => {
    let id = "";
    let firstBlockId = "";
    commit((next) => {
      const page = createPage(next.tabs.length);
      id = page.id;
      firstBlockId = page.activeId;
      next.tabs.push(page);
      next.activeTabId = id;
    });
    setSidebarOpen(true);
    focusBlock(firstBlockId, 0);
    return id;
  }, [commit, focusBlock]);

  const setActivePage = useCallback((id) => {
    commit((next) => { if (next.tabs.some((page) => page.id === id)) next.activeTabId = id; }, { captureHistory: false });
  }, [commit]);

  const savePageLabel = useCallback(() => {
    if (!editingPageId) return;
    commit((next) => {
      const page = next.tabs.find((item) => item.id === editingPageId);
      if (page) page.label = editingPageLabel.trim().slice(0, 40) || "이름 없는 페이지";
    });
    setEditingPageId("");
  }, [commit, editingPageId, editingPageLabel]);

  const removePage = useCallback((id) => {
    if (documentState.tabs.length <= 1) return;
    const page = documentState.tabs.find((item) => item.id === id);
    if (!window.confirm(`'${page?.label || "페이지"}'을 휴지통으로 이동하시겠습니까?`)) return;
    commit((next) => {
      const index = next.tabs.findIndex((item) => item.id === id);
      if (index < 0 || next.tabs.length <= 1) return;
      const [removed] = next.tabs.splice(index, 1);
      next.trash.push({ ...removed, deletedAt: new Date().toISOString() });
      if (next.activeTabId === id) next.activeTabId = next.tabs[Math.min(index, next.tabs.length - 1)].id;
    });
  }, [commit, documentState.tabs]);

  const restorePage = useCallback((id) => {
    commit((next) => {
      const index = next.trash.findIndex((page) => page.id === id);
      if (index < 0) return;
      const [page] = next.trash.splice(index, 1);
      delete page.deletedAt;
      next.tabs.push(page);
      next.activeTabId = page.id;
    });
  }, [commit]);

  const permanentlyRemovePage = useCallback((id) => {
    const page = documentState.trash.find((item) => item.id === id);
    if (!page || !window.confirm(`'${page.label}'을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    commit((next) => { next.trash = next.trash.filter((item) => item.id !== id); });
  }, [commit, documentState.trash]);

  const movePage = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    commit((next) => {
      const fromIndex = next.tabs.findIndex((page) => page.id === fromId);
      const toIndex = next.tabs.findIndex((page) => page.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const [moving] = next.tabs.splice(fromIndex, 1);
      next.tabs.splice(toIndex, 0, moving);
    });
  }, [commit]);

  const renderBlock = (block, depth = 0) => {
    if (block.type === "columns") {
      return (
        <div className={`mf2-columns mf2-columns-${block.columns}`} data-mf2-layout={block.id} key={block.id}>
          {Array.from({ length: block.columns }, (_, column) => {
            const laneBlocks = block.children.filter((child) => child.column === column);
            return (
              <div
                className="mf2-column"
                data-column={column}
                key={column}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  const lastBlock = laneBlocks.at(-1);
                  if (lastBlock) focusBlock(lastBlock.id, lastBlock.text.length);
                }}
              >
                {laneBlocks.map((child) => renderBlock(child, depth))}
              </div>
            );
          })}
        </div>
      );
    }
    const selected = selectedBlockIds.includes(block.id);
    const drop = dragState?.target?.id === block.id ? dragState.target.placement : "";
    return (
      <div
        className={`mf2-block-shell type-${block.type} ${selected ? "is-selected" : ""} ${focusedBlockId === block.id ? "is-focused" : ""} ${block.toggle ? "is-toggle" : ""} ${block.checked ? "is-checked" : ""} ${drop ? `drop-${drop}` : ""}`}
        data-mf2-id={block.id}
        key={block.id}
        style={{ "--mf2-depth": depth, "--mf2-color": TEXT_COLORS[block.color] }}
      >
        <div className="mf2-block-row">
          <div className="mf2-gutter" onPointerDown={(event) => beginBlockDrag(event, block.id)}>
            <button className="mf2-menu-button" onClick={(event) => openBlockMenu(event, block.id)} onPointerDown={(event) => beginBlockDrag(event, block.id, false, true)} title="블록 메뉴" type="button">
              <span aria-hidden="true" />
            </button>
          </div>
          {block.toggle ? (
            <button className={`mf2-toggle-button ${block.open ? "open" : ""}`} onClick={() => changeBlock(block.id, { open: !block.open })} title={block.open ? "접기" : "펼치기"} type="button" aria-label={block.open ? "접기" : "펼치기"}>
              <span aria-hidden="true" />
            </button>
          ) : block.type === "check" ? (
            <button className={`mf2-check-button ${block.checked ? "checked" : ""}`} onClick={() => changeBlock(block.id, { checked: !block.checked })} title={block.checked ? "체크 해제" : "완료"} type="button" aria-label={block.checked ? "체크 해제" : "완료"}>
              <span aria-hidden="true">✓</span>
            </button>
          ) : block.type === "bullet" ? <span className="mf2-bullet" aria-hidden="true">•</span> : null}
          <RichEditor
            block={block}
            onBlur={() => setFocusedBlockId((current) => current === block.id ? "" : current)}
            onCompositionEnd={() => composingRef.current.delete(block.id)}
            onCompositionStart={() => composingRef.current.add(block.id)}
            onFocus={() => {
              setFocusedBlockId(block.id);
              selectedBlockIdsRef.current = [];
              setSelectedBlockIds([]);
              setBlockMenu(null);
            }}
            onInput={(text, selection) => handleBlockInput(block, text, selection)}
            onKeyDown={(event, selection) => handleEditorKeyDown(event, selection, block)}
            onPointerDown={(event) => beginBlockDrag(event, block.id, true)}
            onSelectionChange={(selection) => savedSelectionsRef.current.set(block.id, selection)}
            ariaLabel="블록 내용"
            ref={(api) => {
              if (api) editorRefs.current.set(block.id, api);
              else editorRefs.current.delete(block.id);
            }}
          />
        </div>
        {block.children.length && (!block.toggle || block.open) ? (
          <div className="mf2-children">{block.children.map((child) => renderBlock(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  const menuBlock = blockMenu ? findBlock(activePage.blocks, blockMenu.id) : null;
  const menuLocation = menuBlock ? findBlockLocation(activePage.blocks, menuBlock.id) : null;
  const dragPreviewBlocks = dragState
    ? dragState.movingIds.map((id) => findBlock(activePage.blocks, id)).filter(Boolean)
    : [];
  const dragPreviewStyle = dragState ? {
    left: clamp(dragState.x + 14, 12, window.innerWidth - dragState.previewWidth - 12),
    top: clamp(dragState.y + 12, 12, window.innerHeight - 76),
    width: dragState.previewWidth,
  } : undefined;

  return (
    <section className={`mf2-view ${sidebarOpen ? "sidebar-open" : ""}`}>
      <button className="mf2-sidebar-open" onClick={() => setSidebarOpen(true)} title="페이지 열기" type="button" aria-label="페이지 열기">
        <span aria-hidden="true">☰</span>
      </button>

      <aside className="mf2-page-sidebar" aria-hidden={!sidebarOpen}>
        <header className="mf2-sidebar-header">
          <strong>Mindfold</strong>
          <button onClick={() => setSidebarOpen(false)} title="사이드바 닫기" type="button" aria-label="사이드바 닫기">×</button>
        </header>
        <nav className="mf2-page-list" aria-label="페이지">
          {documentState.tabs.map((page) => (
            <div
              className={`mf2-page-item ${page.id === activePage.id ? "active" : ""}`}
              draggable={editingPageId !== page.id}
              key={page.id}
              onDragStart={(event) => event.dataTransfer.setData("text/mindfold-page", page.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                movePage(event.dataTransfer.getData("text/mindfold-page"), page.id);
              }}
            >
              {editingPageId === page.id ? (
                <input
                  autoFocus
                  maxLength={40}
                  onBlur={savePageLabel}
                  onChange={(event) => setEditingPageLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") savePageLabel();
                    if (event.key === "Escape") setEditingPageId("");
                  }}
                  value={editingPageLabel}
                />
              ) : (
                <button className="mf2-page-name" onClick={() => setActivePage(page.id)} type="button">{page.label}</button>
              )}
              <span className="mf2-page-actions">
                <button onClick={() => { setEditingPageId(page.id); setEditingPageLabel(page.label); }} title="이름 바꾸기" type="button" aria-label="이름 바꾸기">✎</button>
                <button disabled={documentState.tabs.length <= 1} onClick={() => removePage(page.id)} title="휴지통으로 이동" type="button" aria-label="휴지통으로 이동">×</button>
              </span>
            </div>
          ))}
        </nav>
        <button className="mf2-add-page" onClick={addPage} type="button"><span aria-hidden="true">+</span> 페이지</button>
        <div className={`mf2-trash ${trashOpen ? "open" : ""}`}>
          <button className="mf2-trash-toggle" onClick={() => setTrashOpen((current) => !current)} type="button">
            <span>휴지통</span><small>{documentState.trash.length}</small>
          </button>
          {trashOpen ? (
            <div className="mf2-trash-list">
              {documentState.trash.length ? documentState.trash.map((page) => {
                const days = Math.max(1, Math.ceil((MINDFOLD_TRASH_MS - (Date.now() - Date.parse(page.deletedAt))) / (24 * 60 * 60 * 1000)));
                return (
                  <div className="mf2-trash-item" key={page.id}>
                    <span><strong>{page.label}</strong><small>{days}일 후 삭제</small></span>
                    <span><button onClick={() => restorePage(page.id)} type="button">복원</button><button className="danger" onClick={() => permanentlyRemovePage(page.id)} type="button">삭제</button></span>
                  </div>
                );
              }) : <p>{MINDFOLD_TRASH_DAYS}일 동안 삭제한 페이지가 없습니다.</p>}
            </div>
          ) : null}
        </div>
      </aside>
      {sidebarOpen ? <button className="mf2-sidebar-backdrop" onClick={() => setSidebarOpen(false)} type="button" aria-label="사이드바 닫기" /> : null}

      <article className="mf2-canvas" onPointerDown={beginMarquee} ref={canvasRef}>
        <div className="mf2-document">{activePage.blocks.map((block) => renderBlock(block))}</div>
      </article>

      {marquee ? <div className="mf2-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top }} /> : null}

      {dragPreviewBlocks.length ? (
        <div className={`mf2-drag-preview ${dragPreviewBlocks.length > 1 ? "is-multiple" : ""}`} style={dragPreviewStyle} aria-hidden="true">
          {dragPreviewBlocks.slice(0, 3).map((block) => (
            <div className={`mf2-drag-preview-block type-${block.type}`} key={block.id} style={{ "--mf2-preview-color": TEXT_COLORS[block.color] }}>
              {block.text || "빈 블록"}
            </div>
          ))}
          {dragPreviewBlocks.length > 1 ? <small>{dragPreviewBlocks.length}개 블록</small> : null}
        </div>
      ) : null}

      {menuBlock && blockMenu ? (
        <div className="mf2-floating-menu mf2-block-menu" role="menu" style={{ left: blockMenu.left, top: blockMenu.top }}>
          <p>블록</p>
          <div className="mf2-type-grid">
            {BLOCK_TYPE_OPTIONS.map((option) => (
              <button className={menuBlock.type === option.type ? "active" : ""} key={option.type} onClick={() => changeBlock(menuBlock.id, { type: option.type, checked: option.type === "check" ? menuBlock.checked : false })} type="button">
                <strong>{option.type.startsWith("heading") ? `H${option.type.at(-1)}` : option.type === "text" ? "T" : option.type === "bullet" ? "•" : option.type === "check" ? "✓" : option.type === "quote" ? "“" : "!"}</strong>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <div className="mf2-menu-row">
            <button className={menuBlock.toggle ? "active" : ""} onClick={() => changeBlock(menuBlock.id, { toggle: !menuBlock.toggle, open: true })} type="button">토글</button>
            <button onClick={() => applyInlineFormat(menuBlock.id, "marks", "bold")} type="button"><strong>B</strong></button>
            <button onClick={() => applyInlineFormat(menuBlock.id, "marks", "italic")} type="button"><em>I</em></button>
            <button onClick={() => applyInlineFormat(menuBlock.id, "masks")} type="button">마스킹</button>
          </div>
          <p>글자 색상</p>
          <div className="mf2-color-grid">
            {TEXT_COLOR_OPTIONS.map((color) => (
              <button className={menuBlock.color === color.id ? "active" : ""} key={color.id} onClick={() => changeBlock(menuBlock.id, { color: color.id })} style={{ "--swatch": color.value }} title={color.label} type="button" aria-label={color.label} />
            ))}
          </div>
          <p>구조</p>
          <div className="mf2-menu-row">
            {[2, 3, 4].map((count) => <button key={count} onClick={() => setColumns(menuBlock.id, count)} type="button">{count}열</button>)}
            {menuLocation?.parent?.type === "columns" ? <button onClick={() => exitColumns(menuBlock.id)} type="button">열 끝내기</button> : null}
          </div>
          <div className="mf2-menu-row mf2-menu-danger-row">
            <button onClick={() => { setBlockMenu(null); deleteBlocksById([menuBlock.id]); }} type="button">블록 삭제</button>
          </div>
        </div>
      ) : null}

      {slashMenu ? (
        <div className="mf2-floating-menu mf2-slash-menu" role="listbox" style={{ left: slashMenu.left, top: slashMenu.top }}>
          <p>블록으로 바꾸기</p>
          {filteredSlashCommands.length ? filteredSlashCommands.map((command, index) => (
            <button className={index === slashIndex ? "active" : ""} key={command.id} onPointerDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(command)} role="option" type="button">
              <strong>{command.label}</strong><span>{command.hint}</span>
            </button>
          )) : <span className="mf2-no-command">일치하는 명령이 없습니다.</span>}
        </div>
      ) : null}
    </section>
  );
}
