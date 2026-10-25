import React, { useState } from "react";
import { CalendarDays, Repeat2, CalendarRange } from "lucide-react";
import { ScheduleIcon, navigationStrokeWidth } from "../icons.jsx";
import Calendar from "./Calendar.jsx";
import { DateHeading, PanelToggle, usePanelOpen } from "./shared.jsx";
import RoutineEditor from "../RoutineEditor.jsx";
import { useDashboardData } from "../context.jsx";

const editors = [
  { id: "daily", label: "Daily", Icon: Repeat2 },
  { id: "weekly", label: "Weekly", Icon: CalendarRange },
];

function EditorPanel({ kind, label }) {
  const [open, toggle] = usePanelOpen(`planner-${kind}`);
  return <section className={`routine-editor-panel ${open ? "" : "is-collapsed"}`} data-kind={kind}>
    <RoutineEditor kind={kind} heading toggle={<PanelToggle open={open} onToggle={toggle} label={label} />} />
  </section>;
}

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
      <EditorPanel kind="daily" label="Daily" />
      <EditorPanel kind="weekly" label="Weekly" />
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
