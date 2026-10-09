import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  CalendarDays,
  ListTodo,
  ChevronRight,
  ChevronLeft,
  StickyNote,
} from "lucide-react";
import { useDashboardData } from "../context.jsx";
import { addDays, calendarDutyOptions } from "../../dashboard/model.js";
import {
  CalendarPanel,
  MobileCalendarPanel,
  DateMarkerPanel,
  MemoArea,
} from "../../dashboard/components.jsx";
import { MemoFormatToolbar } from "../../MemoEditor.jsx";
import { DateHeading, RoutineTasks } from "./shared.jsx";
import { moduleIds } from "../routing.js";
import { todayKey } from "../routing.js";
import ItemIconButton from "../ItemIconButton.jsx";

function MemoDesk() {
  const d = useDashboardData();
  const cards = d.data.memos.cards;
  const card =
    cards.find((item) => item.id === d.data.memos.activeMemoId) || cards[0];
  const areas = [
    ["leftTitle", "leftText"],
    ["centerTitle", "centerText"],
    ["rightTitle", "rightText"],
    ["leftExtraTitle", "leftTextExtra"],
    ["centerExtraTitle", "centerTextExtra"],
    ["rightExtraTitle", "rightTextExtra"],
  ];
  if (!card) return null;
  return (
    <section className="hub-memo-section" aria-label="메모">
      <div className="hub-memo-toolbar">
        <h2>
          <StickyNote size={18} />
          Memo
        </h2>
        <div className="hub-memo-tabs" aria-label="메모 묶음">
          {cards.map((item, index) => (
            <button
              key={item.id}
              draggable
              title={item.title}
              aria-label={`메모 묶음 ${index + 1}`}
              aria-pressed={item.id === card.id}
              onClick={() => d.setActiveMemo(item.id)}
              onDragStart={(event) =>
                event.dataTransfer.setData("text/memo-card", item.id)
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                d.moveMemoCard(
                  event.dataTransfer.getData("text/memo-card"),
                  item.id,
                );
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
          <button
            aria-label="메모 묶음 추가"
            title="메모 묶음 추가"
            onClick={d.addMemoCard}
          >
            <Plus size={18} />
          </button>
        </div>
        <MemoFormatToolbar />
        <button
          className="hub-delete-memo"
          aria-label="메모 묶음 삭제"
          title="메모 묶음 삭제"
          disabled={cards.length <= 1}
          onClick={() => d.removeMemoCard(card.id)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="hub-memo-group-heading">
        <ItemIconButton itemKey={`memo:${card.id}:title`} label="메모 묶음" />
        <input
          className="hub-memo-group-title"
          aria-label="메모 묶음 제목"
          value={card.title}
          onChange={(e) => d.updateMemoCard(card.id, "title", e.target.value)}
        />
      </div>
      <div className="hub-memo-grid">
        {areas.map(([titleField, field], index) => (
          <article
            className="hub-memo-cell"
            key={`${d.account.user?.id || "local"}:${card.id}:${field}`}
            data-color={index}
          >
            <span className="hub-memo-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <MemoArea
              cardId={card.id}
              draftScope={d.account.user?.id || "local"}
              field={field}
              titleField={titleField}
              titleValue={card[titleField] || ""}
              titleIcon={
                <ItemIconButton
                  itemKey={`memo:${card.id}:${titleField}`}
                  label={`메모 ${index + 1}`}
                />
              }
              value={card[field] || ""}
              marks={card.textFormats?.[field] || []}
              updateMemoCard={d.updateMemoCard}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Flow({ route, navigate }) {
  const d = useDashboardData();
  const calendar = route.section === "calendar";
  return (
    <div className="flow-view">
      <DateHeading title="Flow" />
      <nav className="hub-segments" aria-label="Flow 보기">
        <button
          aria-current={!calendar ? "page" : undefined}
          onClick={() => navigate("flow", "today")}
        >
          <ListTodo size={17} />
          Today
        </button>
        <button
          aria-current={calendar ? "page" : undefined}
          onClick={() => navigate("flow", "calendar")}
        >
          <CalendarDays size={17} />
          Calendar
        </button>
      </nav>
      {calendar ? (
        <div className="flow-calendar">
          {d.effectiveDisplayMode === "mobile" ? (
            <MobileCalendarPanel
              calendar={d.data.calendar}
              calendarDuties={d.data.calendarDuties}
              selectedDate={d.selectedDate}
              setSelectedDate={d.setSelectedDate}
              toggleCalendarDuty={d.toggleCalendarDuty}
              updateCalendarNote={d.updateCalendarNote}
            />
          ) : (
            <CalendarPanel
              calendar={d.data.calendar}
              calendarDuties={d.data.calendarDuties}
              selectedDate={d.selectedDate}
              isOpen
              onToggle={() => {}}
              openMonths={d.openMonths}
              setOpenMonths={d.setOpenMonths}
              toggleCalendarDuty={d.toggleCalendarDuty}
              updateCalendarNote={d.updateCalendarNote}
            />
          )}
          <h2>Date markers</h2>
          <DateMarkerPanel
            dateMarkers={d.data.dateMarkers}
            selectedDate={d.selectedDate}
            updateDateMarker={d.updateDateMarker}
          />
        </div>
      ) : (
        <>
          <div className="flow-overview">
            <section className="flow-schedule">
              <div className="hub-section-title">
                <h2>
                  <CalendarDays size={18} />
                  Schedule
                </h2>
                <button
                  title="전체 달력"
                  aria-label="전체 달력"
                  onClick={() => navigate("flow", "calendar")}
                >
                  <CalendarDays size={18} />
                </button>
              </div>
              <TwoWeekSchedule route={route} navigate={navigate} />
              <div className="flow-selected-heading">
                <strong>
                  {d.selectedDate.slice(5).replace("-", "/")} 일정
                </strong>
                <div className="flow-duty-controls">
                  {calendarDutyOptions.map((option) => (
                    <label key={option.key}>
                      <input
                        type="checkbox"
                        checked={
                          !!d.data.calendarDuties[d.selectedDate]?.[option.key]
                        }
                        onChange={() =>
                          d.toggleCalendarDuty(d.selectedDate, option.key)
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <ScheduleEditor />
              <ExternalFlowItems date={d.selectedDate} navigate={navigate} />
            </section>
            <section className="flow-routines">
              <div className="hub-section-title">
                <h2>
                  <ListTodo size={18} />
                  Routine
                </h2>
                <button
                  aria-label="Routine 열기"
                  title="Routine 열기"
                  onClick={() => navigate("routine")}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <RoutineTasks compact />
            </section>
          </div>
          <MemoDesk />
        </>
      )}
    </div>
  );
}

function TwoWeekSchedule({ route, navigate }) {
  const d = useDashboardData();
  const week = route.week;
  const actualToday = todayKey();
  const move = (direction) =>
    navigate("flow", "today", addDays(d.selectedDate, direction * 7), {
      week: addDays(week, direction * 7),
    });
  return (
    <div className="flow-fortnight">
      <div className="flow-week-navigation">
        <span>
          {week.replaceAll("-", ".")} –{" "}
          {addDays(week, 13).slice(5).replace("-", ".")}
        </span>
        <div>
          <button aria-label="이전 주" title="이전 주" onClick={() => move(-1)}>
            <ChevronLeft size={17} />
          </button>
          <button aria-label="다음 주" title="다음 주" onClick={() => move(1)}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {[0, 1].map((row) => (
        <section
          className="flow-week"
          key={row}
          aria-label={row ? "다음 주 일정" : "이번 주 일정"}
        >
          <h3>{row ? "Next week" : "This week"}</h3>
          <div className="flow-week-grid">
            {Array.from({ length: 7 }, (_, column) => {
              const date = addDays(week, row * 7 + column);
              const lines = (d.data.calendar[date] || "")
                .split("\n")
                .filter((line) => line.trim());
              const duties = calendarDutyOptions.filter(
                (option) => d.data.calendarDuties[date]?.[option.key],
              );
              return (
                <button
                  type="button"
                  className={`flow-day ${date === actualToday ? "is-today" : ""}`}
                  key={date}
                  aria-pressed={date === d.selectedDate}
                  aria-label={`${date} 일정 선택`}
                  onClick={() => navigate("flow", "today", date, { week })}
                >
                  <span className="flow-day-heading">
                    <small>
                      {
                        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                          column
                        ]
                      }
                    </small>
                    <strong>
                      {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                    </strong>
                    {date === actualToday && (
                      <span className="flow-today-dot" title="오늘" />
                    )}
                  </span>
                  <span className="flow-day-content">
                    {duties.length > 0 && (
                      <span className="flow-day-duties">
                        {duties.map((option) => (
                          <span key={option.key}>{option.label}</span>
                        ))}
                      </span>
                    )}
                    {lines.map((line, i) => (
                      <span className="flow-day-event" key={i}>
                        {line}
                      </span>
                    ))}
                    {!lines.length && !duties.length && (
                      <span className="flow-day-empty">—</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScheduleEditor() {
  const d = useDashboardData();
  const ref = useRef(null);
  const value = d.data.calendar[d.selectedDate] || "";
  useLayoutEffect(() => {
    const input = ref.current;
    const fit = () => {
      input.style.height = "0px";
      input.style.height = `${Math.max(70, input.scrollHeight + 2)}px`;
    };
    fit();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width !== input.clientWidth) {
        width = input.clientWidth;
        fit();
      }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value, d.selectedDate]);
  return (
    <textarea
      ref={ref}
      className="flow-schedule-editor"
      aria-label="선택 날짜 일정"
      spellCheck={false}
      placeholder="일정을 입력하세요"
      value={value}
      onChange={(event) =>
        d.updateCalendarNote(d.selectedDate, event.target.value)
      }
    />
  );
}

function ExternalFlowItems({ date, navigate }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    import("../moduleRegistry.js")
      .then(async (registry) => {
        let unsubscribers = [];
        let generation = 0;
        const connect = () => {
          unsubscribers.forEach((unsubscribe) => unsubscribe());
          const sources = registry.getFlowSources();
          let subscriptionFailed = false;
          const refresh = async () => {
            const current = ++generation;
            const results = await Promise.allSettled(
              sources.map(async (source) => {
                const sourceItems = await source.getItems(date);
                if (
                  !Array.isArray(sourceItems) ||
                  sourceItems.some(
                    (item) =>
                      !item ||
                      typeof item.id !== "string" ||
                      typeof item.title !== "string",
                  )
                )
                  throw new Error("Invalid Flow items");
                return { source, items: sourceItems };
              }),
            );
            if (cancelled || current !== generation) return;
            setError(
              results.some((result) => result.status === "rejected")
                ? "일부 연결된 일정을 불러오지 못했습니다."
                : subscriptionFailed
                  ? "일부 연결된 일정의 변경 알림을 받지 못했습니다."
                  : "",
            );
            setItems(
              results
                .filter((result) => result.status === "fulfilled")
                .flatMap((result) =>
                  result.value.items.map((item) => ({
                    ...item,
                    source: result.value.source,
                  })),
                ),
            );
          };
          unsubscribers = sources.flatMap((source) => {
            try {
              return [source.subscribe(refresh)];
            } catch {
              subscriptionFailed = true;
              return [];
            }
          });
          refresh();
        };
        const unsubscribeRegistry = registry.subscribeFlowSources(connect);
        cleanup = () => {
          unsubscribeRegistry();
          unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
        if (cancelled) cleanup();
        else connect();
      })
      .catch(() => {
        if (!cancelled) setError("연결된 일정을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [date]);
  const perform = async (action) => {
    try {
      await action();
      setError("");
    } catch {
      setError("변경하지 못했습니다. 다시 시도해주세요.");
    }
  };
  return (
    <>
      {error && <p role="status">{error}</p>}
      {items.length > 0 && (
        <div className="flow-external-items">
          {items.map((item) => (
            <div key={`${item.source.id}:${item.id}`}>
              <button
                onClick={() =>
                  perform(async () => {
                    const target = await item.source.openTarget(item.id);
                    if (!moduleIds.includes(target?.moduleId))
                      throw new Error("Invalid module target");
                    navigate(target.moduleId, target.section);
                  })
                }
              >
                {item.title}
                <ChevronRight size={16} />
              </button>
              {item.source.execute &&
                item.commands?.map((command) => (
                  <button
                    key={command.id}
                    onClick={() =>
                      perform(() =>
                        item.source.execute(
                          item.id,
                          command.id,
                          command.payload,
                        ),
                      )
                    }
                  >
                    {command.label}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
