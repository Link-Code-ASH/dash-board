import React, { useLayoutEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { useDashboardData } from "./context.jsx";
import ItemIconButton from "./ItemIconButton.jsx";
import { WeeklyScheduleCell } from "../dashboard/components.jsx";
import { weekDays, getWeekdayKey } from "../dashboard/model.js";

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

function PresetEditor({ kind, heading }) {
  const d = useDashboardData();
  const edu = kind === "edu";
  const title = edu ? "EDU" : "Daily";
  const presets = edu ? d.data.schoolPresets : d.data.presets;
  const root = useNewItemFocus(presets);
  const add = edu ? d.addSchoolPreset : d.addPreset;
  const move = edu ? d.moveSchoolPreset : d.movePreset;
  const update = (index, field, value) => edu ? d.updateSchoolPreset(presets[index].key, field, value) : d.updatePreset(index, field, value);
  const remove = (index) => edu ? d.removeSchoolPreset(presets[index].key) : d.removePreset(index);
  return <div className="routine-config-editor" ref={root} aria-label={`${title} 편집`}>
    <div className="routine-editor-actions">{heading && <h2>{title}</h2>}<button className="routine-add-button" type="button" aria-label={`${title} 항목 추가`} title="항목 추가" onClick={add}><Plus size={17} /><span className="routine-add-label">항목 추가</span></button></div>
    {edu && <div className="routine-subjects" aria-label="요일별 과목">
      {weekDays.map((day) => <label key={day.key} className={getWeekdayKey(d.selectedDate) === day.key ? "is-selected" : ""}>
        <span>{day.label}</span><input aria-label={`EDU ${day.full} 과목`} placeholder="과목" maxLength={80}
          value={d.data.schoolSubjects?.[day.key] || ""} onChange={(e) => d.updateSchoolSubject(day.key, e.target.value)} />
      </label>)}
    </div>}
    {heading && <div className="routine-table-heads" aria-hidden="true">
      {Array.from({ length: edu ? 2 : 1 }, (_, index) => <div key={index} className={`routine-table-head${index ? " is-secondary" : ""}`}><span>항목</span><span>Y</span><span>N</span></div>)}
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

function AutoSizeWeeklyCell({ value, ...props }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const resize = () => {
      for (const input of node.querySelectorAll(".weekly-input")) {
        input.style.setProperty("height", "0px", "important");
        input.style.setProperty("height", `${Math.max(32, input.scrollHeight)}px`, "important");
      }
    };
    resize();
    let width = node.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resize();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);
  return <div className="routine-weekly-cell" ref={root}><WeeklyScheduleCell value={value} {...props} /></div>;
}

function WeeklyEditor({ heading }) {
  const d = useDashboardData();
  const categories = d.data.categories;
  const root = useNewItemFocus(categories);
  const selectedWeekday = getWeekdayKey(d.selectedDate);
  return <div className="routine-config-editor" ref={root} aria-label="Weekly 편집">
    <div className="routine-editor-actions">{heading && <h2>Weekly</h2>}<button className="routine-add-button" type="button" aria-label="Weekly 카테고리 추가" title="카테고리 추가" onClick={d.addCategory}><Plus size={17} /><span className="routine-add-label">카테고리 추가</span></button></div>
    <div className="routine-weekly-scroll" tabIndex={0} aria-label="요일별 계획 표">
      <div className="routine-weekly-grid">
        <div className="routine-weekly-corner">카테고리</div>
        {weekDays.map((day) => <div className={`routine-weekday ${selectedWeekday === day.key ? "is-selected" : ""}`} key={day.key}>{day.label}</div>)}
        {categories.flatMap((category, index) => [
          <div key={category.key} className="routine-category" data-item-key={category.key} {...dragProps(category.key, d.moveCategory)}>
            <div className="routine-category-heading">
              <OrderControl index={index} items={categories} onMove={d.moveCategory} label={category.label || "카테고리"} />
              <ItemIconButton itemKey={`weekly:${category.key}`} label={category.label || "카테고리"} />
              <input className="routine-name-input" aria-label={`카테고리 이름 ${index + 1}`} maxLength={24} value={category.label} onChange={(e) => d.updateCategory(category.key, "label", e.target.value)} />
              <button type="button" className="routine-delete-button" disabled={categories.length <= 1} aria-label={`${category.label} 카테고리 삭제`} onClick={() => d.removeCategory(category.key)}><Trash2 size={17} /></button>
            </div>
            <div className="routine-category-scores">
              <ScoreInput choice="Y" label={category.label} value={category.yScore} onChange={(value) => d.updateCategory(category.key, "yScore", value)} />
              <ScoreInput choice="N" label={category.label} value={category.nScore} onChange={(value) => d.updateCategory(category.key, "nScore", value)} />
            </div>
          </div>,
          ...weekDays.map((day) => <div className="routine-plan-cell" key={`${category.key}-${day.key}`} role="group" aria-label={`${category.label} ${day.full} 계획`}>
            <AutoSizeWeeklyCell active={selectedWeekday === day.key} label={`${category.label} ${day.full} 계획`} placeholder="" value={d.data.weeklyPlan[category.key]?.[day.key] || ""}
              onChange={(value) => d.updateWeeklyPlan(category.key, day.key, value)} />
          </div>),
        ])}
      </div>
    </div>
  </div>;
}

export default function RoutineEditor({ kind, heading = false }) {
  return kind === "weekly" ? <WeeklyEditor heading={heading} /> : <PresetEditor key={kind} kind={kind} heading={heading} />;
}
