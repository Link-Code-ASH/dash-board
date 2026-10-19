import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHubRuntime } from "../hub/context.jsx";
import {
  BookOpen, BookText, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Crown, Gamepad2, Hourglass, ImagePlus, Minus, Pencil, Plus, RefreshCw, Search, Shapes,
  Sparkles, Star, Trash2, Trophy, Tv, X,
} from "lucide-react";
import { useContents } from "./ContentsProvider.jsx";
import {
  RARITIES, TIER_NAMES, TYPES, collectionStats, dDayLabel, daysUntil, emptyItem, isUpcoming,
  localDateKey, rarityOf, rarityWings, typeLabel, upcomingItems, visibleItems,
} from "./model.js";
import { coverUrl, prepareCover, saveCover } from "./cloud.js";
import { downloadCover, searchCovers } from "./coverSearch.js";
import "./contents.css";

const typeIcons = { webtoon: BookOpen, drama: Tv, movie: Clapperboard, anime: Sparkles, novel: BookText, game: Gamepad2, etc: Shapes };
const SORTS = [{ id: "tier", label: "등급" }, { id: "recent", label: "최근" }, { id: "rating", label: "평점" }, { id: "title", label: "이름" }];
const dotted = (date) => date.replaceAll("-", ".");
// The last time a title was edited, shown as a plain local date.
const editedOn = (item) => dotted(localDateKey(new Date(item.updatedAt || item.createdAt)));
const comingBadge = (days) => days !== null && days <= 0 ? "OUT NOW" : "COMING SOON";
const SHELVES_KEY = "hub-contents-shelves-open-v1";
const readShelves = () => { try { return localStorage.getItem(SHELVES_KEY) === "1"; } catch { return false; } };
const writeShelves = (open) => { try { localStorage.setItem(SHELVES_KEY, open ? "1" : "0"); } catch { /* private mode */ } };
// Ratings move in 0.5 steps, so each tier covers these scores.
const TIER_RANGES = { legendary: "만점 5.0", epic: "4.0 ~ 4.5점", rare: "3.0 ~ 3.5점", uncommon: "2.0 ~ 2.5점", common: "0.5 ~ 1.5점", unrated: "아직 별점 없음" };

function useCover(item) {
  const { userId } = useContents();
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    setUrl(item.cover ? "" : item.coverUrl);
    if (item.cover) coverUrl(userId, item.cover).then((value) => live && setUrl(value)).catch(() => live && setUrl(item.coverUrl));
    return () => { live = false; };
  }, [item.cover, item.coverUrl, userId]);
  return url;
}

function Stars({ rating, size = 14 }) {
  return (
    <span className="ct-stars" role="img" aria-label={rating ? `별점 ${rating}점` : "평가 전"} style={{ "--size": `${size}px` }}>
      <span className="ct-stars-base">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} strokeWidth={1.6} />)}</span>
      <span className="ct-stars-fill" style={{ width: `${(rating / 5) * 100}%` }}>
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} strokeWidth={1.6} />)}
      </span>
    </span>
  );
}

function Figure({ item, url }) {
  const Icon = typeIcons[item.type] || Shapes;
  return (
    <div className="ct-figure">
      {url ? <img src={url} alt="" draggable="false" /> : (
        <div className="ct-figure-blank">
          <Icon size={34} strokeWidth={1.4} />
          <span>{item.title || "제목"}</span>
        </div>
      )}
      <span className="ct-shine" aria-hidden="true" />
    </div>
  );
}

function tilt(event) {
  const box = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  event.currentTarget.style.setProperty("--ry", `${x * 16}deg`);
  event.currentTarget.style.setProperty("--rx", `${-y * 12}deg`);
  event.currentTarget.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
}
function untilt(event) {
  for (const name of ["--ry", "--rx", "--mx"]) event.currentTarget.style.removeProperty(name);
}

function FigureCase({ item, onOpen, index }) {
  const url = useCover(item);
  const rarity = rarityOf(item.rating);
  return (
    <button
      type="button"
      className={`ct-case ct-r-${rarity.id}`}
      style={{ "--delay": `${Math.min(index, 18) * 40}ms` }}
      onClick={() => onOpen(item.id)}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      aria-label={`${item.title} 자세히 보기`}
    >
      <span className="ct-rarity">{rarity.label}</span>
      <span className="ct-stage">
        <Figure item={item} url={url} />
        <span className="ct-pedestal" aria-hidden="true"><span /></span>
      </span>
      <span className="ct-ledge" aria-hidden="true" />
      <span className="ct-plate">
        <strong>{item.title}</strong>
        <span className="ct-meta">{typeLabel(item.type)} · {editedOn(item)}</span>
        <Stars rating={item.rating} />
      </span>
    </button>
  );
}

// Coverflow geometry: the centre figure is full size, each step outwards is smaller, pushed back and turned inwards.
const FLOW = {
  desktop: { width: 236, first: 226, step: 150, range: 4, height: 392 },
  mobile: { width: 150, first: 118, step: 60, range: 2, height: 268 },
};
// Fits the side figures into the stage width: fewer, closer figures on narrower screens.
function fitFlow(base, width) {
  if (!width || base === FLOW.mobile) return base;
  const half = width / 2 - 70;
  for (let range = base.range; range > 1; range -= 1) {
    const step = (half - base.first - 30) / (range - 1);
    if (step >= 84) return { ...base, range, step: Math.min(base.step, step) };
  }
  return { ...base, range: 1 };
}
function flowStyle(offset, geometry) {
  const distance = Math.abs(offset);
  const x = Math.sign(offset) * (Math.min(distance, 1) * geometry.first + Math.max(distance - 1, 0) * geometry.step);
  const scale = Math.max(0.4, 1 - distance * 0.17);
  const turn = Math.max(-38, Math.min(38, -offset * 24));
  const fade = Math.max(0, Math.min(1, geometry.range + 0.6 - distance));
  return {
    transform: `translateX(-50%) translateX(${x}px) scale(${scale}) rotateY(${turn}deg)`,
    zIndex: 100 - Math.round(distance * 10),
    opacity: fade,
    filter: distance > 0.5 ? `saturate(${Math.max(0.55, 1 - distance * 0.12)})` : "none",
  };
}

function FlowFigure({ item, offset, geometry, onPick }) {
  const url = useCover(item);
  const rarity = isUpcoming(item) ? { id: "coming" } : rarityOf(item.rating);
  const centre = Math.abs(offset) < 0.5;
  return (
    <button
      type="button"
      className={`ct-flow-item ct-r-${rarity.id}${centre ? " is-centre" : ""}`}
      style={{ ...flowStyle(offset, geometry), width: geometry.width }}
      onClick={onPick}
      tabIndex={centre ? 0 : -1}
      aria-label={centre ? `${item.title} 자세히 보기` : `${item.title}로 이동`}
    >
      <span className="ct-beam" aria-hidden="true" />
      <span className="ct-stage">
        <Figure item={item} url={url} />
        <span className="ct-pedestal" aria-hidden="true"><span /></span>
      </span>
    </button>
  );
}

function Coverflow({ items, onOpen }) {
  const { displayMode } = useHubRuntime();
  const [stageWidth, setStageWidth] = useState(0);
  const geometry = fitFlow(displayMode === "mobile" ? FLOW.mobile : FLOW.desktop, stageWidth);
  const [pos, setPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const wheel = useRef({ total: 0, at: 0 });
  const stageRef = useRef(null);
  const count = items.length;
  const clamp = (value) => Math.max(0, Math.min(count - 1, value));
  const index = Math.round(clamp(pos));
  const listKey = items.map((item) => item.id).join("|");
  // A new filter or sort starts again from the first title.
  useEffect(() => { setPos(0); }, [listKey]);
  const go = (step) => setPos((current) => clamp(Math.round(current) + step));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    // Trackpad swipes and shift+wheel turn the carousel one title at a time.
    const onWheel = (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (!delta) return;
      event.preventDefault();
      const now = Date.now();
      if (now - wheel.current.at > 220) wheel.current.total = 0;
      wheel.current.at = now;
      wheel.current.total += delta;
      if (Math.abs(wheel.current.total) >= 60) {
        setPos((current) => Math.max(0, Math.min(count - 1, Math.round(current) + Math.sign(wheel.current.total))));
        wheel.current.total = 0;
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(([entry]) => setStageWidth(Math.round(entry.contentRect.width)));
    observer.observe(stage);
    return () => { stage.removeEventListener("wheel", onWheel); observer.disconnect(); };
  }, [count]);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, pos, moved: false, id: event.pointerId };
  };
  const onPointerMove = (event) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    if (!current.moved && Math.abs(dx) > 6) {
      current.moved = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (current.moved) setPos(Math.max(-0.35, Math.min(count - 0.65, current.pos - dx / Math.max(geometry.step, 110))));
  };
  const onPointerUp = (event) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) setPos((value) => clamp(Math.round(value)));
    setDragging(false);
    // Keep "moved" for the click that follows this release, then forget the drag.
    setTimeout(() => { drag.current = null; }, 0);
  };
  const pick = (target) => {
    if (drag.current?.moved) return;
    if (target === index) onOpen(items[target].id);
    else setPos(target);
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    if (event.key === "Home") { event.preventDefault(); setPos(0); }
    if (event.key === "End") { event.preventDefault(); setPos(count - 1); }
  };

  const current = items[index];
  const upcoming = current && isUpcoming(current);
  const rarity = current ? (upcoming ? { id: "coming", label: comingBadge(daysUntil(current.releaseDate)) } : rarityOf(current.rating)) : null;
  return (
    <div className="ct-flow" aria-roledescription="carousel" aria-label="작품 회전 진열">
      <div
        ref={stageRef}
        className={`ct-flow-stage${dragging ? " is-dragging" : ""}`}
        style={{ height: geometry.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span className="ct-floor" aria-hidden="true" />
        {items.map((item, target) => {
          const offset = target - pos;
          if (Math.abs(offset) > geometry.range + 0.6) return null;
          return <FlowFigure key={item.id} item={item} offset={offset} geometry={geometry} onPick={() => pick(target)} />;
        })}
        <button type="button" className="ct-flow-arrow ct-flow-prev" onClick={() => go(-1)} disabled={index === 0} aria-label="이전 작품">
          <ChevronLeft size={22} />
        </button>
        <button type="button" className="ct-flow-arrow ct-flow-next" onClick={() => go(1)} disabled={index === count - 1} aria-label="다음 작품">
          <ChevronRight size={22} />
        </button>
      </div>
      {current && (
        <div className={`ct-hall-plate ct-r-${rarity.id}`} aria-live="polite">
          <span className="ct-rarity ct-rarity-inline">{rarity.label}</span>
          <strong>{current.title}</strong>
          {upcoming ? (
            <span className="ct-dday"><b>{dDayLabel(daysUntil(current.releaseDate))}</b>{current.releaseDate && <time dateTime={current.releaseDate}>{dotted(current.releaseDate)}</time>}</span>
          ) : (
            <span className="ct-hall-score"><b>{current.rating ? current.rating.toFixed(1) : "–"}</b><Stars rating={current.rating} size={17} /></span>
          )}
          <span className="ct-meta">{upcoming ? typeLabel(current.type) : `${typeLabel(current.type)} · ${editedOn(current)} 수정`}</span>
        </div>
      )}
      {count > 1 && (
        <div className="ct-flow-scrub">
          <span>{index + 1}</span>
          <input type="range" min={0} max={count - 1} step={1} value={index} onChange={(event) => setPos(Number(event.target.value))} aria-label="작품 위치" />
          <span>{count}</span>
        </div>
      )}
    </div>
  );
}

function Hall({ items, stats, label, toolbar, onOpen, onAdd }) {
  return (
    <header className="ct-hall">
      <span className="ct-hall-arch" aria-hidden="true" />
      <div className="ct-hall-head">
        <span className="ct-eyebrow"><Trophy size={14} />TROPHY ROOM</span>
        <h1>Contents</h1>
        <p>지금까지 즐긴 이야기들의 전시관</p>
      </div>
      <button type="button" className="ct-btn ct-btn-primary ct-add" onClick={onAdd}>
        <Plus size={18} /><span>새 피규어 등록</span>
      </button>
      {toolbar}
      {items.length > 0 && (
        <>
          <span className="ct-hall-label">COLLECTION<em>{label}</em></span>
          <Coverflow items={items} onOpen={onOpen} />
        </>
      )}
      <dl className="ct-stats">
        <div><dt>전시 중</dt><dd>{stats.total}</dd></div>
        <div><dt>평균 평점</dt><dd>{stats.average ? stats.average.toFixed(1) : "–"}</dd></div>
        <div className="ct-stat-legend"><dt><span className="ct-long">LEGENDARY</span><span className="ct-short">전설</span></dt><dd>{stats.legendary}</dd></div>
        <div><dt>{new Date().getFullYear()}년</dt><dd>{stats.thisYear}</dd></div>
        <div className="ct-stat-coming"><dt>출시 예정</dt><dd>{stats.upcoming}</dd></div>
      </dl>
    </header>
  );
}

function Wing({ id, label, title, caption, count, icon: Icon, bare = false, action = null, children }) {
  return (
    <section className={`ct-wing ct-r-${id}`} aria-label={title}>
      <span className="ct-wing-light" aria-hidden="true" />
      <div className="ct-wing-head">
        <span className="ct-wing-label">{Icon && <Icon size={13} strokeWidth={2} />}<span>{label}</span></span>
        <h2>{title}</h2>
        <p>{caption}<b>{count}</b></p>
        {action}
      </div>
      {bare ? children : <div className="ct-gallery">{children}</div>}
    </section>
  );
}

function Modal({ label, onClose, className = "", children }) {
  const { displayMode } = useHubRuntime();
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return createPortal(
    <div className={`ct-layer ${displayMode === "mobile" ? "ct-layer-mobile" : ""}`}>
      <div className="ct-overlay" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className={`ct-modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" className="ct-close" onClick={onClose} aria-label="닫기"><X size={20} /></button>
          {children}
        </section>
      </div>
    </div>,
    document.getElementById("root") || document.body,
  );
}

function Inspect({ item, onClose, onEdit, onRemove, onComplete }) {
  const url = useCover(item);
  const upcoming = isUpcoming(item);
  const rarity = upcoming ? { id: "coming", label: comingBadge(daysUntil(item.releaseDate)) } : rarityOf(item.rating);
  const days = daysUntil(item.releaseDate);
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal label={`${item.title} 상세`} onClose={onClose} className={`ct-inspect ct-r-${rarity.id}`}>
      <div className="ct-chamber">
        <span className="ct-chamber-ring" aria-hidden="true" />
        <span className="ct-stage ct-stage-large">
          <Figure item={item} url={url} />
          <span className="ct-pedestal" aria-hidden="true"><span /></span>
        </span>
      </div>
      <div className="ct-info">
        <span className="ct-rarity ct-rarity-inline">{rarity.label}</span>
        <h2>{item.title}</h2>
        <div className="ct-tags">
          <span>{typeLabel(item.type)}</span>
        </div>
        {upcoming ? (
          <div className="ct-score ct-score-coming">
            <strong>{dDayLabel(days)}</strong>
            <span className="ct-score-text">
              <b>{item.releaseDate ? `${dotted(item.releaseDate)} 출시` : "출시일 미정"}</b>
              {item.releaseDate && <span className="ct-hype">Flow 일정에 표시돼요</span>}
            </span>
          </div>
        ) : (
          <div className="ct-score">
            <strong>{item.rating ? item.rating.toFixed(1) : "–"}</strong>
            <Stars rating={item.rating} size={22} />
          </div>
        )}
        <p className={item.review ? "ct-review" : "ct-review ct-review-empty"}>{item.review || (upcoming ? "아직 메모가 없습니다." : "아직 한 줄 평이 없습니다.")}</p>
        <p className="ct-updated">마지막 수정 {editedOn(item)}</p>
        <div className="ct-actions">
          {confirm ? (
            <>
              <span className="ct-confirm-text">전시에서 치울까요?</span>
              <button type="button" className="ct-btn ct-btn-danger" onClick={onRemove}>치우기</button>
              <button type="button" className="ct-btn" onClick={() => setConfirm(false)}>취소</button>
            </>
          ) : (
            <>
              {upcoming && <button type="button" className="ct-btn ct-btn-primary" onClick={onComplete}><Check size={16} />다 봤어요 · 전시하기</button>}
              <button type="button" className={upcoming ? "ct-btn" : "ct-btn ct-btn-primary"} onClick={onEdit}><Pencil size={16} />수정</button>
              {!item.cover && !item.coverUrl && <button type="button" className="ct-btn" onClick={onEdit}><ImagePlus size={16} />표지 찾기</button>}
              <button type="button" className="ct-btn ct-btn-ghost" onClick={() => setConfirm(true)}><Trash2 size={16} />치우기</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Each star has a left half (x.5) and a right half (x.0) as separate targets, so a click always lands on
// a clear value. Hovering only shows a faint preview; the chosen value stays solid until another click.
function RatingPicker({ value, onChange }) {
  const [hover, setHover] = useState(null);
  const rarity = rarityOf(value);
  const step = (delta) => onChange(Math.min(5, Math.max(0, value + delta)));
  return (
    <div className={`ct-rating-picker ct-r-${rarity.id}`}>
      <div className="ct-rating-stars" role="radiogroup" aria-label="별점" onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = Math.max(0, Math.min(1, value - index));
          const ghost = hover === null ? 0 : Math.max(0, Math.min(1, hover - index));
          return (
            <span key={index} className="ct-star-slot">
              <Star size={34} strokeWidth={1.5} className="ct-star-empty" />
              <span className="ct-star-ghost" style={{ width: `${ghost * 100}%` }}><Star size={34} strokeWidth={1.5} /></span>
              <span className="ct-star-fill" style={{ width: `${fill * 100}%` }}><Star size={34} strokeWidth={1.5} /></span>
              {[0.5, 1].map((part) => {
                const score = index + part;
                return (
                  <button
                    key={part}
                    type="button"
                    role="radio"
                    aria-checked={value === score}
                    aria-label={`${score.toFixed(1)}점`}
                    className={part === 0.5 ? "ct-half ct-half-left" : "ct-half ct-half-right"}
                    onPointerEnter={() => setHover(score)}
                    onClick={() => onChange(score)}
                  />
                );
              })}
            </span>
          );
        })}
      </div>
      <div className="ct-rating-step">
        <button type="button" onClick={() => step(-0.5)} disabled={value <= 0} aria-label="0.5점 내리기"><Minus size={16} /></button>
        <strong>{value ? value.toFixed(1) : "–"}</strong>
        <button type="button" onClick={() => step(0.5)} disabled={value >= 5} aria-label="0.5점 올리기"><Plus size={16} /></button>
      </div>
      <div className="ct-rating-readout">
        <span>{value ? rarity.label : "평가 전"}</span>
        {hover !== null && hover !== value && <em>{hover.toFixed(1)}점으로</em>}
        {value > 0 && hover === null && <button type="button" onClick={() => onChange(0)}>지우기</button>}
      </div>
    </div>
  );
}

function Editor({ initial, onClose, onSave }) {
  const { userId } = useContents();
  const [draft, setDraft] = useState(initial);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const savedUrl = useCover(initial);
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const shownUrl = draft.cover === initial.cover && !preview ? (draft.cover ? savedUrl : draft.coverUrl) : preview || draft.coverUrl;
  const [found, setFound] = useState({ status: "idle", list: [], term: "" });
  const [picked, setPicked] = useState("");
  const searchRef = useRef(null);
  const hasCover = Boolean(draft.cover || draft.coverUrl);

  const findCovers = (title = draft.title, type = draft.type) => {
    searchRef.current?.abort();
    const controller = new AbortController();
    searchRef.current = controller;
    setFound((current) => ({ ...current, status: "loading" }));
    searchCovers(title, type, { signal: controller.signal })
      .then((list) => { if (!controller.signal.aborted) setFound({ status: "done", list, term: `${type}:${title.trim()}` }); })
      .catch(() => { if (!controller.signal.aborted) setFound({ status: "done", list: [], term: `${type}:${title.trim()}` }); });
  };
  // Looks for covers on its own while a title has none, shortly after typing stops.
  useEffect(() => {
    const title = draft.title.trim();
    if (hasCover || title.length < 2 || found.term === `${draft.type}:${title}`) return undefined;
    const timer = setTimeout(() => findCovers(draft.title, draft.type), 650);
    return () => clearTimeout(timer);
  }, [draft.title, draft.type, hasCover]);
  useEffect(() => () => searchRef.current?.abort(), []);

  const takeImage = async (file) => {
    if (!file) return;
    try {
      setError("");
      const blob = await prepareCover(file);
      const id = await saveCover(userId, blob);
      setPreview(URL.createObjectURL(blob));
      set({ cover: id, coverUrl: "" });
    } catch (problem) { setError(problem.message); }
  };
  // A chosen candidate is copied into our own storage when its host allows it, otherwise kept as a link.
  const pickCover = async (candidate) => {
    setPicked(candidate.url);
    setError("");
    const blob = await downloadCover(candidate.url);
    if (blob) { await takeImage(blob); return; }
    setPreview("");
    set({ cover: null, coverUrl: candidate.url });
  };
  const onPaste = (event) => {
    const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith("image/"));
    if (file) { event.preventDefault(); void takeImage(file); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.title.trim()) { setError("제목을 입력해 주세요."); return; }
    setBusy(true);
    try { await onSave({ ...draft, title: draft.title.trim(), coverUrl: draft.coverUrl.trim() }); }
    catch (problem) { setError(problem.message); setBusy(false); }
  };
  const upcoming = isUpcoming(draft);
  const rarity = upcoming ? { id: "coming" } : rarityOf(draft.rating);
  return (
    <Modal label={upcoming ? "출시 예정 작품" : initial.title ? "피규어 수정" : "새 피규어 등록"} onClose={onClose} className={`ct-editor ct-r-${rarity.id}`}>
      <form onSubmit={submit} onPaste={onPaste}>
        <div className="ct-chamber ct-chamber-editor">
          <button
            type="button"
            className="ct-drop"
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void takeImage(event.dataTransfer.files[0]); }}
            aria-label="표지 이미지 고르기"
          >
            <span className="ct-stage ct-stage-large">
              {shownUrl || draft.title ? <Figure item={draft} url={shownUrl} /> : (
                <span className="ct-figure ct-figure-empty"><ImagePlus size={30} strokeWidth={1.4} /><span>표지 이미지</span></span>
              )}
              <span className="ct-pedestal" aria-hidden="true"><span /></span>
            </span>
          </button>
          <p className="ct-drop-hint">눌러서 고르거나, 이미지를 끌어다 놓거나 붙여넣기(Ctrl+V)</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            onChange={(event) => { void takeImage(event.target.files[0]); event.target.value = ""; }} />
          <div className="ct-cover-row">
            <input
              className="ct-input"
              placeholder="또는 이미지 주소 붙여넣기"
              value={draft.coverUrl}
              onChange={(event) => { setPreview(""); set({ coverUrl: event.target.value, cover: null }); }}
            />
            {(draft.cover || draft.coverUrl) && (
              <button type="button" className="ct-btn ct-btn-ghost" onClick={() => { setPreview(""); setPicked(""); set({ cover: null, coverUrl: "" }); }}>지우기</button>
            )}
          </div>
          <div className="ct-suggest">
            <div className="ct-suggest-head">
              <span><Sparkles size={14} />표지 후보</span>
              <button type="button" onClick={() => findCovers()} disabled={draft.title.trim().length < 2 || found.status === "loading"}>
                <RefreshCw size={13} />{found.status === "idle" ? "찾기" : "다시 찾기"}
              </button>
            </div>
            {found.status === "loading" ? (
              <p className="ct-suggest-note" role="status">표지를 찾는 중…</p>
            ) : found.list.length ? (
              <div className="ct-suggest-grid">
                {found.list.map((candidate) => (
                  <button key={candidate.url} type="button" className="ct-suggest-item" aria-pressed={picked === candidate.url}
                    onClick={() => void pickCover(candidate)} title={`${candidate.title} · ${candidate.source}`} aria-label={`${candidate.title} 표지 쓰기`}>
                    <img src={candidate.url} alt="" loading="lazy" referrerPolicy="no-referrer"
                      onError={(event) => { event.currentTarget.parentElement.hidden = true; }} />
                    <span>{candidate.source}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="ct-suggest-note">{found.status === "done" ? "찾지 못했어요. 원제나 영어 제목으로 바꿔서 다시 찾아 보세요." : "제목을 입력하면 표지를 알아서 찾아 드려요."}</p>
            )}
          </div>
        </div>
        <div className="ct-form">
          <span className="ct-rarity ct-rarity-inline">{upcoming ? "COMING SOON" : initial.title ? "EDIT FIGURE" : "NEW FIGURE"}</span>
          <label className="ct-field">
            <span>제목</span>
            <input className="ct-input ct-input-title" autoFocus value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder="작품 이름" maxLength={120} />
          </label>
          <div className="ct-field">
            <span>종류</span>
            <div className="ct-choice">
              {TYPES.map((type) => {
                const Icon = typeIcons[type.id];
                return (
                  <button key={type.id} type="button" aria-pressed={draft.type === type.id} onClick={() => set({ type: type.id })}>
                    <Icon size={16} strokeWidth={1.8} />{type.label}
                  </button>
                );
              })}
            </div>
          </div>
          {upcoming ? (
            <label className="ct-field">
              <span>출시일 · Flow 일정에 자동으로 표시돼요</span>
              <input className="ct-input" type="date" value={draft.releaseDate} onChange={(event) => set({ releaseDate: event.target.value })} />
            </label>
          ) : (
            <div className="ct-field">
              <span>평가</span>
              <RatingPicker value={draft.rating} onChange={(rating) => set({ rating })} />
            </div>
          )}
          <label className="ct-field">
            <span>{upcoming ? "메모" : "한 줄 평"}</span>
            <textarea className="ct-input ct-textarea" rows={3} value={draft.review} onChange={(event) => set({ review: event.target.value })}
              placeholder={upcoming ? "기대하는 점, 예고편 링크 등" : "어떤 점이 좋았나요?"} />
          </label>
          {error && <p className="ct-error" role="alert">{error}</p>}
          <div className="ct-actions">
            <button type="submit" className="ct-btn ct-btn-primary" disabled={busy}>{upcoming ? <Hourglass size={16} /> : <Trophy size={16} />}{initial.title ? "저장" : upcoming ? "출시 예정에 올리기" : "전시하기"}</button>
            <button type="button" className="ct-btn" onClick={onClose}>취소</button>
          </div>
          <p className="ct-updated">{initial.title ? `마지막 수정 ${editedOn(initial)}` : "저장하면 오늘 날짜가 수정일로 기록돼요."}</p>
        </div>
      </form>
    </Modal>
  );
}

export default function Contents({ route }) {
  const { items, ready, status, change } = useContents();
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("tier");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const stats = useMemo(() => collectionStats(items), [items]);
  const shown = useMemo(() => visibleItems(items, { type, sort, query }), [items, type, sort, query]);
  const coming = useMemo(() => upcomingItems(items, { type, query }), [items, type, query]);
  const [shelvesOpen, setShelvesOpen] = useState(readShelves);
  const toggleShelves = () => setShelvesOpen((open) => { writeShelves(!open); return !open; });
  const wings = useMemo(() => sort === "tier" ? rarityWings(shown) : [{ id: "gallery", items: shown }], [shown, sort]);
  // Flow's release chips open a title here via #/contents/item:<id>.
  useEffect(() => {
    const target = route?.section?.match(/^item:(.+)$/)?.[1];
    if (target) setOpenId(target);
  }, [route?.section]);
  const opened = items.find((item) => item.id === openId && !item.deletedAt);

  const save = async (draft) => {
    const now = new Date().toISOString();
    await change(draft.id, (current) => ({ ...(current || {}), ...draft, updatedAt: now }));
    setEditing(null);
    setOpenId(draft.id);
  };
  const remove = async () => {
    const now = new Date().toISOString();
    await change(opened.id, (current) => ({ ...current, deletedAt: now, updatedAt: now }));
    setOpenId(null);
  };

  return (
    <div className="ct-room">
      <div className="ct-backdrop" aria-hidden="true" />
      <Hall
        items={ready ? shown : []}
        stats={stats}
        label={`${type === "all" ? "전체" : typeLabel(type)} · ${SORTS.find((entry) => entry.id === sort)?.label}순`}
        toolbar={
          <div className="ct-toolbar">
            <div className="ct-filters" role="tablist" aria-label="종류">
              <button type="button" role="tab" aria-selected={type === "all"} onClick={() => setType("all")}>
                전체<b>{stats.all}</b>
              </button>
              {TYPES.map((entry) => {
                const Icon = typeIcons[entry.id];
                return (
                  <button key={entry.id} type="button" role="tab" aria-selected={type === entry.id} onClick={() => setType(entry.id)}>
                    <Icon size={15} strokeWidth={1.8} />{entry.label}<b>{stats.counts[entry.id] || 0}</b>
                  </button>
                );
              })}
            </div>
            <div className="ct-tools">
              <label className="ct-search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" aria-label="제목, 작가, 한 줄 평 검색" />
              </label>
              <div className="ct-sort" role="group" aria-label="정렬">
                {SORTS.map((entry) => (
                  <button key={entry.id} type="button" aria-pressed={sort === entry.id} onClick={() => setSort(entry.id)}>{entry.label}</button>
                ))}
              </div>
            </div>
          </div>
        }
        onOpen={setOpenId}
        onAdd={() => setEditing(emptyItem())}
      />

      {ready && (
        <Wing id="coming" label="COMING SOON" title="출시 예정" caption="출시일이 가까운 순서" count={coming.length} icon={Hourglass} bare
          action={<button type="button" className="ct-btn ct-wing-add" onClick={() => setEditing({ ...emptyItem(), status: "upcoming", date: "" })}><Plus size={16} />출시 예정 추가</button>}>
          {coming.length ? <Coverflow items={coming} onOpen={setOpenId} /> : (
            <p className="ct-status ct-status-small">기다리는 작품을 추가하면 출시일이 Flow 일정에 자동으로 표시돼요.</p>
          )}
        </Wing>
      )}
      {!ready ? (
        <p className="ct-status" role="status">{status}</p>
      ) : shown.length ? (
        <>
          <button type="button" className="ct-shelves-toggle" aria-expanded={shelvesOpen} onClick={toggleShelves}>
            <Trophy size={16} />{sort === "tier" ? "등급별 진열장" : "전체 진열장"}<b>{shown.length}</b>
            <span>{shelvesOpen ? "접기" : "펼쳐 보기"}</span><ChevronDown size={16} className="ct-chevron" />
          </button>
          {shelvesOpen && wings.map((wing) => wing.id === "gallery" ? (
          <Wing key="gallery" id="unrated" label="GALLERY" title="전시관" caption={`${SORTS.find((entry) => entry.id === sort)?.label}순 전체 전시`} count={wing.items.length} icon={Trophy}>
            {wing.items.map((item, index) => <FigureCase key={item.id} item={item} index={index} onOpen={setOpenId} />)}
          </Wing>
        ) : (
          <Wing key={wing.id} id={wing.id} label={wing.id === "unrated" ? "UNRATED" : RARITIES.find((entry) => entry.id === wing.id).label}
            title={TIER_NAMES[wing.id]} caption={TIER_RANGES[wing.id]} count={wing.items.length} icon={wing.id === "legendary" ? Crown : null}>
            {wing.items.map((item, index) => <FigureCase key={item.id} item={item} index={index} onOpen={setOpenId} />)}
          </Wing>
        ))}
        </>
      ) : coming.length ? (
        <p className="ct-status ct-status-small">{stats.total ? "조건에 맞는 전시 작품이 없습니다." : "다 본 작품은 여기에 전시됩니다."}</p>
      ) : (
        <div className="ct-empty">
          <span className="ct-stage">
            <span className="ct-figure ct-figure-empty"><Trophy size={34} strokeWidth={1.3} /></span>
            <span className="ct-pedestal" aria-hidden="true"><span /></span>
          </span>
          <strong>{stats.total ? "조건에 맞는 피규어가 없습니다" : "아직 비어 있는 전시대"}</strong>
          <p>{stats.total ? "다른 종류나 검색어로 찾아보세요." : "첫 번째 작품을 등록해 트로피룸을 채워 보세요."}</p>
          {!stats.total && <button type="button" className="ct-btn ct-btn-primary" onClick={() => setEditing(emptyItem())}><Plus size={18} />새 피규어 등록</button>}
        </div>
      )}
      {ready && <p className="ct-sync">{status}</p>}

      <ul className="ct-legend" aria-label="등급 기준">
        {RARITIES.map((rarity) => (
          <li key={rarity.id} className={`ct-r-${rarity.id}`}><i />{rarity.label}<span>{rarity.min === 0.5 ? "~2" : `${rarity.min}+`}</span></li>
        ))}
      </ul>

      {opened && !editing && (
        <Inspect item={opened} onClose={() => setOpenId(null)} onEdit={() => setEditing(opened)} onRemove={remove}
          onComplete={() => setEditing({ ...opened, status: "done", date: localDateKey() })} />
      )}
      {editing && <Editor initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
