import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarRange, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Flag, GraduationCap, Pencil, RotateCcw } from "lucide-react";
import { addDays, formatScore, getWeekStart, normalizeDateMarkers, weekDays } from "../dashboard/model.js";
import { readCalendarEntries, sortCalendarItems } from "../dashboard/calendarEntries.js";
import { CalendarText } from "./CalendarNoteEditor.jsx";
import { useDashboardData } from "./context.jsx";
import { moduleIds, todayKey } from "./routing.js";
import useFlowCalendar from "./useFlowCalendar.js";
import "./flow-schedule.css";

const shortDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
const koWeekday = ["일", "월", "화", "수", "목", "금", "토"];
const longDate = (date, withMonth = true) =>
  `${withMonth ? `${Number(date.slice(5, 7))}월 ` : ""}${Number(date.slice(8))}일 (${koWeekday[new Date(`${date}T12:00:00`).getDay()]})`;
const weekGap = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 604800000);
const weekName = (offset) => offset === 0 ? "이번 주" : offset === 1 ? "다음 주" : offset === -1 ? "지난주" : offset > 0 ? `${offset}주 뒤` : `${-offset}주 전`;

export default function FlowSchedule({ route, navigate }) {
  const d = useDashboardData();
  const week = route.week;
  const actualToday = todayKey();
  const currentWeek = getWeekStart(actualToday);
  const offset = weekGap(currentWeek, week);
  const external = useFlowCalendar(week, d.account.user?.id || "local");
  const [actionError, setActionError] = useState("");
  // Date Marker flags: hover shows the note; a tap opens it until the next tap elsewhere.
  const [openMarker, setOpenMarker] = useState("");
  useEffect(() => {
    if (!openMarker) return;
    const close = (event) => { if (!event.target.closest?.(".flow-desk-marker")) setOpenMarker(""); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openMarker]);
  const markers = normalizeDateMarkers(d.data.dateMarkers).filter((marker) => marker.date);
  const content = useRef(null), viewport = useRef(null), previousWeek = useRef(week);
  const requested = useRef({ week, date: d.selectedDate });
  useLayoutEffect(() => { requested.current = { week, date: d.selectedDate }; }, [week, d.selectedDate]);
  useLayoutEffect(() => {
    const previous = previousWeek.current;
    previousWeek.current = week;
    if (previous === week) return;
    const frame = viewport.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { frame.style.minHeight = ""; return; }
    frame.style.minHeight = `${Math.max(frame.clientHeight, content.current.scrollHeight)}px`;
    const animation = content.current.animate([{ opacity: .4, transform: `translateX(${week > previous ? 18 : -18}px)` }, { opacity: 1, transform: "translateX(0)" }], { duration: 180, easing: "ease-out" });
    animation.onfinish = () => { frame.style.minHeight = ""; };
    return () => { animation.cancel(); frame.style.minHeight = ""; };
  }, [week]);
  const move = (direction) => {
    viewport.current.style.minHeight = `${viewport.current.clientHeight}px`;
    const next = { week: addDays(requested.current.week, direction * 7), date: addDays(requested.current.date, direction * 7) };
    requested.current = next;
    navigate("flow", "today", next.date, { week: next.week });
  };
  const perform = async (event, action) => {
    event.stopPropagation();
    try { await action(); setActionError(""); }
    catch { setActionError("변경하지 못했습니다. 다시 시도해 주세요."); }
  };
  const open = (event, item) => perform(event, async () => {
    const target = await item.source.openTarget(item.id);
    if (!moduleIds.includes(target?.moduleId)) throw new Error("Invalid Flow target");
    navigate(target.moduleId, target.section, item.date || d.selectedDate);
  });
  const itemsFor = (date) => sortCalendarItems([
    ...readCalendarEntries(d.data, date).items.filter((item) => item.text.trim()).map((item) => ({ ...item, title: item.text, sourceLabel: "Calendar" })),
    ...(external.byDate[date] || []).map((item) => ({ ...item, time: item.time || "" })),
  ]);
  return <div className="flow-desk-calendar">
    <div className="flow-desk-navigation">
      <div className="flow-desk-range">
        <CalendarRange size={18} aria-hidden="true" />
        <time dateTime={week}>{longDate(week)} – {longDate(addDays(week, 13), week.slice(5, 7) !== addDays(week, 13).slice(5, 7))}</time>
      </div>
      <div>
      {offset !== 0 && <button type="button" className="flow-desk-back" title="이번 주로" onClick={() => navigate("flow", "today", actualToday, { week: currentWeek })}><RotateCcw size={14} /><span>이번 주</span></button>}
      <button type="button" title="이전 주" aria-label="이전 주" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
      <button type="button" title="다음 주" aria-label="다음 주" onClick={() => move(1)}><ChevronRight size={18} /></button>
    </div></div>
    <div className="flow-desk-weekdays" aria-hidden="true">{weekDays.map((day) => <span key={day.key}>{day.label}</span>)}</div>
    <div className="flow-desk-viewport" ref={viewport}><div ref={content}>
      {[0, 1].map((row) => <section className="flow-desk-week" key={row} aria-label={row ? "다음 주 일정" : "이번 주 일정"}>
        <h3 className={offset + row === 0 ? "is-current" : ""}><span>{weekName(offset + row)}</span><small>{shortDate(addDays(week, row * 7))} – {shortDate(addDays(week, row * 7 + 6))}</small></h3>
        <div className="flow-desk-grid">{weekDays.map((day, column) => {
          const date = addDays(week, row * 7 + column);
          const items = itemsFor(date);
          const dayMarkers = markers.filter((marker) => marker.date === date);
          const penalty = !!d.data.carryPenalties?.[date], tried = !penalty && !!d.data.routineAttempts?.[date];
          const score = d.getDayTotal(date);
          const saved = readCalendarEntries(d.data, date);
          return <article key={date} className={`flow-desk-day${date === actualToday ? " is-today" : ""}${date === d.selectedDate ? " is-selected" : ""}`} onClick={() => navigate("flow", "today", date, { week })}>
            <header><button type="button" aria-label={`${date} 일정 선택`} aria-pressed={date === d.selectedDate} aria-current={date === actualToday ? "date" : undefined}><small>{day.label}</small><time dateTime={date}>{shortDate(date)}</time>{date === actualToday && <em className="flow-desk-today">오늘</em>}</button>
              {dayMarkers.map((marker, index) => { const key = `${date}:${index}`; return <button type="button" key={key} className={`flow-desk-marker${openMarker === key ? " is-open" : ""}${column > 3 ? " is-end" : ""}`}
                aria-label={`Date Marker ${marker.text || ""} ${marker.time || ""}`} aria-expanded={openMarker === key}
                onClick={(event) => { event.stopPropagation(); setOpenMarker(openMarker === key ? "" : key); }}>
                <Flag size={13} aria-hidden="true" />
                <span className="flow-desk-marker-tip" role="tooltip"><b>{marker.text || "Date Marker"}</b>{marker.time && <time><Clock3 size={11} aria-hidden="true" />{marker.time}</time>}</span>
              </button>; })}</header>
            <div className="flow-desk-events">
              {items.map((item) => <div className="flow-desk-event" data-source={item.source?.id || "calendar"} key={`${item.source?.id || "calendar"}:${item.id}`}>
                {item.source?.id === "edu" && <GraduationCap className="flow-desk-source-icon" size={13} aria-label="Edu" />}
                <div className="flow-desk-event-title">{item.source ? item.displayTitle || item.title : <CalendarText text={item.text} marks={item.marks} />}</div>
                {item.time && <time className="flow-desk-time"><Clock3 size={11} aria-hidden="true" />{item.time}</time>}
                {item.source && <div className="flow-desk-event-source"><span>{item.sourceLabel || item.source?.id}</span>{item.periodStatus && <em>{item.periodStatus}</em>}
                  {item.source && <button type="button" title="원본 일정 열기" aria-label={`${item.displayTitle || item.title} 원본 열기`} onClick={(event) => open(event, item)}><ExternalLink size={12} /></button>}
                  {item.source?.execute && item.commands?.map((command) => <button type="button" key={command.id} title={command.label} aria-label={`${item.title} ${command.label}`} onClick={(event) => perform(event, () => item.source.execute(item.id, command.id, command.payload))}><Check size={12} /></button>)}
                </div>}
              </div>)}
              {!items.length && !saved.unsupported && <span className="flow-desk-empty">일정 없음</span>}
              {(saved.unsupported || saved.mismatch || saved.recovery.length > 0) && <span className="flow-desk-warning">원본 확인 필요 · Calendar</span>}
            </div>
            <footer className={`flow-desk-score${penalty ? " is-penalty" : tried ? " is-attempt" : ""}${score > 0 ? " is-plus" : score < 0 ? " is-minus" : " is-zero"}`} aria-label={`${date} 점수 ${formatScore(score)}, ${penalty ? "빨간 체크" : tried ? "초록 체크" : "체크 없음"}`}>
              {(tried || penalty) && <span className={`flow-desk-mark ${penalty ? "is-red" : "is-green"}`} aria-hidden="true"><Check size={13} strokeWidth={3.2} /></span>}
              {score !== 0 && <strong>{formatScore(score)}</strong>}
            </footer>
          </article>;
        })}</div>
      </section>)}
    </div></div>
    <div className="flow-desk-edit"><span>{shortDate(d.selectedDate)} · Selected</span><button type="button" onClick={() => navigate("routine", "calendar", d.selectedDate, { month: d.selectedDate.slice(0, 7), week })}><Pencil size={14} />Edit in Calendar</button></div>
    {(external.error || actionError) && <p className="flow-desk-warning" role="status">{actionError || external.error}</p>}
  </div>;
}
