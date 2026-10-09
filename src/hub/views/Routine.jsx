import React from "react";
import { Minus, Plus, RotateCcw, Check, CalendarDays } from "lucide-react";
import { ScheduleIcon, navigationStrokeWidth } from "../icons.jsx";
import Calendar from "./Calendar.jsx";
import { useDashboardData } from "../context.jsx";
import {
  DailyPanel,
  WeeklyPanel,
  SchoolWeeklyPanel,
  HistoryPanel,
} from "../../dashboard/components.jsx";
import { formatScore } from "../../dashboard/model.js";
import { DateHeading, RoutineTasks } from "./shared.jsx";

export default function Routine({ route, navigate }) {
  const d = useDashboardData();
  const calendar = route.section === "calendar";
  return (
    <div className="routine-view">
      <DateHeading title="Schedule" />
      <nav className="hub-segments" aria-label="Schedule 보기">
        <button
          aria-current={!calendar ? "page" : undefined}
          onClick={() => navigate("routine", "today")}
        >
          <ScheduleIcon size={17} strokeWidth={navigationStrokeWidth} /> Routine
        </button>
        <button
          aria-current={calendar ? "page" : undefined}
          onClick={() => navigate("routine", "calendar")}
        >
          <CalendarDays size={17} strokeWidth={navigationStrokeWidth} />{" "}
          Calendar
        </button>
      </nav>
      {calendar ? (
        <Calendar />
      ) : (
        <>
          <div className="routine-summary">
            <section className="routine-score" aria-label="Total Score">
              <div className="hub-section-title">
                <h2>Total Score</h2>
                <div className="score-carry-tools">
                  <button
                    aria-label="Carry 감소"
                    title="Carry 감소"
                    onClick={() => d.adjustCarry(-1)}
                  >
                    <Minus size={17} />
                  </button>
                  <button
                    aria-label="Carry 초기화"
                    title="Carry 초기화"
                    onClick={d.resetCarry}
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    aria-label="Carry 증가"
                    title="Carry 증가"
                    onClick={() => d.adjustCarry(1)}
                  >
                    <Plus size={17} />
                  </button>
                </div>
              </div>
              <div className="score-primary">
                <strong className="score-value">
                  {formatScore(d.scoreInfo.total)}
                </strong>
                <div className="score-checks">
                  <label className="score-check-green">
                    <input
                      className="score-check-green"
                      type="checkbox"
                      aria-label="초록 체크"
                      title="초록 체크"
                      checked={d.routineTried}
                      onChange={d.toggleRoutineAttempt}
                    />
                    <Check size={15} aria-hidden="true" />
                  </label>
                  <label className="score-check-red">
                    <input
                      className="score-check-red"
                      type="checkbox"
                      aria-label="빨강 체크"
                      title="빨강 체크"
                      checked={d.carryPenaltyMarked}
                      onChange={d.toggleCarryPenalty}
                    />
                    <Check size={15} aria-hidden="true" />
                  </label>
                </div>
              </div>
              <div className="score-metrics">
                {["carry", "plus", "minus"].map((key) => (
                  <div key={key}>
                    <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                    <strong>{formatScore(d.scoreInfo[key])}</strong>
                  </div>
                ))}
              </div>
            </section>
            <RoutineTasks />
          </div>
          <div className="routine-editors">
            <DailyPanel
              addPreset={d.addPreset}
              controlsId="presetGrid"
              isOpen={d.openPanels.daily}
              movePreset={d.movePreset}
              onToggle={() => d.togglePanel("daily")}
              presets={d.data.presets}
              removePreset={d.removePreset}
              title="Daily"
              updatePreset={d.updatePreset}
            />
            <WeeklyPanel
              addCategory={d.addCategory}
              categories={d.data.categories}
              isOpen={d.openPanels.weekly}
              moveCategory={d.moveCategory}
              onToggle={() => d.togglePanel("weekly")}
              removeCategory={d.removeCategory}
              selectedDate={d.selectedDate}
              updateCategory={d.updateCategory}
              updateWeeklyPlan={d.updateWeeklyPlan}
              weeklyPlan={d.data.weeklyPlan}
            />
            <SchoolWeeklyPanel
              addPreset={d.addSchoolPreset}
              isOpen={d.openPanels.schoolDaily}
              movePreset={d.moveSchoolPreset}
              onToggle={() => d.togglePanel("schoolDaily")}
              presets={d.data.schoolPresets}
              removePreset={d.removeSchoolPreset}
              selectedDate={d.selectedDate}
              schoolSubjects={d.data.schoolSubjects}
              updateSchoolSubject={d.updateSchoolSubject}
              updatePreset={d.updateSchoolPreset}
            />
          </div>
          <HistoryPanel
            carryPenalties={d.data.carryPenalties}
            getDayTotal={d.getDayTotal}
            routineAttempts={d.data.routineAttempts}
            selectedDate={d.selectedDate}
          />
        </>
      )}
    </div>
  );
}
