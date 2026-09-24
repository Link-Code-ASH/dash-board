import React, { useEffect, useRef } from "react";
import { adjustRanges } from "./mindfold/model.js";

export const memoColors = { red: "#c53636", blue: "#2563bd", green: "#23794b", orange: "#bc570c" };
const MEMO_DIVIDER = "\uFFFC";

function cleanMemoRanges(text, ranges) {
  return ranges.filter((range) => range.type !== "divider" || text.slice(range.start, range.end) === MEMO_DIVIDER);
}

function selectionIsFullyFormatted(ranges, start, end, type) {
  let coveredUntil = start;
  for (const range of ranges.filter(range => range.type === type).sort((a, b) => a.start - b.start)) {
    if (range.start > coveredUntil) break;
    if (range.end > coveredUntil) coveredUntil = range.end;
    if (coveredUntil >= end) return true;
  }
  return false;
}

function caretRangeAtPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const position = document.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

export function MemoFormatToolbar() {
  const apply = (format) => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const editor = (node?.nodeType === 1 ? node : node?.parentElement)?.closest(".memo-rich-editor");
    editor?.dispatchEvent(new CustomEvent("memo-format", { detail: format }));
  };
  return <div className="memo-format-toolbar" role="toolbar" aria-label="메모 텍스트 서식" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <button className="memo-format-button memo-format-bold" type="button" title="굵게" aria-label="굵게" onClick={() => apply("bold")}><b>B</b></button>
    <span className="memo-format-divider" aria-hidden="true" />
    {Object.entries(memoColors).map(([key, color], index) => <button className={`memo-format-button memo-format-color ${key}`} type="button" key={key} title={["빨강", "파랑", "초록", "주황"][index]} aria-label={["빨강", "파랑", "초록", "주황"][index]} onClick={() => apply(key)}><span style={{ "--memo-ink": color }} /></button>)}
    <span className="memo-format-divider" aria-hidden="true" />
    <button className="memo-format-button memo-insert-divider" type="button" title="가로 구분선 삽입" aria-label="가로 구분선 삽입" onClick={() => apply("divider")}><span aria-hidden="true" /></button>
  </div>;
}

export default function MemoEditor({ value, marks = [], onChange, getSelection, setSelection }) {
  const root = useRef(null);
  const current = useRef({ value, marks });
  const composing = useRef(false);
  const pendingCompositionEnter = useRef(false);
  const pan = useRef(null);
  const positionTrack = useRef(null);
  current.current = { value, marks };
  const updatePosition = () => {
    const el = root.current;
    const track = positionTrack.current;
    if (!el || !track) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    track.style.opacity = maxScroll > 1 ? "1" : "0";
    if (maxScroll <= 1) return;
    const thumb = track.firstElementChild;
    const height = Math.min(track.clientHeight, Math.max(24, track.clientHeight * el.clientHeight / el.scrollHeight));
    thumb.style.height = `${height}px`;
    thumb.style.top = `${(track.clientHeight - height) * el.scrollTop / maxScroll}px`;
  };
  const paint = (text, ranges, selection) => {
    const el = root.current;
    const points = [...new Set([0, text.length, ...ranges.flatMap(r => [r.start, r.end])])].filter(n => n >= 0 && n <= text.length).sort((a,b) => a-b);
    const fragment = document.createDocumentFragment();
    points.slice(0,-1).forEach((start, i) => {
      const span = document.createElement("span");
      const active = ranges.filter(r => r.start <= start && r.end >= points[i+1]);
      span.textContent = text.slice(start, points[i+1]);
      if (active.some(range => range.type === "divider") && span.textContent === MEMO_DIVIDER) {
        span.className = "memo-divider-node";
        span.contentEditable = "false";
        span.title = "구분선";
        const remove = document.createElement("button");
        remove.className = "memo-divider-remove";
        remove.type = "button";
        remove.title = "구분선 제거";
        remove.setAttribute("aria-label", "구분선 제거");
        span.append(remove);
        fragment.append(span);
        return;
      }
      const isBold = active.some(range => range.type === "bold");
      const colorType = active.findLast(range => memoColors[range.type])?.type;
      span.className = `memo-rich-fragment${isBold ? " is-bold" : ""}`;
      span.style.color = colorType ? memoColors[colorType] : "";
      fragment.append(span);
    });
    if (text.endsWith("\n")) {
      const trailingBreak = document.createElement("br");
      trailingBreak.className = "memo-trailing-break";
      fragment.append(trailingBreak);
    }
    el.replaceChildren(fragment);
    if (selection) setSelection(el, selection.start, selection.end);
    updatePosition();
  };
  useEffect(() => {
    const observer = new ResizeObserver(updatePosition);
    observer.observe(root.current);
    observer.observe(positionTrack.current);
    updatePosition();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (composing.current) return;
    const selection = document.activeElement === root.current ? getSelection(root.current) : null;
    paint(value, marks, selection);
  }, [value, marks]);
  useEffect(() => {
    const el = root.current;
    const format = (event) => {
      const { start, end } = getSelection(el);
      const { value: text, marks: ranges } = current.current;
      const type = event.detail;
      if (type === "divider") {
        const before = text.slice(0, start);
        const after = text.slice(end);
        const prefix = before && !before.endsWith("\n") ? "\n" : "";
        const suffix = after.startsWith("\n") ? "" : "\n";
        const insertion = `${prefix}${MEMO_DIVIDER}${suffix}`;
        const dividerStart = start + prefix.length;
        const nextText = before + insertion + after;
        const nextRanges = cleanMemoRanges(nextText, [
          ...adjustRanges(ranges, text, nextText),
          { start: dividerStart, end: dividerStart + 1, type: "divider" },
        ]);
        const caret = dividerStart + 2;
        el.focus();
        paint(nextText, nextRanges, { start: caret, end: caret });
        onChange(nextText, nextRanges);
        return;
      }
      if (start === end) return;
      const remove = selectionIsFullyFormatted(ranges, start, end, type);
      const clearsType = type === "bold"
        ? (range) => range.type === "bold"
        : (range) => Boolean(memoColors[range.type]);
      const next = ranges.flatMap(r => {
        if (!clearsType(r) || r.end <= start || r.start >= end) return [r];
        return [...(r.start < start ? [{ ...r, end: start }] : []), ...(r.end > end ? [{ ...r, start: end }] : [])];
      });
      if (!remove) next.push({ start, end, type });
      el.focus();
      paint(text, next, { start, end });
      onChange(text, next);
    };
    el.addEventListener("memo-format", format);
    return () => el.removeEventListener("memo-format", format);
  }, [onChange]);
  const input = () => {
    const text = root.current.textContent || "";
    onChange(text, cleanMemoRanges(text, adjustRanges(current.current.marks, current.current.value, text)));
  };
  const finishComposition = () => {
    composing.current = false;
    const el = root.current;
    const text = el.textContent || "";
    const selection = getSelection(el);
    const ranges = cleanMemoRanges(text, adjustRanges(current.current.marks, current.current.value, text));
    if (!pendingCompositionEnter.current) {
      onChange(text, ranges);
      return;
    }
    pendingCompositionEnter.current = false;
    const next = text.slice(0, selection.start) + "\n" + text.slice(selection.end);
    const nextRanges = cleanMemoRanges(next, adjustRanges(ranges, text, next));
    const caret = selection.start + 1;
    paint(next, nextRanges, { start: caret, end: caret });
    onChange(next, nextRanges);
  };
  const insert = (text) => {
    const el = root.current;
    const { start, end } = getSelection(el);
    const old = current.current;
    const next = old.value.slice(0,start) + text + old.value.slice(end);
    const ranges = adjustRanges(old.marks, old.value, next);
    paint(next, ranges, { start: start + text.length, end: start + text.length });
    onChange(next, ranges);
  };
  const endPan = (event) => {
    const gesture = pan.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const el = root.current;
    pan.current = null;
    el.classList.remove("memo-panning");
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    if (gesture.mode !== "pending" || event.type !== "pointerup") return;
    el.focus({ preventScroll: true });
    const range = caretRangeAtPoint(gesture.x, gesture.y);
    if (!range || !el.contains(range.startContainer)) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  return <div className="memo-editor-shell"><div ref={root} className="memo-large-textarea memo-rich-editor" role="textbox" aria-label="Write freely..." aria-multiline="true" contentEditable suppressContentEditableWarning
    onPointerDown={event => {
      const el = root.current;
      if (event.pointerType !== "mouse" || event.button !== 0 || event.detail > 1 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.(".memo-divider-remove") || el.scrollHeight <= el.clientHeight + 1) return;
      event.preventDefault();
      event.stopPropagation();
      pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollTop: el.scrollTop, mode: "pending" };
      el.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const gesture = pan.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.mode === "pending") {
        if (Math.hypot(dx, dy) < 5) return;
        gesture.mode = Math.abs(dx) > Math.abs(dy) ? "select" : "pan";
        if (gesture.mode === "pan") {
          root.current.classList.add("memo-panning");
          window.getSelection()?.removeAllRanges();
        } else {
          gesture.anchor = caretRangeAtPoint(gesture.x, gesture.y);
          root.current.focus({ preventScroll: true });
        }
      }
      if (gesture.mode === "pan") root.current.scrollTop = gesture.scrollTop - dy * 1.35;
      else {
        const el = root.current;
        const rect = el.getBoundingClientRect();
        const range = caretRangeAtPoint(
          Math.max(rect.left + 1, Math.min(event.clientX, rect.right - 1)),
          Math.max(rect.top + 1, Math.min(event.clientY, rect.bottom - 1)),
        );
        if (gesture.anchor && range && el.contains(gesture.anchor.startContainer) && el.contains(range.startContainer)) {
          window.getSelection()?.setBaseAndExtent(gesture.anchor.startContainer, gesture.anchor.startOffset, range.startContainer, range.startOffset);
        }
      }
      event.preventDefault();
    }}
    onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} onScroll={updatePosition}
    onCompositionStart={() => { composing.current = true; pendingCompositionEnter.current = false; }} onCompositionEnd={finishComposition}
    onInput={() => { if (!composing.current) input(); }}
    onPaste={event => { event.preventDefault(); insert(event.clipboardData.getData("text/plain")); }}
    onClick={event => {
      const button = event.target.closest?.(".memo-divider-remove");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const divider = button.closest(".memo-divider-node");
      const offsetRange = document.createRange();
      offsetRange.selectNodeContents(root.current);
      offsetRange.setEndBefore(divider);
      const start = offsetRange.toString().length;
      const old = current.current;
      const next = old.value.slice(0, start) + old.value.slice(start + 1);
      const ranges = cleanMemoRanges(next, adjustRanges(old.marks, old.value, next));
      paint(next, ranges, { start, end: start });
      onChange(next, ranges);
    }}
    onDoubleClick={event => {
      if (event.target.closest?.(".memo-divider-remove")) return;
      event.preventDefault();
      const el = root.current;
      el.focus({ preventScroll: true });
      const { start } = getSelection(el);
      const text = current.current.value;
      const lineStart = start > 0 ? text.lastIndexOf("\n", start - 1) + 1 : 0;
      const lineEnd = text.indexOf("\n", start);
      setSelection(el, lineStart, lineEnd < 0 ? text.length : lineEnd);
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229 || composing.current) {
        if (event.key === "Enter") pendingCompositionEnter.current = true;
        return;
      }
      if (event.key === "Enter") { event.preventDefault(); insert("\n"); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); root.current.dispatchEvent(new CustomEvent("memo-format", { detail: "bold" })); }
    }} /><span ref={positionTrack} className="memo-position-track" aria-hidden="true"><span /></span></div>;
}
