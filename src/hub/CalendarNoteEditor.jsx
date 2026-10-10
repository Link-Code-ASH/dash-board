import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { calendarTextColors, calendarTextSegments, colorCalendarSelection, changeCalendarText } from "../dashboard/calendarText.js";
import "./calendar-text.css";

export function CalendarText({ text, marks }) {
  return calendarTextSegments(text, marks).map((segment, index) => <span key={index} style={{ color: segment.color }}>{segment.text}</span>);
}

// A native textarea retains selection, IME and undo behavior. Its inert mirror
// paints color ranges using exactly the same typography and wrapping.
export default function CalendarNoteEditor({ value, marks = [], onChange, onFocus, label, placeholder = "일정을 입력하세요", compact = false }) {
  const input = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  useEffect(() => {
    const captureSelection = () => {
      const node = input.current;
      if (document.activeElement === node) setSelection({ start: node.selectionStart, end: node.selectionEnd });
    };
    document.addEventListener("selectionchange", captureSelection);
    return () => document.removeEventListener("selectionchange", captureSelection);
  }, []);
  useLayoutEffect(() => {
    const node = input.current;
    const fit = () => { node.style.height = "0px"; node.style.height = `${Math.max(compact ? 112 : 70, node.scrollHeight + 2)}px`; };
    fit();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => { if (width !== node.clientWidth) { width = node.clientWidth; fit(); } });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, compact]);
  const capture = () => setSelection({ start: input.current.selectionStart, end: input.current.selectionEnd });
  const apply = (type) => {
    const { start, end } = selection;
    if (start === end) return;
    onChange(value, colorCalendarSelection(value, marks, start, end, type));
    input.current.focus({ preventScroll: true });
    input.current.setSelectionRange(start, end);
  };
  return <div className={`calendar-note-editor${compact ? " is-compact" : ""}`}>
    <div className="calendar-color-toolbar" role="toolbar" aria-label={`${label} 문구 색상`}>
      <span className="calendar-color-hint">문구 선택 후 색상</span>
      {Object.entries(calendarTextColors).map(([type, color]) => <button key={type} type="button" aria-label={`${color.label} 글자색`} title={color.label}
        disabled={selection.start === selection.end} onPointerDown={(e) => e.preventDefault()} onClick={() => apply(type)} style={{ "--calendar-swatch": color.value }}><span /></button>)}
      <button type="button" aria-label="선택 문구 색상 지우기" title="기본 색상" disabled={selection.start === selection.end}
        onPointerDown={(e) => e.preventDefault()} onClick={() => apply("clear")}>기본</button>
    </div>
    <div className="calendar-text-surface">
      <div className="calendar-text-mirror" aria-hidden="true"><CalendarText text={value} marks={marks} />{"\n"}</div>
      <textarea ref={input} aria-label={label} spellCheck={false} maxLength={600} value={value} placeholder={compact ? "" : placeholder}
        onFocus={onFocus} onSelect={capture} onKeyUp={capture} onPointerUp={capture}
        onScroll={() => { const mirror = input.current.previousElementSibling; mirror.scrollTop = input.current.scrollTop; mirror.scrollLeft = input.current.scrollLeft; }}
        onChange={(e) => { const next = e.target.value; onChange(next, changeCalendarText(value, next, marks)); capture(); }} />
    </div>
  </div>;
}
