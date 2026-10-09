import React from "react";
import {
  CalendarPanel,
  MobileCalendarPanel,
} from "../../dashboard/components.jsx";
import { useDashboardData } from "../context.jsx";

export default function Calendar() {
  const d = useDashboardData();
  const shared = {
    calendar: d.data.calendar,
    calendarDuties: d.data.calendarDuties,
    selectedDate: d.selectedDate,
    toggleCalendarDuty: d.toggleCalendarDuty,
    updateCalendarNote: d.updateCalendarNote,
  };
  return (
    <div className="flow-calendar">
      {d.effectiveDisplayMode === "mobile" ? (
        <MobileCalendarPanel {...shared} setSelectedDate={d.setSelectedDate} />
      ) : (
        <CalendarPanel
          {...shared}
          isOpen
          onToggle={() => {}}
          openMonths={d.openMonths}
          setOpenMonths={d.setOpenMonths}
        />
      )}
    </div>
  );
}
