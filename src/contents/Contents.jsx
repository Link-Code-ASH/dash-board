import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHubRuntime } from "../hub/context.jsx";
import {
  BookOpen, BookText, Clapperboard, Gamepad2, ImagePlus, Pencil, Plus, Search, Shapes,
  Sparkles, Star, Trash2, Trophy, Tv, X,
} from "lucide-react";
import { useContents } from "./ContentsProvider.jsx";
import {
  RARITIES, STATUSES, TYPES, collectionStats, emptyItem, rarityOf, statusLabel, typeLabel, visibleItems,
} from "./model.js";
import { coverUrl, prepareCover, saveCover } from "./cloud.js";
import "./contents.css";

const typeIcons = { webtoon: BookOpen, drama: Tv, movie: Clapperboard, anime: Sparkles, novel: BookText, game: Gamepad2, etc: Shapes };
const SORTS = [{ id: "recent", label: "최근" }, { id: "rating", label: "평점" }, { id: "title", label: "이름" }];
const yearOf = (item) => (item.date || "").slice(0, 4);

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
      <span className="ct-plate">
        <strong>{item.title}</strong>
        <span className="ct-meta">{[typeLabel(item.type), yearOf(item), item.status !== "done" && statusLabel(item.status)].filter(Boolean).join(" · ")}</span>
        <Stars rating={item.rating} />
      </span>
    </button>
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

function Inspect({ item, onClose, onEdit, onRemove }) {
  const url = useCover(item);
  const rarity = rarityOf(item.rating);
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
          <span>{statusLabel(item.status)}</span>
          {item.date && <span>{item.date.replaceAll("-", ".")}</span>}
          {item.creator && <span>{item.creator}</span>}
        </div>
        <div className="ct-score">
          <strong>{item.rating ? item.rating.toFixed(1) : "–"}</strong>
          <Stars rating={item.rating} size={22} />
        </div>
        <p className={item.review ? "ct-review" : "ct-review ct-review-empty"}>{item.review || "아직 한 줄 평이 없습니다."}</p>
        <div className="ct-actions">
          {confirm ? (
            <>
              <span className="ct-confirm-text">전시에서 치울까요?</span>
              <button type="button" className="ct-btn ct-btn-danger" onClick={onRemove}>치우기</button>
              <button type="button" className="ct-btn" onClick={() => setConfirm(false)}>취소</button>
            </>
          ) : (
            <>
              <button type="button" className="ct-btn ct-btn-primary" onClick={onEdit}><Pencil size={16} />수정</button>
              <button type="button" className="ct-btn ct-btn-ghost" onClick={() => setConfirm(true)}><Trash2 size={16} />치우기</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function RatingPicker({ value, onChange }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value;
  const rarity = rarityOf(shown);
  const pick = (event, index) => {
    const box = event.currentTarget.getBoundingClientRect();
    return index + (event.clientX - box.left < box.width / 2 ? 0.5 : 1);
  };
  return (
    <div className={`ct-rating-picker ct-r-${rarity.id}`}>
      <div className="ct-rating-stars" onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = Math.max(0, Math.min(1, shown - index));
          return (
            <button
              key={index}
              type="button"
              aria-label={`${index + 1}점`}
              onPointerMove={(event) => setHover(pick(event, index))}
              onClick={(event) => onChange(event.detail === 0 ? index + 1 : pick(event, index))}
            >
              <Star size={30} strokeWidth={1.5} className="ct-star-empty" />
              <span className="ct-star-fill" style={{ width: `${fill * 100}%` }}><Star size={30} strokeWidth={1.5} /></span>
            </button>
          );
        })}
      </div>
      <div className="ct-rating-readout">
        <strong>{shown ? shown.toFixed(1) : "–"}</strong>
        <span>{rarity.label}</span>
        {value > 0 && <button type="button" onClick={() => onChange(0)}>평가 지우기</button>}
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
  const onPaste = (event) => {
    const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith("image/"));
    if (file) { event.preventDefault(); void takeImage(file); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.title.trim()) { setError("제목을 입력해 주세요."); return; }
    setBusy(true);
    try { await onSave({ ...draft, title: draft.title.trim(), creator: draft.creator.trim(), coverUrl: draft.coverUrl.trim() }); }
    catch (problem) { setError(problem.message); setBusy(false); }
  };
  const rarity = rarityOf(draft.rating);
  return (
    <Modal label={initial.title ? "피규어 수정" : "새 피규어 등록"} onClose={onClose} className={`ct-editor ct-r-${rarity.id}`}>
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
              <button type="button" className="ct-btn ct-btn-ghost" onClick={() => { setPreview(""); set({ cover: null, coverUrl: "" }); }}>지우기</button>
            )}
          </div>
        </div>
        <div className="ct-form">
          <span className="ct-rarity ct-rarity-inline">{initial.title ? "EDIT FIGURE" : "NEW FIGURE"}</span>
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
          <div className="ct-field">
            <span>평가</span>
            <RatingPicker value={draft.rating} onChange={(rating) => set({ rating })} />
          </div>
          <div className="ct-field-row">
            <div className="ct-field">
              <span>상태</span>
              <div className="ct-choice ct-choice-small">
                {STATUSES.map((status) => (
                  <button key={status.id} type="button" aria-pressed={draft.status === status.id} onClick={() => set({ status: status.id })}>{status.label}</button>
                ))}
              </div>
            </div>
            <label className="ct-field">
              <span>날짜</span>
              <input className="ct-input" type="date" value={draft.date} onChange={(event) => set({ date: event.target.value })} />
            </label>
          </div>
          <label className="ct-field">
            <span>작가 · 감독 · 제작사</span>
            <input className="ct-input" value={draft.creator} onChange={(event) => set({ creator: event.target.value })} placeholder="선택 입력" maxLength={80} />
          </label>
          <label className="ct-field">
            <span>한 줄 평</span>
            <textarea className="ct-input ct-textarea" rows={4} value={draft.review} onChange={(event) => set({ review: event.target.value })} placeholder="어떤 점이 좋았나요?" />
          </label>
          {error && <p className="ct-error" role="alert">{error}</p>}
          <div className="ct-actions">
            <button type="submit" className="ct-btn ct-btn-primary" disabled={busy}><Trophy size={16} />{initial.title ? "저장" : "전시하기"}</button>
            <button type="button" className="ct-btn" onClick={onClose}>취소</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Contents() {
  const { items, ready, status, change } = useContents();
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("recent");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const stats = useMemo(() => collectionStats(items), [items]);
  const shown = useMemo(() => visibleItems(items, { type, sort, query }), [items, type, sort, query]);
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
      <header className="ct-hero">
        <div className="ct-hero-title">
          <span className="ct-eyebrow"><Trophy size={14} />TROPHY ROOM</span>
          <h1>Contents</h1>
          <p>지금까지 즐긴 이야기들의 전시관</p>
        </div>
        <dl className="ct-stats">
          <div><dt>전시 중</dt><dd>{stats.total}</dd></div>
          <div><dt>평균 평점</dt><dd>{stats.average ? stats.average.toFixed(1) : "–"}</dd></div>
          <div className="ct-stat-legend"><dt>LEGENDARY</dt><dd>{stats.legendary}</dd></div>
          <div><dt>{new Date().getFullYear()}년</dt><dd>{stats.thisYear}</dd></div>
        </dl>
        <button type="button" className="ct-btn ct-btn-primary ct-add" onClick={() => setEditing(emptyItem())}>
          <Plus size={18} /><span>새 피규어 등록</span>
        </button>
      </header>

      <div className="ct-toolbar">
        <div className="ct-filters" role="tablist" aria-label="종류">
          <button type="button" role="tab" aria-selected={type === "all"} onClick={() => setType("all")}>
            전체<b>{stats.total}</b>
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

      {!ready ? (
        <p className="ct-status" role="status">{status}</p>
      ) : shown.length ? (
        <div className="ct-gallery">
          {shown.map((item, index) => <FigureCase key={item.id} item={item} index={index} onOpen={setOpenId} />)}
        </div>
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
        <Inspect item={opened} onClose={() => setOpenId(null)} onEdit={() => setEditing(opened)} onRemove={remove} />
      )}
      {editing && <Editor initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
