import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TEXT_COLORS } from "./model.js";

function getSelectionOffsets(root) {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
    return { start: 0, end: 0 };
  }
  const offsetFrom = (node, offset) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  };
  const anchor = offsetFrom(selection.anchorNode, selection.anchorOffset);
  const focus = offsetFrom(selection.focusNode, selection.focusOffset);
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

function setSelectionOffsets(root, start, end = start) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries = [];
  let length = 0;
  while (walker.nextNode()) {
    entries.push({ node: walker.currentNode, start: length });
    length += walker.currentNode.textContent.length;
  }
  if (!entries.length) {
    const text = document.createTextNode("");
    root.appendChild(text);
    entries.push({ node: text, start: 0 });
  }
  const resolve = (value) => {
    const offset = Math.max(0, Math.min(length, Number(value) || 0));
    for (const entry of entries) {
      const nodeLength = entry.node.textContent.length;
      if (offset <= entry.start + nodeLength) return { node: entry.node, offset: offset - entry.start };
    }
    const last = entries[entries.length - 1].node;
    return { node: last, offset: last.textContent.length };
  };
  const from = resolve(start);
  const to = resolve(end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function getElementOffsets(root, element) {
  if (!root || !element || !root.contains(element)) return null;
  const startRange = document.createRange();
  startRange.selectNodeContents(root);
  startRange.setEndBefore(element);
  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.setEndAfter(element);
  return { start: startRange.toString().length, end: endRange.toString().length };
}

function paintEditor(root, block, selectionRange = null) {
  if (!root) return;
  const boundaries = new Set([0, block.text.length]);
  [...block.marks, ...block.masks].forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });
  if (selectionRange) {
    boundaries.add(selectionRange.start);
    boundaries.add(selectionRange.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const text = block.text.slice(start, end);
    const markTypes = block.marks.filter((mark) => mark.start <= start && mark.end >= end).map((mark) => mark.type);
    const colorType = markTypes.findLast((type) => type.startsWith("color-"));
    const masked = block.masks.some((mask) => mask.start <= start && mask.end >= end);
    const selected = Boolean(selectionRange && selectionRange.start <= start && selectionRange.end >= end);
    if (!markTypes.length && !masked && !selected) {
      fragment.appendChild(document.createTextNode(text));
      continue;
    }
    const span = document.createElement("span");
    span.textContent = text;
    if (markTypes.includes("bold")) span.classList.add("mf2-inline-bold");
    if (markTypes.includes("italic")) span.classList.add("mf2-inline-italic");
    if (masked) span.classList.add("mf2-mask");
    if (selected) span.classList.add("mf2-cross-selection");
    if (colorType) span.style.color = TEXT_COLORS[colorType.slice("color-".length)] || "";
    fragment.appendChild(span);
  }
  root.replaceChildren(fragment);
}

const RichEditor = forwardRef(function RichEditor({
  ariaLabel = "블록 내용",
  block,
  onBlur,
  onCompositionEnd,
  onCompositionStart,
  onFocus,
  onInput,
  onKeyDown,
  onContextMenu,
  onPointerDown,
  onSelectionChange,
  selectionRange = null,
}, forwardedRef) {
  const rootRef = useRef(null);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const blockRef = useRef(block);
  const selectionRangeRef = useRef(selectionRange);
  blockRef.current = block;
  selectionRangeRef.current = selectionRange;

  useImperativeHandle(forwardedRef, () => ({
    focusAt(offset, end = offset) {
      const root = rootRef.current;
      if (!root) return;
      if (root.textContent !== blockRef.current.text) paintEditor(root, blockRef.current, selectionRangeRef.current);
      root.focus({ preventScroll: true });
      setSelectionOffsets(root, offset, end);
      root.scrollIntoView({ block: "nearest" });
    },
    getSelection() {
      return getSelectionOffsets(rootRef.current);
    },
    getText() {
      return rootRef.current?.textContent || "";
    },
    repaint(nextBlock, selection = null) {
      const root = rootRef.current;
      if (!root) return;
      paintEditor(root, nextBlock || blockRef.current, selectionRangeRef.current);
      if (selection) setSelectionOffsets(root, selection.start, selection.end);
    },
    replaceText(text, offset = text.length) {
      const root = rootRef.current;
      if (!root) return;
      root.textContent = text;
      setSelectionOffsets(root, offset);
    },
  }), []);

  useEffect(() => {
    if (!focusedRef.current || selectionRange) paintEditor(rootRef.current, block, selectionRange);
  }, [block.text, block.marks, block.masks, block.type, selectionRange]);

  useEffect(() => {
    const updateSelection = () => {
      if (!focusedRef.current || composingRef.current) return;
      onSelectionChange?.(getSelectionOffsets(rootRef.current));
    };
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, [onSelectionChange]);

  return (
    <div
      aria-label={ariaLabel}
      className="mf2-rich-editor"
      contentEditable
      onBlur={(event) => {
        focusedRef.current = false;
        paintEditor(event.currentTarget, blockRef.current, selectionRangeRef.current);
        onBlur?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        onCompositionEnd?.(event);
        onInput?.(event.currentTarget.textContent || "", getSelectionOffsets(event.currentTarget));
      }}
      onCompositionStart={(event) => {
        composingRef.current = true;
        onCompositionStart?.(event);
      }}
      onDragStart={(event) => event.preventDefault()}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onInput={(event) => {
        if (!composingRef.current) onInput?.(event.currentTarget.textContent || "", getSelectionOffsets(event.currentTarget));
      }}
      onKeyDown={(event) => onKeyDown?.(event, getSelectionOffsets(event.currentTarget))}
      onContextMenu={(event) => {
        const maskedElement = event.target.closest?.(".mf2-mask");
        onContextMenu?.(event, getSelectionOffsets(event.currentTarget), getElementOffsets(event.currentTarget, maskedElement));
      }}
      onPointerDown={onPointerDown}
      ref={rootRef}
      role="textbox"
      spellCheck
      suppressContentEditableWarning
    />
  );
});

export default RichEditor;
