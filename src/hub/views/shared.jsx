import React from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useDashboardData } from "../context.jsx";
import { todayKey } from "../routing.js";
import ItemIconButton from "../ItemIconButton.jsx";
import {
  formatScore,
  getWeeklyPlanEntry,
  getWeeklyPlanItems,
} from "../../dashboard/model.js";
import {
  createPresetPlanCard,
  getCategoryScoreRange,
} from "../../dashboard/components.jsx";

export function DateHeading({ title }) {
  const d = useDashboardData();
  return (
    <div className="hub-page-heading">
      <div>
        <h1>{title}</h1>
        <p>
          {new Intl.DateTimeFormat("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "long",
          }).format(new Date(`${d.selectedDate}T12:00:00`))}
        </p>
      </div>
      <div className="hub-date-controls">
        <button
          title="이전 날짜"
          aria-label="이전 날짜"
          onClick={() => d.shiftDate(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <input
          type="date"
          aria-label="선택 날짜"
          value={d.selectedDate}
          onChange={(e) => d.setSelectedDate(e.target.value || todayKey())}
        />
        <button
          title="다음 날짜"
          aria-label="다음 날짜"
          onClick={() => d.shiftDate(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button title="오늘로" onClick={() => d.setSelectedDate(todayKey())}>
          <RotateCcw size={15} />
          <span>오늘</span>
        </button>
      </div>
    </div>
  );
}

export function RoutineTasks({ compact = false }) {
  const d = useDashboardData();
  const presetCards = (presets, section, prefix) =>
    presets.map((preset) =>
      createPresetPlanCard({
        entries: d.entries,
        planKey: `${prefix}:${d.selectedDate}:${preset.key}`,
        preset,
        section,
        toggleChoice: d.toggleChoice,
      }),
    );
  const weeklyCards = d.data.categories
    .map((category) => {
      const value = getWeeklyPlanEntry(
        d.data.weeklyPlan[category.key]?.[d.weekday.key],
        d.selectedDate,
      ).value;
      const planKey = `plan:${d.selectedDate}:${category.key}`;
      const range = getCategoryScoreRange(category);
      return {
        key: category.key,
        label: category.label,
        value,
        scheduled: getWeeklyPlanItems(
          d.data.weeklyPlan[category.key]?.[d.weekday.key],
        ).some((item) => item.trim()),
        scoreRange: range.length > 1 ? range : null,
        yScore: category.yScore,
        nScore: category.nScore,
        selectedChoice:
          d.entries.find((entry) => entry.planKey === planKey)?.choice || "",
        onToggle: (choice) =>
          d.toggleChoice({
            planKey,
            choice: String(choice),
            name: `${category.label}: ${value} (${choice})`,
            score: Number(
              choice === "N"
                ? category.nScore
                : choice === "Y"
                  ? category.yScore
                  : choice,
            ),
          }),
      };
    })
    .filter((card) => card.scheduled || card.selectedChoice);
  const subject = d.data.schoolSubjects[d.weekday.key]?.trim();
  const groups = [
    {
      id: "daily",
      title: "Daily",
      cards: presetCards(d.data.presets, "Daily", "daily"),
    },
    { id: "weekly", title: "Weekly", cards: weeklyCards },
    {
      id: "edu",
      title: subject ? `EDU · ${subject}` : "EDU",
      cards: presetCards(d.data.schoolPresets, "Edu", "school"),
    },
  ];
  return (
    <div className={`hub-task-groups ${compact ? "is-compact" : ""}`}>
      {groups.map((group) => (
        <section className="hub-task-group" data-kind={group.id} key={group.id}>
          <h3>
            {group.title}
            <span>
              {group.cards.filter((card) => card.selectedChoice).length}/
              {group.cards.length}
            </span>
          </h3>
          <div className="hub-task-list">
            {group.cards.length ? (
              group.cards.map((card) => (
                <article
                  className={`hub-task ${card.selectedChoice ? (card.selectedChoice === "N" ? "selected-negative" : "selected-positive") : ""}`}
                  key={card.key}
                >
                  <ItemIconButton
                    itemKey={`${group.id}:${card.key}`}
                    label={card.label || card.value || group.title}
                  />
                  <div className="hub-task-copy">
                    {card.label && <small>{card.label}</small>}
                    <strong>{card.value || "항목"}</strong>
                  </div>
                  <div
                    className="hub-task-actions"
                    aria-label={`${card.value || card.label} 점수`}
                  >
                    {card.scoreRange ? (
                      <select
                        className={`hub-score-select ${card.selectedChoice && card.selectedChoice !== "N" ? "is-selected" : ""}`}
                        aria-label={`${card.value || card.label} Y 점수 선택`}
                        value={
                          card.scoreRange.some(
                            (score) => String(score) === card.selectedChoice,
                          )
                            ? card.selectedChoice
                            : ""
                        }
                        onChange={(event) => {
                          if (event.target.value)
                            card.onToggle(event.target.value);
                          else if (
                            card.selectedChoice &&
                            card.selectedChoice !== "N"
                          )
                            card.onToggle(card.selectedChoice);
                        }}
                      >
                        <option value="">Y · 점수</option>
                        {card.scoreRange.map((score) => (
                          <option key={score} value={score}>
                            {formatScore(score)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ["Y"].map((choice) => (
                        <button
                          key={choice}
                          className="yes"
                          aria-pressed={
                            String(card.selectedChoice) === String(choice)
                          }
                          onClick={() => card.onToggle(choice)}
                        >
                          <span>
                            {choice === "Y" ? "Y" : formatScore(choice)}
                          </span>
                          {choice === "Y" && (
                            <small>{formatScore(card.yScore)}</small>
                          )}
                        </button>
                      ))
                    )}
                    <button
                      className="no"
                      aria-pressed={card.selectedChoice === "N"}
                      onClick={() => card.onToggle("N")}
                    >
                      <span>N</span>
                      <small>{formatScore(card.nScore)}</small>
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="hub-empty-inline">등록된 일정이 없습니다.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
