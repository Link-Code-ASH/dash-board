import React, { useEffect, useRef, useState } from "react";
import { Clock3, Plus, Trash2, X } from "lucide-react";
import CalendarNoteEditor, { CalendarText } from "./CalendarNoteEditor.jsx";
import { legacyCalendarItems, readCalendarEntries } from "../dashboard/calendarEntries.js";
import "./calendar-events.css";

export default function CalendarEventEditor({ data, date, onChange, onFocus, compact = false }) {
  const day = readCalendarEntries(data, date);
  const [expandedTime, setExpandedTime] = useState(null);
  const [error, setError] = useState("");
  const pendingFocus = useRef(null);
  const surface = useRef(null);
  useEffect(() => {
    const row = [...surface.current.querySelectorAll("[data-entry-id]")].find((node) => node.dataset.entryId === pendingFocus.current);
    if (row) { row.querySelector("textarea")?.focus(); pendingFocus.current = null; }
  }, [day.items]);
  const change = (transform) => {
    try {
      const write = onChange(date, transform);
      setError("");
      write?.catch((failure) => setError(failure.message || "저장하지 못했습니다."));
    }
    catch (failure) { setError(failure.message); }
  };
  const update = (id, fields) => change((items) => items.map((item) => item.id === id ? { ...item, ...fields } : item));
  const add = () => {
    const item = { id: crypto.randomUUID(), text: "", time: "", marks: [] };
    pendingFocus.current = item.id;
    change((items) => [...items, item]);
  };
  return <div className={`calendar-event-editor${compact ? " is-compact" : ""}`} ref={surface} onFocusCapture={onFocus}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExpandedTime(null); }}>
    {day.unsupported ? <p role="alert">지원하지 않는 일정 버전입니다. 자료를 초기화하지 않았습니다.</p> : <>
      {day.items.map((item, index) => <div className={`calendar-entry${item.time ? " has-time" : ""}`} key={item.id} data-entry-id={item.id}>
        <div className="calendar-entry-tools">
          <button type="button" className="calendar-entry-time-add" title="시작 시간 설정" aria-label={`${date} 일정 ${index + 1} 시작 시간 설정`} aria-expanded={expandedTime === item.id} onClick={() => setExpandedTime(expandedTime === item.id ? null : item.id)}><Clock3 size={14} /><span>{item.time || "시간"}</span></button>
          {expandedTime === item.id && <div className="calendar-entry-time" role="group" aria-label="시작 시간 설정">
            <input type="time" aria-label={`${date} 일정 ${index + 1} 시작 시간`} value={item.time} onChange={(e) => update(item.id, { time: e.target.value })} />
            <button type="button" aria-label="시작 시간 제거" title="시작 시간 제거" onClick={() => { update(item.id, { time: "" }); setExpandedTime(null); }}><Trash2 size={14} /></button>
            <button type="button" aria-label="시간 설정 닫기" title="닫기" onClick={() => setExpandedTime(null)}><X size={14} /></button>
          </div>}
          <button type="button" title="일정 삭제" aria-label={`${date} 일정 ${index + 1} 삭제`} onClick={() => { if (!item.text.trim() || window.confirm("이 일정을 삭제할까요?")) change((items) => items.filter((entry) => entry.id !== item.id)); }}><Trash2 size={14} /></button>
        </div>
        <CalendarNoteEditor label={`${date} 일정 ${index + 1} 내용`} value={item.text} marks={item.marks} minimumHeight={34} placeholder="일정"
          onChange={(text, marks) => update(item.id, { text, marks })} />
      </div>)}
      <button type="button" className="calendar-entry-add" onClick={add} aria-label={`${date} 일정 추가`}><Plus size={15} /><span>일정 추가</span></button>
    </>}
    {error && <p role="alert">{error}</p>}
    {!!day.recovery.length && <details className="calendar-entry-recovery"><summary>보존된 이전 문구 {day.recovery.length}개</summary>
      {day.recovery.map((copy, index) => <div key={index}><p><CalendarText text={copy.text || "(빈 일정)"} marks={copy.marks} /></p>
        {!day.unsupported && <button type="button" onClick={() => change((items) => [...items, ...legacyCalendarItems(date, copy.text, copy.marks).map((item) => ({ ...item, id: crypto.randomUUID() }))])}>일정에 사본 추가</button>}
      </div>)}
    </details>}
  </div>;
}
