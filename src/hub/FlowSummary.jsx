import React from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { useDashboardData } from "./context.jsx";
import { addDays, formatScore, getWeekStart } from "../dashboard/model.js";
import { todayKey } from "./routing.js";
import "./flow-summary.css";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const signedScore = (score) => formatScore(score).replace(/^-/, "−");
const scoreTone = (score) => score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
const shortDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function FlowScore() {
  const d = useDashboardData();
  return (
    <section className="flow-score" aria-label="선택 날짜 점수">
      <div className="flow-score-content">
        <div className="flow-score-total">
          <h2>Total Score</h2>
          <strong className={`flow-score-value is-${scoreTone(d.scoreInfo.total)}`}>
            {signedScore(d.scoreInfo.total)}
          </strong>
        </div>
        <dl className="flow-score-metrics">
          <div className="flow-score-carry">
            <dt>Carry</dt>
            <dd>
              <strong>{signedScore(d.scoreInfo.carry)}</strong>
              <div className="flow-score-carry-tools" aria-label="Carry 조정">
                <button type="button" aria-label="Carry 1 감소" title="Carry 1 감소" onClick={() => d.adjustCarry(-1)}>
                  <Minus size={16} aria-hidden="true" />
                </button>
                <button type="button" aria-label="선택 날짜부터 Carry 초기화" title="Carry 초기화" onClick={d.resetCarry}>
                  <RotateCcw size={15} aria-hidden="true" />
                </button>
                <button type="button" aria-label="Carry 1 증가" title="Carry 1 증가" onClick={() => d.adjustCarry(1)}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </dd>
          </div>
          <div>
            <dt>Plus</dt>
            <dd className="is-positive">{signedScore(d.scoreInfo.plus)}</dd>
          </div>
          <div>
            <dt>Minus</dt>
            <dd className="is-negative">{signedScore(d.scoreInfo.minus)}</dd>
          </div>
        </dl>
        <div className="flow-score-actions">
          <label className={`flow-score-check is-attempt ${d.routineTried ? "is-checked" : ""}`}>
            <input type="checkbox" checked={d.routineTried} onChange={d.toggleRoutineAttempt} aria-label="선택 날짜 루틴 시도" />
            <span>루틴 시도</span>
          </label>
          <label className={`flow-score-check is-penalty ${d.carryPenaltyMarked ? "is-checked" : ""}`}>
            <input type="checkbox" checked={d.carryPenaltyMarked} onChange={d.toggleCarryPenalty} aria-label="선택 날짜 Carry -2 적용" />
            <span>Carry −2</span>
          </label>
        </div>
      </div>
    </section>
  );
}

export function WeeklyOverview({ navigate }) {
  const d = useDashboardData();
  const actualToday = todayKey();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(d.selectedDate, index - 3);
    const penalty = Boolean(d.data.carryPenalties?.[date]);
    return {
      date,
      weekday: weekdays[new Date(`${date}T00:00:00`).getDay()],
      score: d.getDayTotal(date),
      penalty,
      tried: !penalty && Boolean(d.data.routineAttempts?.[date]),
    };
  });
  return (
    <section className="flow-weekly-overview" aria-label="주간 점수 기록">
      <header className="flow-weekly-heading">
        <h2>Weekly Overview</h2>
        <span>{shortDate(days[0].date)} – {shortDate(days[6].date)}</span>
      </header>
      <div className="flow-weekly-days">
        {days.map((day) => {
          const status = day.penalty ? "Carry -2 적용" : day.tried ? "루틴 시도" : "미체크";
          return (
            <button
              type="button"
              className={`flow-weekly-day ${day.date === actualToday ? "is-today" : ""}`}
              key={day.date}
              aria-label={`${day.date} ${day.weekday}요일, 점수 ${formatScore(day.score)}, ${status}${day.date === actualToday ? ", 오늘" : ""}`}
              aria-pressed={day.date === d.selectedDate}
              aria-current={day.date === actualToday ? "date" : undefined}
              onClick={() => navigate ? navigate("flow", "today", day.date, { week: getWeekStart(day.date) }) : d.setSelectedDate(day.date)}
            >
              <span className="flow-weekly-weekday">{day.weekday}<span className="flow-weekly-today-dot" aria-hidden="true" /></span>
              <time dateTime={day.date}>{shortDate(day.date)}</time>
              <strong className={`flow-weekly-score is-${scoreTone(day.score)}`} title={signedScore(day.score)}>{signedScore(day.score)}</strong>
              {(day.penalty || day.tried) && (
                <span className={`flow-weekly-status ${day.penalty ? "is-penalty" : "is-attempt"}`} title={status} aria-hidden="true">
                  {day.penalty ? "−2" : <Check size={10} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
