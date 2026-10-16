import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  CalendarDays,
  Star,
  ChevronRight,
  StickyNote,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useDashboardData } from "../context.jsx";
import { MemoArea } from "../../dashboard/components.jsx";
import { TimePicker } from "../CalendarEventEditor.jsx";
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
const markerWeekdays = ["일", "월", "화", "수", "목", "금", "토"];

function markerDateLabel(date) {
  if (!date) return "";
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day} (${markerWeekdays[new Date(`${date}T12:00:00`).getDay()]})`;
}

function markerTone(dday) {
  if (dday === "D-Day") return "is-today";
  if (dday.startsWith("D-")) return "is-upcoming";
  if (dday.startsWith("D+")) return "is-past";
  return "is-empty";
}

const isFilledMarker = (marker) => Boolean(marker.text.trim() || marker.date || marker.time);

function DateMarkerEditor({ markers, onClose }) {
  const d = useDashboardData();
  const [editing, setEditing] = useState(-1);
  const [dragFrom, setDragFrom] = useState(-1);
  const [dragOver, setDragOver] = useState(-1);
  const [armed, setArmed] = useState(-1);
  const focusIndex = useRef(-1);
  const list = useRef(null);
  const rows = markers
    .map((marker, index) => ({ ...marker, index }))
    .filter((marker) => isFilledMarker(marker) || marker.index === editing);
  const filledCount = markers.filter(isFilledMarker).length;
  useEffect(() => {
    if (focusIndex.current < 0) return;
    list.current?.querySelector(`[data-marker="${focusIndex.current}"] .mk-text`)?.focus();
    focusIndex.current = -1;
  });
  const add = () => {
    const empty = markers.findIndex((marker) => !isFilledMarker(marker));
    if (empty < 0) return;
    let lastFilled = -1;
    markers.forEach((marker, index) => { if (isFilledMarker(marker)) lastFilled = index; });
    const target = empty < lastFilled ? lastFilled : empty;
    if (target !== empty) d.moveDateMarker(empty, target);
    focusIndex.current = target;
    setEditing(target);
  };
  const move = (from, to) => {
    if (to < 0 || to >= rows.length) return;
    const target = rows[to].index;
    d.moveDateMarker(from, target);
    if (editing === from) setEditing(target);
  };
  const endDrag = () => { setDragFrom(-1); setDragOver(-1); setArmed(-1); };
  return (
    <ol className="mk-list" ref={list}>
      {rows.map((marker, position) => {
        const dday = formatDDay(marker.date, d.selectedDate);
        const isEditing = editing === marker.index;
        return (
          <li
            key={marker.index}
            data-marker={marker.index}
            className={`mk-row${isEditing ? " is-editing" : ""}${dragFrom === marker.index ? " is-dragging" : ""}${dragOver === marker.index && dragFrom !== marker.index ? (dragFrom > marker.index ? " is-drop-before" : " is-drop-after") : ""}`}
            draggable={armed === marker.index}
            onDragStart={(event) => { setDragFrom(marker.index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(marker.index)); }}
            onDragOver={(event) => { if (dragFrom < 0) return; event.preventDefault(); if (dragOver !== marker.index) setDragOver(marker.index); }}
            onDrop={(event) => { event.preventDefault(); if (dragFrom >= 0 && dragFrom !== marker.index) d.moveDateMarker(dragFrom, marker.index); endDrag(); }}
            onDragEnd={endDrag}
          >
            <span
              className="mk-grip"
              title="끌어서 순서 바꾸기"
              aria-hidden="true"
              onPointerDown={() => setArmed(marker.index)}
              onPointerUp={() => setArmed(-1)}
            >
              <GripVertical size={14} />
            </span>
            <span className={`mk-dday ${markerTone(dday)}`}>{marker.date ? dday : "D"}</span>
            <input
              className="mk-text"
              type="text"
              maxLength={36}
              placeholder="이름"
              aria-label={`Marker ${position + 1} 이름`}
              value={marker.text}
              onChange={(event) => d.updateDateMarker(marker.index, "text", event.target.value)}
            />
            <button
              type="button"
              className={`mk-when${marker.date ? "" : " is-empty"}`}
              aria-expanded={isEditing}
              title="날짜·시간 편집"
              onClick={() => setEditing(isEditing ? -1 : marker.index)}
            >
              {marker.date ? <span>{markerDateLabel(marker.date)}</span> : <span>날짜</span>}
              {marker.time && <small>{marker.time}</small>}
            </button>
            {isEditing && (
              <div className="mk-edit">
                <input
                  className="mk-date"
                  type="date"
                  aria-label={`Marker ${position + 1} 날짜`}
                  value={marker.date}
                  onClick={(event) => event.currentTarget.showPicker?.()}
                  onChange={(event) => d.updateDateMarker(marker.index, "date", event.target.value)}
                />
                <TimePicker
                  label={`Marker ${position + 1}`}
                  value={marker.time}
                  onChange={(time) => d.updateDateMarker(marker.index, "time", time)}
                />
                <span className="mk-edit-tools">
                  <button type="button" title="위로" aria-label="위로 옮기기" disabled={position === 0} onClick={() => move(marker.index, position - 1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" title="아래로" aria-label="아래로 옮기기" disabled={position === rows.length - 1} onClick={() => move(marker.index, position + 1)}>
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" className="is-danger" title="삭제" aria-label="Marker 삭제" onClick={() => { d.removeDateMarker(marker.index); setEditing(-1); }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            )}
          </li>
        );
      })}
      <li className="mk-foot">
        {filledCount < markers.length && (
          <button type="button" className="mk-add" onClick={add}>
            <Plus size={14} /> Marker 추가
          </button>
        )}
        <span className="mk-count">{filledCount}/{markers.length}</span>
        <button type="button" className="mk-done" onClick={onClose}>완료</button>
      </li>
    </ol>
  );
}

function DateMarkers() {
  const d = useDashboardData();
  const [open, toggle] = usePanelOpen("flow-markers", false);
  const markers = normalizeDateMarkers(d.data.dateMarkers);
  const filled = markers.filter((marker) => marker.text.trim() || marker.date);
  return (
    <section className={`flow-markers ${open ? "" : "is-collapsed"}`}>
      <div className="hub-section-title">
        <h2>
          <Star size={18} />
          Date Marker
        </h2>
        <PanelToggle open={open} onToggle={toggle} label="Date Marker" />
      </div>
      {open ? (
        <DateMarkerEditor markers={markers} onClose={toggle} />
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
