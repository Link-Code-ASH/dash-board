import CalendarEventEditor from "../CalendarEventEditor.jsx";
import React from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { MobileCalendarPanel } from "../../dashboard/components.jsx";
import { weekDays } from "../../dashboard/model.js";
import { useDashboardData } from "../context.jsx";
import { monthCells, shiftMonth } from "../calendarMonth.js";
import { todayKey } from "../routing.js";

export default function Calendar({ route, navigate }) {
  const d = useDashboardData();
  const shared = {
    calendar: d.data.calendar,
    calendarFormats: d.data.calendarFormats,
    calendarDuties: d.data.calendarDuties,
    selectedDate: d.selectedDate,
    toggleCalendarDuty: d.toggleCalendarDuty,
    updateCalendarNote: d.updateCalendarNote,
    calendarEntries: d.data.calendarEntries,
    updateCalendarEntries: d.updateCalendarEntries,
  };
  return (
    <div className="flow-calendar">
      {d.effectiveDisplayMode === "mobile" ? (
        <MobileCalendarPanel {...shared} setSelectedDate={d.setSelectedDate} />
      ) : (
        <DesktopCalendar {...shared} route={route} navigate={navigate} />
      )}
    </div>
  );
}

function DesktopCalendar({ calendar, calendarFormats, calendarEntries, calendarDuties, selectedDate, toggleCalendarDuty, updateCalendarEntries, route, navigate }) {
  const today = todayKey();
  const month = route.month;
  const selectDate = (date) => {
    if (date !== selectedDate)
      navigate("routine", "calendar", date, { month, week: route.week });
  };
  const move = (direction) =>
    navigate("routine", "calendar", undefined, { month: shiftMonth(month, direction), week: route.week });
  const heading = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" })
    .format(new Date(`${month}-01T12:00:00`));
  return (
    <section className="planner-calendar" aria-label="월별 달력">
      <header className="planner-month-toolbar">
        <h2 aria-live="polite">{heading}</h2>
        <div>
          <button type="button" title="오늘로" onClick={() => navigate("routine", "calendar", today, { month: today.slice(0, 7) })}>
            <RotateCcw size={16} /> 오늘
          </button>
          <button type="button" aria-label="이전 달" title="이전 달" disabled={month === "0001-01"} onClick={() => move(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="다음 달" title="다음 달" disabled={month === "9999-12"} onClick={() => move(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div className="planner-weekdays" aria-hidden="true">
        {weekDays.map((day) => <span key={day.key}>{day.label}</span>)}
      </div>
      <div className="planner-month-grid">
        {monthCells(month).map((date, index) => date ? (
          <article key={date} className={`planner-date-cell ${date === today ? "is-today" : ""} ${date === selectedDate ? "is-selected" : ""}`} aria-label={`${date} 일정`}>
            <div className="planner-date-heading">
              <button type="button" className="planner-date-number" aria-label={`${date} 선택`} aria-pressed={date === selectedDate} onClick={() => selectDate(date)}>
                {Number(date.slice(8))}
                {date === today && <span className="planner-today-dot" aria-label="오늘" />}
              </button>
            </div>
            <CalendarEventEditor compact data={{ calendar, calendarFormats, calendarEntries }} date={date} onFocus={() => selectDate(date)} onChange={updateCalendarEntries} />
          </article>
        ) : <div className="planner-date-blank" key={`blank-${index}`} aria-hidden="true" />)}
      </div>
    </section>
  );
}
