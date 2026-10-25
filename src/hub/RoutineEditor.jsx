import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, Trash2, GripVertical, Repeat2, CalendarRange, ChevronUp, ChevronDown, FolderPlus } from "lucide-react";
import { useDashboardData } from "./context.jsx";
import ItemIconButton from "./ItemIconButton.jsx";
import { weekDays, getWeekdayKey, getWeekSerial, getWeeklyPlanItems, encodeWeeklyPlanItems, weeklyGroupColors } from "../dashboard/model.js";
import { groupStyle, groupWeeklyCategories, weeklyGroupPalette } from "./weeklyGroups.js";

function ScoreInput({ value, choice, label, onChange }) {
  return <label className={`routine-score-field is-${choice.toLowerCase()}`} title={choice === "Y" ? "3처럼 숫자 하나, 또는 1-3처럼 구간 (구간이면 Today's Tasks에서 점수를 골라요)" : undefined}>
    <span>{choice}</span><input aria-label={`${label} ${choice} 점수`} type="text"
      inputMode={choice === "Y" ? "text" : "numeric"} value={value} onChange={(e) => onChange(e.target.value)} />
  </label>;
}

// Grab the handle and drag (mouse or finger) to reorder. Arrow keys on the
// focused handle move one step. The item takes the slot it is dropped on.
function OrderControl({ index, items, label, drag }) {
  const key = items[index].key;
  return <div className="routine-order-controls">
    <button type="button" className="routine-drag-handle" aria-label={`${label} 순서 옮기기 (끌거나 위아래 화살표)`} title="끌어서 순서 옮기기"
      onPointerDown={(e) => drag.start(e, key)}
      onKeyDown={(e) => {
        const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        const target = items[index + step];
        if (!step || !target) return;
        e.preventDefault();
        drag.move(key, target.key);
        requestAnimationFrame(() => drag.focus(key));
      }}>
      <GripVertical size={17} aria-hidden="true" />
    </button>
  </div>;
}

function useRowDrag(root, move) {
  const [state, setState] = useState({ from: null, over: null });
  const session = useRef(null);
  useEffect(() => () => session.current?.stop(), []);
  const rows = () => [...(root.current?.querySelectorAll("[data-item-key]") || [])];
  const start = (event, key) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    let over = key;
    let lastY = event.clientY;
    let scrollTimer = 0;
    let lastX = event.clientX;
    // The row under the finger, or the nearest one (Daily can be two columns).
    const pick = (y, x = lastX) => {
      const list = rows();
      if (!list.length) return;
      const distance = (row) => {
        const box = row.getBoundingClientRect();
        const dx = Math.max(box.left - x, 0, x - box.right);
        const dy = Math.max(box.top - y, 0, y - box.bottom);
        return dx * dx + dy * dy;
      };
      const hit = list.reduce((best, row) => distance(row) < distance(best) ? row : best);
      if (hit.dataset.itemKey !== over) { over = hit.dataset.itemKey; setState({ from: key, over }); }
    };
    // Near the top or bottom of the screen the page scrolls so long lists can be reordered.
    const autoScroll = () => {
      const edge = 70;
      const speed = lastY < edge ? -(edge - lastY) / 4 : lastY > window.innerHeight - edge ? (lastY - window.innerHeight + edge) / 4 : 0;
      if (speed) { window.scrollBy(0, speed); pick(lastY); }
      scrollTimer = requestAnimationFrame(autoScroll);
    };
    const onMove = (e) => { e.preventDefault(); lastY = e.clientY; lastX = e.clientX; pick(e.clientY); };
    const finish = (commit) => {
      stop();
      if (commit && over !== key) move(key, over);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e) => { if (e.key === "Escape") finish(false); };
    const stop = () => {
      cancelAnimationFrame(scrollTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("is-row-dragging");
      session.current = null;
      setState({ from: null, over: null });
    };
    session.current?.stop();
    session.current = { stop };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    document.documentElement.classList.add("is-row-dragging");
    setState({ from: key, over: key });
    scrollTimer = requestAnimationFrame(autoScroll);
  };
  const focus = (key) => rows().find((row) => row.dataset.itemKey === key)?.querySelector(".routine-drag-handle")?.focus();
  const order = (items) => Object.fromEntries(items.map((item, index) => [item.key, index]));
  const rowClass = (key, items) => {
    if (!state.from) return "";
    if (key === state.from) return " is-dragging";
    if (key !== state.over) return "";
    if (key.startsWith("group:")) return " is-drop-after";
    const index = order(items);
    return index[state.from] > index[key] ? " is-drop-before" : " is-drop-after";
  };
  return { start, move, focus, rowClass };
}

function useNewItemFocus(items) {
  const root = useRef(null);
  const previous = useRef(items.map((item) => item.key));
  useLayoutEffect(() => {
    const added = items.find((item) => !previous.current.includes(item.key));
    previous.current = items.map((item) => item.key);
    if (added) {
      const node = [...root.current.querySelectorAll('[data-item-key]')].find((el) => el.dataset.itemKey === added.key)?.querySelector('input');
      node?.focus(); node?.select();
    }
  }, [items]);
  return root;
}

function PresetEditor({ kind, heading, toggle }) {
  const d = useDashboardData();
  const title = "Daily";
  const presets = d.data.presets;
  const root = useNewItemFocus(presets);
  const update = (index, field, value) => d.updatePreset(index, field, value);
  const remove = (index) => d.removePreset(index);
  const drag = useRowDrag(root, d.movePreset);
  return <div className="routine-config-editor" ref={root} aria-label={`${title} 편집`}>
    <div className="routine-editor-actions">{heading && <h2><Repeat2 size={18} />{title}<small>{presets.length}</small></h2>}<span className="routine-editor-tools"><button className="routine-add-button" type="button" aria-label={`${title} 항목 추가`} title="항목 추가" onClick={d.addPreset}><Plus size={17} /><span className="routine-add-label">항목 추가</span></button>{toggle}</span></div>
    {heading && <div className="routine-table-heads" aria-hidden="true">
      {["", " is-secondary", " is-tertiary"].map((extra) => <div key={extra} className={`routine-table-head${extra}`}><span>항목</span><span>Y</span><span>N</span></div>)}
    </div>}
    <div className="routine-preset-list">
      {presets.map((preset, index) => <article className={`routine-preset-row${drag.rowClass(preset.key, presets)}`} key={preset.key} data-item-key={preset.key}>
        <OrderControl index={index} items={presets} drag={drag} label={preset.name || title} />
        <ItemIconButton itemKey={`${kind}:${preset.key}`} label={preset.name || title} />
        <input className="routine-name-input" aria-label={`${title} 항목 이름 ${index + 1}`} placeholder="항목 이름" maxLength={32} value={preset.name}
          onChange={(e) => update(index, "name", e.target.value)} />
        <ScoreInput choice="Y" label={`${title} ${preset.name}`} value={preset.yScore} onChange={(value) => update(index, "yScore", value)} />
        <ScoreInput choice="N" label={`${title} ${preset.name}`} value={preset.nScore} onChange={(value) => update(index, "nScore", value)} />
        <button className="routine-delete-button" type="button" aria-label={`${title} ${preset.name} 삭제`} onClick={() => remove(index)}><Trash2 size={18} /></button>
      </article>)}
    </div>
    {!presets.length && <p className="routine-editor-empty">항목을 추가해 루틴을 만들어보세요.</p>}
  </div>;
}

// One weekday's plan. Several entries rotate week by week (the same rule
// getWeeklyPlanEntry uses), so the entry that applies this week is marked.
function WeeklyDay({ day, label, value, today, onChange, selectedDate }) {
  const items = getWeeklyPlanItems(value);
  const filled = items.map((item) => item.trim()).filter(Boolean);
  const current = filled.length > 1 ? ((getWeekSerial(selectedDate) % filled.length) + filled.length) % filled.length : -1;
  const refs = useRef([]);
  useLayoutEffect(() => {
    for (const node of refs.current) {
      if (!node) continue;
      node.style.height = "0px";
      node.style.height = `${node.scrollHeight}px`;
    }
  }, [value]);
  const save = (next, focus = -1) => {
    onChange(encodeWeeklyPlanItems(next));
    if (focus >= 0) requestAnimationFrame(() => refs.current[focus]?.focus());
  };
  const update = (index, text) => save(items.map((item, i) => i === index ? text : item));
  // Removing an extra entry folds its text into the one above, so nothing typed is lost.
  const merge = (index) => {
    const next = [...items];
    const [removed] = next.splice(index, 1);
    next[index - 1] = [next[index - 1], removed].filter(Boolean).join("\n");
    save(next, index - 1);
  };
  let filledIndex = -1;
  return <div className={`wk-day ${today ? "is-today" : ""} ${filled.length ? "" : "is-empty"}`} role="group" aria-label={`${label} ${day.full}`}>
    <span className="wk-day-name">{day.label}{today && <em>오늘</em>}</span>
    {items.map((item, index) => {
      if (item.trim()) filledIndex += 1;
      const isCurrent = item.trim() && filledIndex === current;
      return <div className={`wk-entry ${isCurrent ? "is-current" : ""}`} key={index}>
        {filled.length > 1 && item.trim() && <b className="wk-turn" title={isCurrent ? "이번 주에 나오는 항목" : "다른 주에 나오는 항목"}>{filledIndex + 1}</b>}
        <textarea ref={(node) => { refs.current[index] = node; }} rows={1} maxLength={180} placeholder="+ 할 일" aria-label={`${label} ${day.full} ${index + 1}`}
          value={item} onChange={(e) => update(index, e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        {index > 0 && <button type="button" className="wk-entry-remove" aria-label="이 항목 합치기" title="위 항목과 합치기" onClick={() => merge(index)}>×</button>}
      </div>;
    })}
    {filled.length > 0 && <button type="button" className="wk-rotate-add" title="주마다 번갈아 나올 항목 추가" onClick={() => save([...items, ""], items.length)}>+ 번갈아</button>}
  </div>;
}

// Colour dot of a group; hovering it (tapping on touch screens) opens a small
// card of colour swatches, like the Y score picker in Today's Tasks.
function GroupColorPicker({ group, onPick }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <div className={`wk-color-picker${open ? " is-open" : ""}`} ref={root}>
    <button type="button" className="wk-color-dot" aria-haspopup="true" aria-expanded={open} aria-label={`${group.name || "그룹"} 색 바꾸기`} title="색 바꾸기"
      onClick={() => setOpen((value) => !value)}><i /></button>
    <div className="wk-color-pop" role="group" aria-label={`${group.name || "그룹"} 색`}>
      {weeklyGroupColors.map((color) => <button type="button" key={color} aria-pressed={group.color === color} aria-label={weeklyGroupPalette[color].label} title={weeklyGroupPalette[color].label}
        style={{ "--swatch": weeklyGroupPalette[color].ink }} onClick={() => { onPick(color); setOpen(false); }} />)}
    </div>
  </div>;
}

function GroupHead({ group, count, index, total, dragClass, d }) {
  if (!group) return <div className={`wk-group-head is-loose${dragClass}`} data-item-key="group:">
    <span className="wk-group-title">그룹 없음</span><small>{count}</small>
  </div>;
  return <div className={`wk-group-head${dragClass}`} data-item-key={`group:${group.key}`} style={groupStyle(group)}>
    <GroupColorPicker group={group} onPick={(color) => d.updateWeeklyGroup(group.key, "color", color)} />
    <input className="wk-group-name" aria-label="그룹 이름" placeholder="그룹 이름" maxLength={24} value={group.name}
      onChange={(e) => d.updateWeeklyGroup(group.key, "name", e.target.value)} />
    <small>{count}</small>
    <span className="wk-group-tools">
      <button type="button" aria-label={`${group.name} 그룹 위로`} title="그룹 위로" disabled={index === 0} onClick={() => d.moveWeeklyGroup(group.key, -1)}><ChevronUp size={16} /></button>
      <button type="button" aria-label={`${group.name} 그룹 아래로`} title="그룹 아래로" disabled={index === total - 1} onClick={() => d.moveWeeklyGroup(group.key, 1)}><ChevronDown size={16} /></button>
      <button type="button" aria-label={`${group.name} 그룹에 카테고리 추가`} title="이 그룹에 카테고리 추가" onClick={() => d.addCategory(group.key)}><Plus size={16} /></button>
      <button type="button" aria-label={`${group.name} 그룹 삭제`} title="그룹 삭제 (카테고리는 남아요)" onClick={() => d.removeWeeklyGroup(group.key)}><Trash2 size={15} /></button>
    </span>
  </div>;
}

// Weekly: rows with Y/N scores and a task per weekday, shown group by group.
function WeeklyEditor({ kind, heading, toggle }) {
  const d = useDashboardData();
  const title = "Weekly";
  const noun = "카테고리";
  const all = d.data.categories;
  const plan = d.data.weeklyPlan;
  const { groups, sections } = groupWeeklyCategories(all, d.data.weeklyGroups);
  const rows = sections.flatMap((section) => section.rows);
  const headKey = (group) => `group:${group?.key || ""}`;
  const shown = groups.length ? sections.flatMap((section) => [headKey(section.group), ...section.rows.map((row) => row.key)]) : rows.map((row) => row.key);
  // Dropping on a category takes its place (and its group); dropping on a
  // group title makes it that group's first category.
  const move = (fromKey, toKey) => {
    const fromIndex = shown.indexOf(fromKey);
    const next = shown.filter((key) => key !== fromKey);
    let at = next.indexOf(toKey);
    if (at < 0 || fromIndex < 0) return;
    if (toKey.startsWith("group:") || fromIndex < shown.indexOf(toKey)) at += 1;
    next.splice(at, 0, fromKey);
    let current = "";
    const order = [];
    const members = {};
    for (const key of next) {
      if (key.startsWith("group:")) current = key.slice(6);
      else { order.push(key); members[key] = current; }
    }
    d.arrangeWeeklyCategories(order, members);
  };
  const root = useNewItemFocus(rows);
  const selectedWeekday = getWeekdayKey(d.selectedDate);
  const drag = useRowDrag(root, move);
  const items = shown.map((key) => ({ key }));
  return <div className="routine-config-editor routine-weekly-editor wk-editor" ref={root} aria-label={`${title} 편집`}>
    <div className="routine-editor-actions">{heading && <h2><CalendarRange size={18} />{title}<small>{rows.length}</small></h2>}<span className="routine-editor-tools">
      <button className="routine-add-button wk-group-add" type="button" aria-label="그룹 추가" title="그룹 추가" onClick={() => d.addWeeklyGroup()}><FolderPlus size={17} /><span className="routine-add-label">그룹</span></button>
      <button className="routine-add-button" type="button" aria-label={`${title} ${noun} 추가`} title={`${noun} 추가`} onClick={() => d.addCategory()}><Plus size={17} /><span className="routine-add-label">{noun} 추가</span></button>{toggle}</span></div>
    <p className="wk-guide">요일 칸에 적은 할 일은 그 요일 <b>Today's Tasks</b>에 나와요. 한 칸에 여러 개를 넣으면 주마다 번갈아 나와요. 끝에 <b>(2)</b>처럼 적으면 그 할 일은 무조건 Y 2점이에요.{groups.length ? " 카테고리를 끌어서 다른 그룹으로 옮길 수 있어요." : ""}</p>
    <div className="routine-table-heads wk-table-heads" aria-hidden="true">
      <div className="routine-table-head"><span>항목</span><span>Y</span><span>N</span></div>
    </div>
    {/* Wide panels show the editor as one timetable: this weekday row on top,
        then one row per category with its seven day cells under it. */}
    <div className="wk-board-head" aria-hidden="true">
      <span>{noun}</span>
      {weekDays.map((day) => <span key={day.key} className={selectedWeekday === day.key ? "is-today" : ""}>{day.label}{selectedWeekday === day.key && <em>오늘</em>}</span>)}
    </div>
    <div className={`wk-list${groups.length ? " has-groups" : ""}`}>
      {sections.map((section, sectionIndex) => <React.Fragment key={headKey(section.group)}>
        {groups.length > 0 && <GroupHead group={section.group} count={section.rows.length} index={sectionIndex} total={groups.length} d={d}
          dragClass={drag.rowClass(headKey(section.group), items)} />}
        {section.rows.map((row) => {
          const index = rows.indexOf(row);
          return <article className={`wk-cat${section.group ? " is-grouped" : ""}${drag.rowClass(row.key, items)}`} key={row.key} data-item-key={row.key} style={groupStyle(section.group)}>
            {/* Same row layout as a Daily item: order, icon, name, Y, N, delete. */}
            <header className="routine-preset-row wk-cat-row">
              <OrderControl index={index} items={rows} drag={drag} label={row.label || noun} />
              <ItemIconButton itemKey={`${kind}:${row.key}`} label={row.label || noun} />
              <input className="routine-name-input wk-cat-name" aria-label={`${title} ${noun} 이름 ${index + 1}`} placeholder={`${noun} 이름`} maxLength={24} value={row.label} onChange={(e) => d.updateCategory(row.key, "label", e.target.value)} />
              <div className="wk-cat-scores">
                <ScoreInput choice="Y" label={row.label} value={row.yScore} onChange={(value) => d.updateCategory(row.key, "yScore", value)} />
                <ScoreInput choice="N" label={row.label} value={row.nScore} onChange={(value) => d.updateCategory(row.key, "nScore", value)} />
              </div>
              <button type="button" className="routine-delete-button" disabled={all.length <= 1} aria-label={`${row.label} ${noun} 삭제`} onClick={() => d.removeCategory(row.key)}><Trash2 size={18} /></button>
            </header>
            <div className="wk-days">
              {weekDays.map((day) => <WeeklyDay key={day.key} day={day} label={row.label} today={selectedWeekday === day.key} selectedDate={d.selectedDate}
                value={plan[row.key]?.[day.key] || ""} onChange={(value) => d.updateWeeklyPlan(row.key, day.key, value)} />)}
            </div>
          </article>;
        })}
      </React.Fragment>)}
    </div>
  </div>;
}

export default function RoutineEditor({ kind, heading = false, toggle = null }) {
  return kind === "weekly" ? <WeeklyEditor key={kind} kind={kind} heading={heading} toggle={toggle} /> : <PresetEditor key={kind} kind={kind} heading={heading} toggle={toggle} />;
}
