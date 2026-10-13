import React, { useEffect } from "react";
import {
  Plus,
  Trash2,
  CalendarDays,
  Flag,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { useDashboardData } from "../context.jsx";
import { DateMarkerPanel, MemoArea } from "../../dashboard/components.jsx";
import { MemoFormatToolbar } from "../../MemoEditor.jsx";
import { DateHeading, PanelToggle, RoutineTasks, usePanelOpen } from "./shared.jsx";
import { formatDDay, normalizeDateMarkers } from "../../dashboard/model.js";
import ItemIconButton from "../ItemIconButton.jsx";
import { ScheduleIcon, navigationStrokeWidth } from "../icons.jsx";
import { FlowScore } from "../FlowSummary.jsx";
import FlowSchedule from "../FlowSchedule.jsx";

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

// Folded, Date Marker is one line of D-day chips; unfolded, the full editor.
function DateMarkers() {
  const d = useDashboardData();
  const [open, toggle] = usePanelOpen("flow-markers", false);
  const filled = normalizeDateMarkers(d.data.dateMarkers).filter(
    (marker) => marker.text.trim() || marker.date,
  );
  return (
    <section className={`flow-markers ${open ? "" : "is-collapsed"}`}>
      <div className="hub-section-title">
        <h2>
          <Flag size={18} />
          Date Marker
        </h2>
        <PanelToggle open={open} onToggle={toggle} label="Date Marker" />
      </div>
      {open ? (
        <DateMarkerPanel
          dateMarkers={d.data.dateMarkers}
          selectedDate={d.selectedDate}
          updateDateMarker={d.updateDateMarker}
        />
      ) : (
        <ul className="flow-marker-chips">
          {filled.map((marker, index) => (
            <li key={index}>
              <span>{marker.text || "Marker"}</span>
              {marker.time && <small>{marker.time}</small>}
              {marker.date && <b>{formatDDay(marker.date, d.selectedDate)}</b>}
            </li>
          ))}
          {!filled.length && (
            <li className="is-empty">
              <button type="button" onClick={toggle}>
                <Plus size={14} /> 추가
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default function Flow({ route, navigate }) {
  const d = useDashboardData();
  useEffect(() => {
    if (route.section === "calendar")
      navigate("routine", "calendar", route.date, {
        week: route.week,
        month: route.month,
        replace: true,
      });
  }, [route.section, route.date, route.week, navigate]);
  return (
    <div className="flow-view">
      <DateHeading title="Flow" />
      <div className="flow-layout">
        <div className="flow-workspace">
          <section className="flow-schedule">
            <div className="hub-section-title">
              <h2>
                <CalendarDays size={18} />
                Schedule
              </h2>
              <button
                title="전체 달력"
                aria-label="전체 달력"
                onClick={() => navigate("routine", "calendar")}
              >
                <CalendarDays size={18} />
              </button>
            </div>
            <FlowSchedule route={route} navigate={navigate} />
          </section>
          <aside className="flow-support" aria-label="오늘 루틴과 보조 정보">
            <section className="flow-routines">
              <div className="hub-section-title">
                <h2>
                  <ScheduleIcon size={18} strokeWidth={navigationStrokeWidth} />
                  Today's Tasks
                </h2>
                <button
                  aria-label="Planner 열기"
                  title="Planner 열기"
                  onClick={() => navigate("routine")}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <FlowScore />
              <RoutineTasks compact />
            </section>
            <DateMarkers />
          </aside>
        </div>
        <MemoDesk />
      </div>
    </div>
  );
}
