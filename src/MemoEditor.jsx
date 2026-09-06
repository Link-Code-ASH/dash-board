import React, { useEffect, useRef } from "react";
import { adjustRanges } from "./mindfold/model.js";

export const memoColors = { red: "#c53636", blue: "#2563bd", green: "#23794b", orange: "#bc570c" };

export function MemoFormatToolbar() {
  const apply = (format) => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const editor = (node?.nodeType === 1 ? node : node?.parentElement)?.closest(".memo-rich-editor");
    editor?.dispatchEvent(new CustomEvent("memo-format", { detail: format }));
  };
  return <div className="memo-format-toolbar" role="toolbar" aria-label="메모 텍스트 서식" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <button type="button" title="굵게" aria-label="굵게" onClick={() => apply("bold")}><b>B</b></button>
    {Object.entries(memoColors).map(([key, color], index) => <button type="button" key={key} title={["빨강", "파랑", "초록", "주황"][index]} aria-label={["빨강", "파랑", "초록", "주황"][index]} onClick={() => apply(key)}><span style={{ backgroundColor: color }} /></button>)}
  </div>;
}

export default function MemoEditor({ value, marks = [], onChange, getSelection, setSelection }) {
  const root = useRef(null);
  const current = useRef({ value, marks });
  const composing = useRef(false);
  current.current = { value, marks };
  const paint = (text, ranges, selection) => {
    const el = root.current;
    const points = [...new Set([0, text.length, ...ranges.flatMap(r => [r.start, r.end])])].filter(n => n >= 0 && n <= text.length).sort((a,b) => a-b);
    const fragment = document.createDocumentFragment();
    points.slice(0,-1).forEach((start, i) => {
      const span = document.createElement("span");
      const active = ranges.filter(r => r.start <= start && r.end >= points[i+1]);
      span.textContent = text.slice(start, points[i+1]);
      span.style.fontWeight = active.some(r => r.type === "bold") ? "700" : "300";
      span.style.color = memoColors[active.findLast(r => memoColors[r.type])?.type] || "inherit";
      fragment.append(span);
    });
    el.replaceChildren(fragment);
    if (selection) setSelection(el, selection.start, selection.end);
  };
  useEffect(() => {
    if (composing.current) return;
    const selection = document.activeElement === root.current ? getSelection(root.current) : null;
    paint(value, marks, selection);
  }, [value, marks]);
  useEffect(() => {
    const el = root.current;
    const format = (event) => {
      const { start, end } = getSelection(el);
      if (start === end) return;
      const { value: text, marks: ranges } = current.current;
      const type = event.detail;
      const bold = ranges.filter(r => r.type === "bold").sort((a,b) => a.start-b.start);
      let covered = start;
      for (const r of bold) if (r.start <= covered && r.end > covered) covered = r.end;
      const remove = type === "bold" && covered >= end;
      const next = ranges.flatMap(r => {
        if ((type === "bold" ? r.type !== "bold" : !memoColors[r.type]) || r.end <= start || r.start >= end) return [r];
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
    onChange(text, adjustRanges(current.current.marks, current.current.value, text));
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
  return <div ref={root} className="memo-large-textarea memo-rich-editor" role="textbox" aria-label="Write freely..." aria-multiline="true" contentEditable suppressContentEditableWarning
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; input(); }}
    onInput={() => { if (!composing.current) input(); }}
    onPaste={event => { event.preventDefault(); insert(event.clipboardData.getData("text/plain")); }}
    onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); insert("\n"); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); root.current.dispatchEvent(new CustomEvent("memo-format", { detail: "bold" })); } }} />;
}
