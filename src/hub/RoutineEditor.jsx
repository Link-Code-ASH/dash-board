import React, { useLayoutEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Repeat2, CalendarRange, GraduationCap } from "lucide-react";
import { useDashboardData } from "./context.jsx";
import ItemIconButton from "./ItemIconButton.jsx";
import { weekDays, getWeekdayKey, getWeekSerial, getWeeklyPlanItems, encodeWeeklyPlanItems } from "../dashboard/model.js";

function ScoreInput({ value, choice, label, onChange }) {
  return <label className={`routine-score-field is-${choice.toLowerCase()}`}>
    <span>{choice}</span><input aria-label={`${label} ${choice} 점수`} type="text"
      inputMode={choice === "Y" ? "text" : "numeric"} value={value} onChange={(e) => onChange(e.target.value)} />
  </label>;
}

function OrderControl({ index, items, onMove, label }) {
  return <div className="routine-order-controls">
    <GripVertical size={17} aria-hidden="true" />
    <div>
      <button type="button" aria-label={`${label} 위로 이동`} disabled={index === 0} onClick={() => onMove(items[index].key, items[index - 1].key)}><ChevronUp size={15} /></button>
      <button type="button" aria-label={`${label} 아래로 이동`} disabled={index === items.length - 1} onClick={() => onMove(items[index].key, items[index + 1].key)}><ChevronDown size={15} /></button>
    </div>
  </div>;
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

function dragProps(key, move) {
  return {
    draggable: true,
    onDragStart: (e) => {
      if (e.target.closest("input, textarea, button")) { e.preventDefault(); return; }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/routine-order", key);
    },
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; },
    onDrop: (e) => { e.preventDefault(); move(e.dataTransfer.getData("text/routine-order"), key); },
  };
}

function PresetEditor({ kind, heading, toggle }) {
  const d = useDashboardData();
  const edu = kind === "edu";
  const title = edu ? "EDU" : "Daily";
  const Icon = edu ? GraduationCap : Repeat2;
  const presets = edu ? d.data.schoolPresets : d.data.presets;
  const root = useNewItemFocus(presets);
  const add = edu ? d.addSchoolPreset : d.addPreset;
  const move = edu ? d.moveSchoolPreset : d.movePreset;
  const update = (index, field, value) => edu ? d.updateSchoolPreset(presets[index].key, field, value) : d.updatePreset(index, field, value);
  const remove = (index) => edu ? d.removeSchoolPreset(presets[index].key) : d.removePreset(index);
  return <div className="routine-config-editor" ref={root} aria-label={`${title} 편집`}>
    <div className="routine-editor-actions">{heading && <h2><Icon size={18} />{title}<small>{presets.length}</small></h2>}<span className="routine-editor-tools"><button className="routine-add-button" type="button" aria-label={`${title} 항목 추가`} title="항목 추가" onClick={add}><Plus size={17} /><span className="routine-add-label">항목 추가</span></button>{toggle}</span></div>
    {edu && <div className="routine-subjects" aria-label="요일별 과목">
      {weekDays.map((day) => <label key={day.key} className={getWeekdayKey(d.selectedDate) === day.key ? "is-selected" : ""}>
        <span>{day.label}</span><input aria-label={`EDU ${day.full} 과목`} placeholder="과목" maxLength={80}
          value={d.data.schoolSubjects?.[day.key] || ""} onChange={(e) => d.updateSchoolSubject(day.key, e.target.value)} />
      </label>)}
    </div>}
    {heading && <div className="routine-table-heads" aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => <div key={index} className={`routine-table-head${index ? " is-secondary" : ""}`}><span>항목</span><span>Y</span><span>N</span></div>)}
    </div>}
    <div className="routine-preset-list">
      {presets.map((preset, index) => <article className="routine-preset-row" key={preset.key} data-item-key={preset.key} {...dragProps(preset.key, move)}>
        <OrderControl index={index} items={presets} onMove={move} label={preset.name || title} />
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

function WeeklyEditor({ heading, toggle }) {
  const d = useDashboardData();
  const categories = d.data.categories;
  const root = useNewItemFocus(categories);
  const selectedWeekday = getWeekdayKey(d.selectedDate);
  return <div className="routine-config-editor routine-weekly-editor wk-editor" ref={root} aria-label="Weekly 편집">
    <div className="routine-editor-actions">{heading && <h2><CalendarRange size={18} />Weekly<small>{categories.length}</small></h2>}<span className="routine-editor-tools"><button className="routine-add-button" type="button" aria-label="Weekly 카테고리 추가" title="카테고리 추가" onClick={d.addCategory}><Plus size={17} /><span className="routine-add-label">카테고리 추가</span></button>{toggle}</span></div>
    <p className="wk-guide">요일 칸에 적은 할 일은 그 요일 <b>Today's Tasks</b>에 나와요. 한 칸에 여러 개를 넣으면 주마다 번갈아 나와요.</p>
    <div className="routine-table-heads wk-table-heads" aria-hidden="true">
      <div className="routine-table-head"><span>항목</span><span>Y</span><span>N</span></div>
    </div>
    <div className="wk-list">
      {categories.map((category, index) => <article className="wk-cat" key={category.key} data-item-key={category.key} {...dragProps(category.key, d.moveCategory)}>
        {/* Same row layout as a Daily item: order, icon, name, Y, N, delete. */}
        <header className="routine-preset-row wk-cat-row">
          <OrderControl index={index} items={categories} onMove={d.moveCategory} label={category.label || "카테고리"} />
          <ItemIconButton itemKey={`weekly:${category.key}`} label={category.label || "카테고리"} />
          <input className="routine-name-input wk-cat-name" aria-label={`카테고리 이름 ${index + 1}`} placeholder="카테고리 이름" maxLength={24} value={category.label} onChange={(e) => d.updateCategory(category.key, "label", e.target.value)} />
          <ScoreInput choice="Y" label={category.label} value={category.yScore} onChange={(value) => d.updateCategory(category.key, "yScore", value)} />
          <ScoreInput choice="N" label={category.label} value={category.nScore} onChange={(value) => d.updateCategory(category.key, "nScore", value)} />
          <button type="button" className="routine-delete-button" disabled={categories.length <= 1} aria-label={`${category.label} 카테고리 삭제`} onClick={() => d.removeCategory(category.key)}><Trash2 size={18} /></button>
        </header>
        <div className="wk-days">
          {weekDays.map((day) => <WeeklyDay key={day.key} day={day} label={category.label} today={selectedWeekday === day.key} selectedDate={d.selectedDate}
            value={d.data.weeklyPlan[category.key]?.[day.key] || ""} onChange={(value) => d.updateWeeklyPlan(category.key, day.key, value)} />)}
        </div>
      </article>)}
    </div>
  </div>;
}

export default function RoutineEditor({ kind, heading = false, toggle = null }) {
  return kind === "weekly" ? <WeeklyEditor heading={heading} toggle={toggle} /> : <PresetEditor key={kind} kind={kind} heading={heading} toggle={toggle} />;
}
