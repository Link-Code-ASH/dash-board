import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHubRuntime } from "../hub/context.jsx";
import {
  BookOpen, BookText, Check, Clapperboard, Crown, Gamepad2, Hourglass, ImagePlus, Pencil, Plus, Search, Shapes,
  Sparkles, Star, Trash2, Trophy, Tv, X,
} from "lucide-react";
import { useContents } from "./ContentsProvider.jsx";
import {
  RARITIES, STATUSES, TIER_NAMES, TYPES, collectionStats, dDayLabel, daysUntil, emptyItem, hallOfFame, isUpcoming,
  localDateKey, rarityOf, rarityWings, statusLabel, typeLabel, upcomingItems, visibleItems,
} from "./model.js";
import { coverUrl, prepareCover, saveCover } from "./cloud.js";
import "./contents.css";

const typeIcons = { webtoon: BookOpen, drama: Tv, movie: Clapperboard, anime: Sparkles, novel: BookText, game: Gamepad2, etc: Shapes };
const SORTS = [{ id: "tier", label: "등급" }, { id: "recent", label: "최근" }, { id: "rating", label: "평점" }, { id: "title", label: "이름" }];
const yearOf = (item) => (item.date || "").slice(0, 4);
const dotted = (date) => date.replaceAll("-", ".");
const comingBadge = (days) => days !== null && days <= 0 ? "OUT NOW" : "COMING SOON";
// Podium slots left to right: 4th, 2nd, 1st, 3rd, 5th.
const PODIUM = [3, 1, 0, 2, 4];
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
        <span className="ct-meta">{[typeLabel(item.type), yearOf(item), item.status !== "done" && statusLabel(item.status)].filter(Boolean).join(" · ")}</span>
        <Stars rating={item.rating} />
      </span>
    </button>
  );
}

function ComingCase({ item, onOpen, index }) {
  const url = useCover(item);
  const days = daysUntil(item.releaseDate);
  return (
    <button
      type="button"
      className={`ct-case ct-coming ct-r-coming${days !== null && days <= 0 ? " is-out" : ""}`}
      style={{ "--delay": `${Math.min(index, 18) * 40}ms` }}
      onClick={() => onOpen(item.id)}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      aria-label={`${item.title} 출시 정보 보기`}
    >
      <span className="ct-rarity">{comingBadge(days)}</span>
      <span className="ct-stage">
        <Figure item={item} url={url} />
        <span className="ct-pedestal" aria-hidden="true"><span /></span>
      </span>
      <span className="ct-ledge" aria-hidden="true" />
      <span className="ct-plate">
        <strong>{item.title}</strong>
        <span className="ct-meta">{[typeLabel(item.type), item.platform].filter(Boolean).join(" · ")}</span>
        <span className="ct-dday"><b>{dDayLabel(days)}</b>{item.releaseDate && <time dateTime={item.releaseDate}>{dotted(item.releaseDate)}</time>}</span>
      </span>
    </button>
  );
}

function PodiumSlot({ item, rank, onOpen }) {
  const url = useCover(item);
  const rarity = rarityOf(item.rating);
  return (
    <button
      type="button"
      className={`ct-slot ct-rank-${rank} ct-r-${rarity.id}`}
      onClick={() => onOpen(item.id)}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      aria-label={`${rank}위 ${item.title} 자세히 보기`}
    >
      {rank === 1 && <Crown className="ct-crown" size={26} strokeWidth={1.6} aria-hidden="true" />}
      <span className="ct-beam" aria-hidden="true" />
      <span className="ct-stage">
        <Figure item={item} url={url} />
        <span className="ct-pedestal" aria-hidden="true"><span /></span>
      </span>
      <span className="ct-plinth" aria-hidden="true"><b>{rank}</b></span>
      {rank > 1 && <span className="ct-slot-name">{item.title}</span>}
    </button>
  );
}

function Hall({ hall, stats, typeName, onOpen, onAdd }) {
  const top = hall[0];
  const rarity = top ? rarityOf(top.rating) : { id: "unrated", label: "" };
  return (
    <header className={`ct-hall ct-r-${rarity.id}${top ? "" : " is-empty"}`}>
      <span className="ct-hall-arch" aria-hidden="true" />
      <div className="ct-hall-head">
        <span className="ct-eyebrow"><Trophy size={14} />TROPHY ROOM</span>
        <h1>Contents</h1>
        <p>지금까지 즐긴 이야기들의 전시관</p>
      </div>
      <button type="button" className="ct-btn ct-btn-primary ct-add" onClick={onAdd}>
        <Plus size={18} /><span>새 피규어 등록</span>
      </button>
      {top && (
        <>
          <span className="ct-hall-label">HALL OF FAME{typeName && <em>{typeName}</em>}</span>
          <div className="ct-podium">
            {PODIUM.filter((index) => index < hall.length).map((index) => (
              <PodiumSlot key={hall[index].id} item={hall[index]} rank={index + 1} onOpen={onOpen} />
            ))}
            <span className="ct-floor" aria-hidden="true" />
          </div>
          <div className="ct-hall-plate">
            <span className="ct-rarity ct-rarity-inline">{rarity.label}</span>
            <strong>{top.title}</strong>
            <span className="ct-hall-score"><b>{top.rating.toFixed(1)}</b><Stars rating={top.rating} size={17} /></span>
            <span className="ct-meta">{[typeLabel(top.type), top.creator, yearOf(top)].filter(Boolean).join(" · ")}</span>
          </div>
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

function Wing({ id, label, title, caption, count, icon: Icon, children }) {
  return (
    <section className={`ct-wing ct-r-${id}`} aria-label={title}>
      <span className="ct-wing-light" aria-hidden="true" />
      <div className="ct-wing-head">
        <span className="ct-wing-label">{Icon && <Icon size={13} strokeWidth={2} />}<span>{label}</span></span>
        <h2>{title}</h2>
        <p>{caption}<b>{count}</b></p>
      </div>
      <div className="ct-gallery">{children}</div>
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
          <span>{statusLabel(item.status)}</span>
          {!upcoming && item.date && <span>{dotted(item.date)}</span>}
          {item.platform && <span>{item.platform}</span>}
          {item.creator && <span>{item.creator}</span>}
        </div>
        {upcoming ? (
          <div className="ct-score ct-score-coming">
            <strong>{dDayLabel(days)}</strong>
            <span className="ct-score-text">
              <b>{item.releaseDate ? `${dotted(item.releaseDate)} 출시` : "출시일 미정"}</b>
              {item.hype > 0 && <span className="ct-hype">기대도 <Stars rating={item.hype} size={15} /></span>}
            </span>
          </div>
        ) : (
          <div className="ct-score">
            <strong>{item.rating ? item.rating.toFixed(1) : "–"}</strong>
            <Stars rating={item.rating} size={22} />
            {item.releaseDate && <span className="ct-score-note">{dotted(item.releaseDate)} 출시</span>}
          </div>
        )}
        <p className={item.review ? "ct-review" : "ct-review ct-review-empty"}>{item.review || (upcoming ? "아직 메모가 없습니다." : "아직 한 줄 평이 없습니다.")}</p>
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
              <button type="button" className="ct-btn ct-btn-ghost" onClick={() => setConfirm(true)}><Trash2 size={16} />치우기</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function RatingPicker({ value, onChange, hype = false }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value;
  const rarity = hype ? { id: "coming", label: "기대도" } : rarityOf(shown);
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
        {!hype && <span>{rarity.label}</span>}
        {value > 0 && <button type="button" onClick={() => onChange(0)}>{hype ? "지우기" : "평가 지우기"}</button>}
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
    try { await onSave({ ...draft, title: draft.title.trim(), creator: draft.creator.trim(), platform: draft.platform.trim(), coverUrl: draft.coverUrl.trim() }); }
    catch (problem) { setError(problem.message); setBusy(false); }
  };
  const upcoming = isUpcoming(draft);
  const rarity = upcoming ? { id: "coming" } : rarityOf(draft.rating);
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
            <span>상태</span>
            <div className="ct-choice ct-choice-small">
              {STATUSES.map((status) => (
                <button key={status.id} type="button" aria-pressed={draft.status === status.id} onClick={() => set({ status: status.id })}>
                  {status.id === "upcoming" && <Hourglass size={14} strokeWidth={1.8} />}{status.label}
                </button>
              ))}
            </div>
          </div>
          {upcoming ? (
            <>
              <div className="ct-field-row ct-field-row-even">
                <label className="ct-field">
                  <span>출시일 · Flow 일정에 표시</span>
                  <input className="ct-input" type="date" value={draft.releaseDate} onChange={(event) => set({ releaseDate: event.target.value })} />
                </label>
                <div className="ct-field">
                  <span>기대도</span>
                  <RatingPicker hype value={draft.hype} onChange={(hype) => set({ hype })} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="ct-field">
                <span>평가</span>
                <RatingPicker value={draft.rating} onChange={(rating) => set({ rating })} />
              </div>
              <div className="ct-field-row ct-field-row-even">
                <label className="ct-field">
                  <span>감상 날짜</span>
                  <input className="ct-input" type="date" value={draft.date} onChange={(event) => set({ date: event.target.value })} />
                </label>
                <label className="ct-field">
                  <span>출시일 · 선택</span>
                  <input className="ct-input" type="date" value={draft.releaseDate} onChange={(event) => set({ releaseDate: event.target.value })} />
                </label>
              </div>
            </>
          )}
          <div className="ct-field-row ct-field-row-even">
            <label className="ct-field">
              <span>작가 · 감독 · 제작사</span>
              <input className="ct-input" value={draft.creator} onChange={(event) => set({ creator: event.target.value })} placeholder="선택 입력" maxLength={80} />
            </label>
            <label className="ct-field">
              <span>어디서 · 플랫폼</span>
              <input className="ct-input" value={draft.platform} onChange={(event) => set({ platform: event.target.value })} placeholder="넷플릭스, 네이버웹툰, 스팀…" maxLength={60} />
            </label>
          </div>
          <label className="ct-field">
            <span>{upcoming ? "기대 포인트 · 메모" : "한 줄 평"}</span>
            <textarea className="ct-input ct-textarea" rows={4} value={draft.review} onChange={(event) => set({ review: event.target.value })}
              placeholder={upcoming ? "공개된 정보, 기대하는 점, 예고편 링크 등" : "어떤 점이 좋았나요?"} />
          </label>
          {error && <p className="ct-error" role="alert">{error}</p>}
          <div className="ct-actions">
            <button type="submit" className="ct-btn ct-btn-primary" disabled={busy}>{upcoming ? <Hourglass size={16} /> : <Trophy size={16} />}{initial.title ? "저장" : upcoming ? "출시 예정에 올리기" : "전시하기"}</button>
            <button type="button" className="ct-btn" onClick={onClose}>취소</button>
          </div>
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
  const hall = useMemo(() => hallOfFame(items, { type }), [items, type]);
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
      <Hall hall={ready ? hall : []} stats={stats} typeName={type === "all" ? "" : typeLabel(type)}
        onOpen={setOpenId} onAdd={() => setEditing(emptyItem())} />

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

      {ready && coming.length > 0 && (
        <Wing id="coming" label="COMING SOON" title="출시 예정" caption="기다리는 작품" count={coming.length} icon={Hourglass}>
          {coming.map((item, index) => <ComingCase key={item.id} item={item} index={index} onOpen={setOpenId} />)}
        </Wing>
      )}
      {!ready ? (
        <p className="ct-status" role="status">{status}</p>
      ) : shown.length ? (
        wings.map((wing) => wing.id === "gallery" ? (
          <Wing key="gallery" id="unrated" label="GALLERY" title="전시관" caption={`${SORTS.find((entry) => entry.id === sort)?.label}순 전체 전시`} count={wing.items.length} icon={Trophy}>
            {wing.items.map((item, index) => <FigureCase key={item.id} item={item} index={index} onOpen={setOpenId} />)}
          </Wing>
        ) : (
          <Wing key={wing.id} id={wing.id} label={wing.id === "unrated" ? "UNRATED" : RARITIES.find((entry) => entry.id === wing.id).label}
            title={TIER_NAMES[wing.id]} caption={TIER_RANGES[wing.id]} count={wing.items.length} icon={wing.id === "legendary" ? Crown : null}>
            {wing.items.map((item, index) => <FigureCase key={item.id} item={item} index={index} onOpen={setOpenId} />)}
          </Wing>
        ))
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
