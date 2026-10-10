import React, { useState } from "react";
import { CalendarDays, Repeat2, CalendarRange, GraduationCap } from "lucide-react";
import { ScheduleIcon, navigationStrokeWidth } from "../icons.jsx";
import Calendar from "./Calendar.jsx";
import { DateHeading } from "./shared.jsx";
import RoutineEditor from "../RoutineEditor.jsx";
import { useDashboardData } from "../context.jsx";

const editors = [
  { id: "daily", label: "Daily", Icon: Repeat2 },
  { id: "weekly", label: "Weekly", Icon: CalendarRange },
  { id: "edu", label: "EDU", Icon: GraduationCap },
];

export default function Routine({ route, navigate }) {
  const d = useDashboardData();
  const desktop = d.effectiveDisplayMode !== "mobile";
  const calendar = route.section === "calendar";
  const [activeEditor, setActiveEditor] = useState("daily");
  return <div className="routine-view">
    <div className="routine-page-toolbar">
      <DateHeading title="Planner" />
      <nav className="hub-segments" aria-label="Planner 보기">
        <button aria-current={!calendar ? "page" : undefined} onClick={() => navigate("routine", "today")}>
          <ScheduleIcon size={18} strokeWidth={navigationStrokeWidth} /> Routine
        </button>
        <button aria-current={calendar ? "page" : undefined} onClick={() => navigate("routine", "calendar")}>
          <CalendarDays size={18} strokeWidth={navigationStrokeWidth} /> Calendar
        </button>
      </nav>
    </div>
    {calendar ? <Calendar route={route} navigate={navigate} /> : desktop ? <div className="routine-desktop-workspace">
      <div className="routine-presets-workspace">
        <section className="routine-editor-panel" data-kind="daily"><RoutineEditor kind="daily" heading /></section>
        <section className="routine-editor-panel" data-kind="edu"><RoutineEditor kind="edu" heading /></section>
      </div>
      <section className="routine-editor-panel" data-kind="weekly"><RoutineEditor kind="weekly" heading /></section>
    </div> : <section className="routine-workspace" aria-label="루틴 편집">
      <nav className="routine-editor-tabs" aria-label="편집할 루틴">
        {editors.map(({ id, label, Icon }) => <button key={id} type="button"
          aria-pressed={activeEditor === id} aria-controls="routine-editor" onClick={() => setActiveEditor(id)}>
          <Icon size={23} /><span>{label}</span>
        </button>)}
      </nav>
      <div id="routine-editor"><RoutineEditor kind={activeEditor} /></div>
    </section>}
  </div>;
}
