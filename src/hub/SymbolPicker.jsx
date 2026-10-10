import React, { useState, useRef, useLayoutEffect } from "react";
import { symbols, symbolGroups, defaultSymbolColor } from "./symbols.js";

const colors = [
  "#64748b",
  "#333b47",
  "#b86565",
  "#6484b3",
  "#668d78",
  "#ba8856",
  "#9180ac",
  "#66999e",
];
export default function SymbolPicker({ value, onChange }) {
  const grid = useRef(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("전체");
  const [draftColor, setDraftColor] = useState(
    value?.color || defaultSymbolColor,
  );
  useLayoutEffect(() => { if (grid.current) grid.current.scrollTop = 0; }, [group, query]);
  const color = value?.color || draftColor;
  const recolor = (next) => {
    setDraftColor(next);
    if (value) onChange({ ...value, color: next });
  };
  const filtered = symbols.filter(
    (item) =>
      (group === "전체" || item.group === group) &&
      `${item.keywords} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="hub-symbol-picker">
      <input
        type="search"
        aria-label="아이콘 검색"
        placeholder="아이콘 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="hub-symbol-categories" aria-label="아이콘 분류">
        {symbolGroups.map((name) => (
          <button
            key={name}
            aria-pressed={name === group}
            onClick={() => setGroup(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div ref={grid} className="hub-symbol-grid" aria-label="아이콘">
        {filtered.map(({ name, Icon, label }) => (
          <button
            key={name}
            title={label}
            aria-label={label}
            aria-pressed={value?.name === name}
            style={{ color }}
            onClick={() => onChange({ name, color })}
          >
            <Icon size={22} strokeWidth={1.8} />
          </button>
        ))}
        {!filtered.length && <p>검색 결과가 없습니다.</p>}
      </div>
      <div className="hub-symbol-colors" aria-label="아이콘 색상">
        {colors.map((swatch) => (
          <button
            key={swatch}
            title={swatch}
            aria-label={`색상 ${swatch}`}
            aria-pressed={color === swatch}
            style={{ "--swatch": swatch }}
            onClick={() => recolor(swatch)}
          />
        ))}
        <input
          type="color"
          aria-label="사용자 지정 색상"
          title="사용자 지정 색상"
          value={color}
          onChange={(e) => recolor(e.target.value)}
        />
      </div>
    </div>
  );
}
