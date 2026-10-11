import React, { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, FlagTriangleRight, Pencil } from "lucide-react";
import { addDays, calendarDutyOptions, formatScore, weekDays } from "../dashboard/model.js";
import { readCalendarEntries, sortCalendarItems } from "../dashboard/calendarEntries.js";
import { CalendarText } from "./CalendarNoteEditor.jsx";
import { useDashboardData } from "./context.jsx";
import { moduleIds, todayKey } from "./routing.js";
import useFlowCalendar from "./useFlowCalendar.js";
import "./flow-schedule.css";

const shortDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export default function FlowSchedule({ route, navigate }) {
  const d = useDashboardData();
  const week = route.week;
  const actualToday = todayKey();
  const external = useFlowCalendar(week, d.account.user?.id || "local");
  const [actionError, setActionError] = useState("");
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
    <div className="flow-desk-navigation"><time dateTime={week}>{week.replaceAll("-", ".")} — {addDays(week, 13).slice(5).replace("-", ".")}</time><div>
      <button type="button" title="이전 주" aria-label="이전 주" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
      <button type="button" title="다음 주" aria-label="다음 주" onClick={() => move(1)}><ChevronRight size={18} /></button>
    </div></div>
    <div className="flow-desk-weekdays" aria-hidden="true">{weekDays.map((day) => <span key={day.key}>{day.label}</span>)}</div>
    <div className="flow-desk-viewport" ref={viewport}><div ref={content}>
      {[0, 1].map((row) => <section className="flow-desk-week" key={row} aria-label={row ? "다음 주 일정" : "이번 주 일정"}>
        <h3>{row ? "Next week" : "This week"}<small>{shortDate(addDays(week, row * 7))} – {shortDate(addDays(week, row * 7 + 6))}</small></h3>
        <div className="flow-desk-grid">{weekDays.map((day, column) => {
          const date = addDays(week, row * 7 + column);
          const items = itemsFor(date);
          const duties = calendarDutyOptions.filter((option) => d.data.calendarDuties[date]?.[option.key]);
          const penalty = !!d.data.carryPenalties?.[date], tried = !penalty && !!d.data.routineAttempts?.[date];
          const score = d.getDayTotal(date);
          const saved = readCalendarEntries(d.data, date);
          return <article key={date} className={`flow-desk-day${date === actualToday ? " is-today" : ""}${date === d.selectedDate ? " is-selected" : ""}`} onClick={() => navigate("flow", "today", date, { week })}>
            <header><button type="button" aria-label={`${date} 일정 선택`} aria-pressed={date === d.selectedDate} aria-current={date === actualToday ? "date" : undefined}><small>{day.label}</small><time dateTime={date}>{shortDate(date)}</time>{date === actualToday && <i title="오늘" />}</button></header>
            <div className="flow-desk-events">
              {!!duties.length && <div className="flow-desk-duties">{duties.map((option) => <span key={option.key}>{option.label}</span>)}</div>}
              {items.map((item) => <div className="flow-desk-event" key={`${item.source?.id || "calendar"}:${item.id}`}>
                {item.time && <time className="flow-desk-time">{item.time}</time>}
                <div className="flow-desk-event-title">{item.source ? item.displayTitle || item.title : <CalendarText text={item.text} marks={item.marks} />}</div>
                <div className="flow-desk-event-source"><span>{item.sourceLabel || item.source?.id}</span>{item.periodStatus && <em>{item.periodStatus}</em>}
                  {item.source && <button type="button" title="원본 일정 열기" aria-label={`${item.displayTitle || item.title} 원본 열기`} onClick={(event) => open(event, item)}><ExternalLink size={12} /></button>}
                  {item.source?.execute && item.commands?.map((command) => <button type="button" key={command.id} title={command.label} aria-label={`${item.title} ${command.label}`} onClick={(event) => perform(event, () => item.source.execute(item.id, command.id, command.payload))}><Check size={12} /></button>)}
                </div>
              </div>)}
              {!items.length && !duties.length && !saved.unsupported && <span className="flow-desk-empty">No events</span>}
              {(saved.unsupported || saved.mismatch || saved.recovery.length > 0) && <span className="flow-desk-warning">원본 확인 필요 · Calendar</span>}
            </div>
            <footer className={`flow-desk-score${penalty ? " is-penalty" : tried ? " is-attempt" : ""}`} aria-label={`${date} 점수 ${formatScore(score)}, ${penalty ? "Carry -2" : tried ? "루틴 시도" : "미체크"}`}>
              <span className="flow-desk-check" aria-hidden="true">{(tried || penalty) && <Check size={12} />}</span><strong>{formatScore(score)}</strong><FlagTriangleRight size={17} aria-hidden="true" />
            </footer>
          </article>;
        })}</div>
      </section>)}
    </div></div>
    <div className="flow-desk-edit"><span>{shortDate(d.selectedDate)} · Selected</span><button type="button" onClick={() => navigate("routine", "calendar", d.selectedDate, { month: d.selectedDate.slice(0, 7), week })}><Pencil size={14} />Edit in Calendar</button></div>
    {(external.error || actionError) && <p className="flow-desk-warning" role="status">{actionError || external.error}</p>}
  </div>;
}
