import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useDashboardData } from "../context.jsx";
import { todayKey } from "../routing.js";
import ItemIconButton from "../ItemIconButton.jsx";
import { celebrate } from "../celebrate.js";
import { groupStyle, groupWeeklyCategories, splitFixedScore } from "../weeklyGroups.js";
import {
  formatScore,
  getWeeklyPlanEntry,
  getWeeklyPlanItems,
  getWorkoutTurn,
  normalizeWorkoutLists,
} from "../../dashboard/model.js";
import {
  createPresetPlanCard,
  getCategoryScoreRange,
} from "../../dashboard/components.jsx";

// Which panels are folded is a per-device view preference, so it lives in
// localStorage and never touches the synced dashboard data.
const panelStorageKey = "hub-panels-open-v1";

function readPanels() {
  try {
    return JSON.parse(localStorage.getItem(panelStorageKey) || "{}") || {};
  } catch {
    return {};
  }
}

export function usePanelOpen(id, initial = true) {
  const [open, setOpen] = useState(() => readPanels()[id] ?? initial);
  const toggle = () =>
    setOpen((value) => {
      try {
        localStorage.setItem(
          panelStorageKey,
          JSON.stringify({ ...readPanels(), [id]: !value }),
        );
      } catch {}
      return !value;
    });
  return [open, toggle];
}

export function PanelToggle({ open, onToggle, label }) {
  return (
    <button
      type="button"
      className="hub-panel-toggle"
      aria-expanded={open}
      aria-label={`${label} ${open ? "접기" : "펼치기"}`}
      title={open ? "접기" : "펼치기"}
      onClick={onToggle}
    >
      <ChevronDown size={18} />
    </button>
  );
}

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

// Y score range ("1-3"): the Y button opens a small box of score chips on
// hover (or tap on touch screens); picking the chosen score again clears it.
function ScorePicker({ label, range, selected, onPick, onCheer }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const first = range[0];
  const last = range[range.length - 1];
  return (
    <div className={`hub-score-picker${open ? " is-open" : ""}`} ref={root}>
      <button
        type="button"
        className="yes"
        aria-pressed={Boolean(selected)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label} Y 점수 선택`}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Y</span>
        <small>{selected ? formatScore(selected) : `${first}~${last}`}</small>
      </button>
      <div className="hub-score-pop" role="group" aria-label={`${label} Y 점수`}>
        {range.map((score) => (
          <button
            type="button"
            key={score}
            aria-pressed={String(score) === selected}
            onClick={() => { if (String(score) !== selected) onCheer?.(root.current?.querySelector(".yes")); onPick(String(score)); setOpen(false); }}
          >
            {formatScore(score)}
          </button>
        ))}
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
  // Weekly and EDU: a row shows up on the weekdays that have a task written.
  const planCards = (rows, plan, prefix, fallback) => rows
    .map((row) => {
      const label = row.label ?? row.name ?? "";
      // A task ending in "(2)" always scores Y 2 instead of the category's score or range.
      const entry = getWeeklyPlanEntry(plan?.[row.key]?.[d.weekday.key], d.selectedDate);
      const { text: value, score: fixedScore } = splitFixedScore(entry.value);
      const yScore = fixedScore ?? row.yScore;
      const planKey = `${prefix}:${d.selectedDate}:${row.key}`;
      const range = fixedScore === null ? getCategoryScoreRange(row) : [];
      return {
        key: row.key,
        label,
        value,
        // A rest week ("쉬는 주") leaves the task out of Today's Tasks.
        scheduled: !entry.rest && getWeeklyPlanItems(plan?.[row.key]?.[d.weekday.key]).some((item) => item.trim()),
        scoreRange: range.length > 1 ? range : null,
        yScore,
        nScore: row.nScore,
        selectedChoice:
          d.entries.find((entry) => entry.planKey === planKey)?.choice || "",
        onToggle: (choice) =>
          d.toggleChoice({
            planKey,
            choice: String(choice),
            name: `${label || fallback}: ${value} (${choice})`,
            score: Number(
              choice === "N"
                ? row.nScore
                : choice === "Y"
                  ? yScore
                  : choice,
            ),
          }),
      };
    })
    .filter((card) => card.scheduled || card.selectedChoice);
  // Weekly cards follow the Planner's group order and carry the group colour.
  const { sections } = groupWeeklyCategories(d.data.categories, d.data.weeklyGroups);
  const groupByKey = new Map(sections.flatMap((section) => section.rows.map((row) => [row.key, section.group])));
  const weeklyCards = planCards(sections.flatMap((section) => section.rows), d.data.weeklyPlan, "plan", "Weekly")
    .map((card) => ({ ...card, group: groupByKey.get(card.key) || null }));
  // WorkOut: one card per field, whose turn it is today; checking it moves the turn on.
  const workoutCards = normalizeWorkoutLists(d.data.workoutLists, d.data.workout).lists.flatMap((list) => {
    const turn = getWorkoutTurn(list, d.selectedDate);
    return turn.item ? [{
      key: turn.item.key, label: list.name, value: turn.item.name || "운동", workout: true,
      selectedChoice: turn.done ? "Y" : "",
      onToggle: () => d.toggleWorkoutDone(list.key, d.selectedDate, turn.item.key),
    }] : [];
  });
  // Checking pops the pressed button with a little burst; finishing a whole
  // group gets a bigger one from its count. Unchecking stays quiet.
  const cheer = (button, card, group, choice) => {
    if (String(card.selectedChoice) === String(choice)) return;
    if (choice === "N") { celebrate(button, { tone: "minus", burst: false }); return; }
    celebrate(button, { tone: card.workout ? "gold" : "plus" });
    const doneAfter = group.cards.filter((item) => item.selectedChoice).length + (card.selectedChoice ? 0 : 1);
    if (doneAfter === group.cards.length) {
      const count = button?.closest(".hub-task-group")?.querySelector("h3 > span");
      setTimeout(() => celebrate(count, { tone: "gold", big: true }), 180);
    }
  };
  const groups = [
    {
      id: "daily",
      title: "Daily",
      cards: presetCards(d.data.presets, "Daily", "daily"),
    },
    { id: "weekly", title: "Weekly", cards: weeklyCards },
    { id: "workout", title: "WorkOut", cards: workoutCards },
  ];
  return (
    <div className={`hub-task-groups ${compact ? "is-compact" : ""}`}>
      {!groups.some((group) => group.cards.length) && <p className="hub-empty-inline">Planner에서 루틴을 추가해주세요.</p>}
      {groups.filter((group) => group.cards.length).map((group) => (
        <section className="hub-task-group" data-kind={group.id} key={group.id}>
          <h3
            style={{
              "--done": `${(group.cards.filter((card) => card.selectedChoice).length / group.cards.length) * 100}%`,
            }}
          >
            {group.title}
            <span>
              {group.cards.filter((card) => card.selectedChoice).length}/
              {group.cards.length}
            </span>
          </h3>
          <div className="hub-task-list">
            {group.cards.length ? (
              group.cards.map((card, index) => (
                <React.Fragment key={card.key}>
                {/* Weekly groups: a small coloured title where a new group starts. */}
                {group.id === "weekly" && group.cards.some((item) => item.group) && (index === 0 || group.cards[index - 1].group !== card.group) && (
                  <p className={`hub-task-subgroup${card.group ? "" : " is-loose"}`} style={groupStyle(card.group)}>
                    {card.group ? <><i aria-hidden="true" />{card.group.name || "그룹"}</> : "기타"}
                  </p>
                )}
                <article
                  className={`hub-task ${card.selectedChoice ? (card.selectedChoice === "N" ? "selected-negative" : "selected-positive") : ""}${card.group ? " has-group" : ""}`}
                  key={card.key}
                  style={groupStyle(card.group)}
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
                    {card.workout ? (
                      <button
                        className="yes workout-done"
                        aria-pressed={Boolean(card.selectedChoice)}
                        aria-label={card.selectedChoice ? `${card.value} 완료 취소` : `${card.value} 완료`}
                        title={card.selectedChoice ? "완료 취소" : "했어요"}
                        onClick={(e) => { cheer(e.currentTarget, card, group, "Y"); card.onToggle(); }}
                      >
                        <Check size={16} strokeWidth={2.4} />
                      </button>
                    ) : card.scoreRange ? (
                      <ScorePicker
                        label={card.value || card.label}
                        range={card.scoreRange}
                        selected={card.selectedChoice && card.selectedChoice !== "N" ? card.selectedChoice : ""}
                        onPick={card.onToggle}
                        onCheer={(button) => cheer(button, card, group, "picked")}
                      />
                    ) : (
                      ["Y"].map((choice) => (
                        <button
                          key={choice}
                          className="yes"
                          aria-pressed={
                            String(card.selectedChoice) === String(choice)
                          }
                          onClick={(e) => { cheer(e.currentTarget, card, group, choice); card.onToggle(choice); }}
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
                    {!card.workout && <button
                      className="no"
                      aria-pressed={card.selectedChoice === "N"}
                      onClick={(e) => { cheer(e.currentTarget, card, group, "N"); card.onToggle("N"); }}
                    >
                      <span>N</span>
                      <small>{formatScore(card.nScore)}</small>
                    </button>}
                  </div>
                </article>
                </React.Fragment>
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
