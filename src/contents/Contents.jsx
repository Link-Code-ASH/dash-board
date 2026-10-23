import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHubRuntime } from "../hub/context.jsx";
import {
  BookOpen, BookText, Check, Clapperboard, ExternalLink, Gamepad2, Hourglass, ImagePlus, MessageCircle, Minus, Pencil, Plus, RefreshCw,
  Search, Send, Shapes, Sparkles, Trash2, Tv, X,
} from "lucide-react";
import { useContents } from "./ContentsProvider.jsx";
import {
  TYPES, archiveNumbers, collectionStats, dDayLabel, daysUntil, emptyItem, isUpcoming, localDateKey, typeLabel, uid,
  upcomingItems, visibleItems,
} from "./model.js";
import { awaitingAnswer, nextQuestion } from "./interview.js";
import { coverUrl, imageFromUrl, naverSearch, prepareCover, proxyImage, saveCover } from "./cloud.js";
import { imageFromTransfer, mayHoldImage } from "./intake.js";
import { downloadCover, searchCovers } from "./coverSearch.js";
import "./contents.css";

const typeIcons = { webtoon: BookOpen, drama: Tv, movie: Clapperboard, anime: Sparkles, novel: BookText, game: Gamepad2, etc: Shapes };
const SORTS = [{ id: "edited", label: "최근 수정" }, { id: "rating", label: "평점" }, { id: "title", label: "이름" }];
const dotted = (date) => date.replaceAll("-", ".");
// The last time a title was edited, shown as a plain local date.
const editedOn = (item) => dotted(localDateKey(new Date(item.updatedAt || item.createdAt)));
const recordNo = (number) => `No.${String(number || 0).padStart(3, "0")}`;
const answers = (item) => (item.dialogue || []).filter((entry) => entry.role === "me");
// What a card shows under the title: the one-line review, else the latest answer from the Q&A.
const excerpt = (item) => item.review || answers(item).at(-1)?.text || "";
const WHO = { me: "나", claude: "Claude", guide: "질문" };
const GOOGLE_HINTS = { movie: "영화 포스터", drama: "드라마 포스터", anime: "애니 포스터", webtoon: "웹툰", novel: "소설 표지", game: "게임 표지", etc: "포스터" };

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

// Lucide's star outline. Its centre line is x = 12, so clipping at 24 * fill cuts the star exactly in half at 0.5.
const STAR_PATH = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

function StarGlyph({ fill = 0, ghost = 0, size = 16 }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className="ct-star" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <clipPath id={`${id}f`}><rect x="0" y="0" width={24 * fill} height="24" /></clipPath>
        <clipPath id={`${id}g`}><rect x="0" y="0" width={24 * ghost} height="24" /></clipPath>
      </defs>
      <path className="ct-star-off" d={STAR_PATH} />
      {ghost > fill && <path className="ct-star-ghost" d={STAR_PATH} clipPath={`url(#${id}g)`} />}
      {fill > 0 && <path className="ct-star-on" d={STAR_PATH} clipPath={`url(#${id}f)`} />}
    </svg>
  );
}
const starFill = (value, index) => Math.max(0, Math.min(1, value - index));

function Stars({ rating, size = 14 }) {
  return (
    <span className="ct-stars" role="img" aria-label={rating ? `별점 ${rating}점` : "평가 전"}>
      {[0, 1, 2, 3, 4].map((index) => <StarGlyph key={index} fill={starFill(rating, index)} size={size} />)}
    </span>
  );
}

function Cover({ item, url, className = "" }) {
  const Icon = typeIcons[item.type] || Shapes;
  return (
    <span className={`ct-cover ${className}`}>
      {url ? <img src={url} alt="" draggable="false" /> : (
        <span className="ct-cover-blank"><Icon size={22} strokeWidth={1.5} /><span>{item.title || "표지"}</span></span>
      )}
    </span>
  );
}

function RecordCard({ item, number, onOpen }) {
  const url = useCover(item);
  const text = excerpt(item);
  const count = answers(item).length;
  return (
    <button type="button" className="ct-card" onClick={() => onOpen(item.id)} aria-label={`${item.title} 기록 열기`}>
      <Cover item={item} url={url} />
      <span className="ct-card-body">
        <span className="ct-card-top">
          <span className="ct-no">{recordNo(number)}</span>
          <span className="ct-type">{typeLabel(item.type)}</span>
        </span>
        <strong className="ct-card-title">{item.title}</strong>
        <span className="ct-card-score"><Stars rating={item.rating} size={14} /><b>{item.rating ? item.rating.toFixed(1) : "–"}</b></span>
        <span className={text ? "ct-card-text" : "ct-card-text is-empty"}>{text || "아직 감상평이 없어요."}</span>
        <span className="ct-card-foot">
          <span><MessageCircle size={12} />문답 {count}</span>
          <span>{editedOn(item)} 수정</span>
        </span>
      </span>
    </button>
  );
}

function UpcomingRow({ item, onOpen }) {
  const days = daysUntil(item.releaseDate);
  return (
    <button type="button" className={`ct-up-row${days !== null && days <= 0 ? " is-out" : ""}`} onClick={() => onOpen(item.id)}>
      <span className="ct-dday">{dDayLabel(days)}</span>
      <span className="ct-up-body">
        <strong>{item.title}</strong>
        <span>{typeLabel(item.type)} · {item.releaseDate ? dotted(item.releaseDate) : "출시일 미정"}</span>
      </span>
    </button>
  );
}

// Lets a dialog take an image dropped anywhere on it or pasted while it is open, from a file, a copied
// image or a picture dragged straight out of another page (Google Images). onImage gets the image data.
function useImageIntake(onImage) {
  const { userId } = useContents();
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState({ busy: false, error: "" });
  const depth = useRef(0);
  const latest = useRef(onImage);
  latest.current = onImage;
  const take = async (source) => {
    if (!source) return;
    setState({ busy: true, error: "" });
    try {
      const blob = source.file || await imageFromUrl(source.url, Boolean(userId));
      if (!blob) throw new Error("이 이미지는 바로 가져올 수 없어요. 이미지를 우클릭해서 '이미지 복사' 후 붙여넣어(Ctrl+V) 주세요.");
      await latest.current(blob);
      setState({ busy: false, error: "" });
    } catch (problem) {
      setState({ busy: false, error: problem.message });
    }
  };
  useEffect(() => {
    const onPaste = (event) => {
      const source = imageFromTransfer(event.clipboardData);
      if (!source) return;
      // Text pasted into a field stays text; only a real picture (or nothing else) becomes the cover.
      const typing = event.target.closest?.("input, textarea, [contenteditable]");
      if (typing && !source.file && event.clipboardData.getData("text/plain")) return;
      event.preventDefault();
      void take(source);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [userId]);
  const handlers = {
    onDragEnter: (event) => { if (!mayHoldImage(event.dataTransfer)) return; event.preventDefault(); depth.current += 1; setDragging(true); },
    onDragOver: (event) => { if (!mayHoldImage(event.dataTransfer)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDrop: (event) => {
      if (!mayHoldImage(event.dataTransfer)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      void take(imageFromTransfer(event.dataTransfer));
    },
  };
  return { dragging, handlers, ...state };
}

function Modal({ label, onClose, className = "", intake = null, children }) {
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
        <section className={`ct-modal ${className}`} role="dialog" aria-modal="true" aria-label={label} {...(intake?.handlers || {})}>
          <button type="button" className="ct-close" onClick={onClose} aria-label="닫기"><X size={20} /></button>
          {children}
          {intake?.dragging && <div className="ct-drop-veil" aria-hidden="true"><ImagePlus size={30} strokeWidth={1.6} /><strong>여기에 놓으면 표지가 돼요</strong><span>크기는 알아서 맞춰요</span></div>}
        </section>
      </div>
    </div>,
    document.getElementById("root") || document.body,
  );
}

// The Q&A review. Claude writes the chat's questions and answers here; the built-in questions work without it.
function Dialogue({ item, onChange }) {
  const dialogue = item.dialogue || [];
  const visible = dialogue.filter((entry) => !entry.skipped);
  const [text, setText] = useState("");
  const waiting = awaitingAnswer(visible);
  const next = nextQuestion(item);
  const listRef = useRef(null);
  // Keeps the newest entry in view inside the list without moving the dialog itself.
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [visible.length]);
  const push = (entry) => onChange([...dialogue, { id: uid(), at: new Date().toISOString(), ...entry }]);
  const ask = () => next && push({ role: "guide", text: next });
  const answer = (event) => {
    event?.preventDefault();
    if (!text.trim()) return;
    push({ role: "me", text: text.trim() });
    setText("");
  };
  // Swapping keeps the unanswered question marked as skipped (hidden) so the plan moves past it.
  const swap = () => {
    const marked = [...dialogue.slice(0, -1), { ...dialogue.at(-1), skipped: true }];
    const after = nextQuestion({ ...item, dialogue: marked });
    onChange(after ? [...marked, { id: uid(), at: new Date().toISOString(), role: "guide", text: after }] : marked);
  };
  const drop = (id) => onChange(dialogue.filter((entry) => entry.id !== id));
  return (
    <section className="ct-dialogue" aria-label="감상 문답">
      <div className="ct-dialogue-head">
        <h3>감상 문답</h3>
        <span>답변 {answers(item).length}</span>
      </div>
      {visible.length ? (
        <ol className="ct-qa" ref={listRef}>
          {visible.map((entry) => (
            <li key={entry.id} className={entry.role === "me" ? "ct-qa-item ct-qa-me" : "ct-qa-item ct-qa-ask"}>
              <span className="ct-qa-who">{WHO[entry.role]}</span>
              <p>{entry.text}</p>
              <button type="button" className="ct-qa-drop" onClick={() => drop(entry.id)} aria-label="이 문답 지우기"><X size={13} /></button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="ct-dialogue-empty">프로젝트 채팅에서 Claude와 이 작품 이야기를 나누면, 그 문답이 여기에 차곡차곡 기록돼요. 혼자 적고 싶을 땐 아래 질문으로 시작해 보세요.</p>
      )}
      {waiting ? (
        <form className="ct-reply" onSubmit={answer}>
          <textarea className="ct-input ct-textarea" rows={2} value={text} onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) answer(event); }}
            placeholder="생각나는 대로 적어 보세요 (Ctrl+Enter로 보내기)" aria-label="답변" />
          <div className="ct-reply-actions">
            {visible.at(-1).role === "guide" && <button type="button" className="ct-btn ct-btn-ghost" onClick={swap}><RefreshCw size={14} />다른 질문</button>}
            <button type="submit" className="ct-btn ct-btn-primary" disabled={!text.trim()}><Send size={15} />답하기</button>
          </div>
        </form>
      ) : next ? (
        <button type="button" className="ct-btn ct-ask" onClick={ask}><MessageCircle size={16} />{visible.length ? "다음 질문 받기" : "기본 질문으로 시작하기"}</button>
      ) : null}
    </section>
  );
}

function Record({ item, number, onClose, onEdit, onRemove, onComplete, onDialogue, onCover }) {
  const url = useCover(item);
  const intake = useImageIntake(onCover);
  const upcoming = isUpcoming(item);
  const days = daysUntil(item.releaseDate);
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal label={`${item.title} 기록`} onClose={onClose} className={upcoming ? "ct-record ct-record-upcoming" : "ct-record"} intake={intake}>
      <aside className="ct-record-side">
        <Cover item={item} url={url} className="ct-cover-large" />
        <p className={intake.error ? "ct-drop-hint ct-error" : "ct-drop-hint"} role="status">
          {intake.busy ? "표지를 가져오는 중…" : intake.error || "이미지를 끌어다 놓거나 붙여넣어 표지 바꾸기"}
        </p>
        <div className="ct-record-meta">
          <span className="ct-no">{upcoming ? "출시 예정" : recordNo(number)}</span>
          <h2>{item.title}</h2>
          <span className="ct-type">{typeLabel(item.type)}</span>
          {upcoming ? (
            <p className="ct-record-score"><b className="ct-dday">{dDayLabel(days)}</b><span>{item.releaseDate ? `${dotted(item.releaseDate)} 출시` : "출시일 미정"}</span></p>
          ) : (
            <p className="ct-record-score"><Stars rating={item.rating} size={20} /><b>{item.rating ? item.rating.toFixed(1) : "–"}</b></p>
          )}
          <span className="ct-updated">마지막 수정 {editedOn(item)}</span>
        </div>
        <div className="ct-actions">
          {confirm ? (
            <>
              <span className="ct-confirm-text">기록을 지울까요?</span>
              <button type="button" className="ct-btn ct-btn-danger" onClick={onRemove}>지우기</button>
              <button type="button" className="ct-btn" onClick={() => setConfirm(false)}>취소</button>
            </>
          ) : (
            <>
              {upcoming && <button type="button" className="ct-btn ct-btn-primary" onClick={onComplete}><Check size={16} />다 봤어요</button>}
              <button type="button" className={upcoming ? "ct-btn" : "ct-btn ct-btn-primary"} onClick={onEdit}><Pencil size={16} />수정</button>
              <button type="button" className="ct-btn ct-btn-icon" onClick={() => setConfirm(true)} aria-label="기록 지우기"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </aside>
      <div className="ct-record-main">
        <section className="ct-oneline">
          <h3>{upcoming ? "메모" : "한 줄 평"}</h3>
          <p className={item.review ? "" : "is-empty"}>{item.review || (upcoming ? "아직 메모가 없어요." : "문답을 나눈 뒤 한 문장으로 남겨 보세요.")}</p>
        </section>
        {!upcoming && <Dialogue item={item} onChange={onDialogue} />}
      </div>
    </Modal>
  );
}

// Each star has a left half (x.5) and a right half (x.0) as separate targets, so a click always lands on
// a clear value. Hovering only shows a faint preview; the chosen value stays solid until another click.
function RatingPicker({ value, onChange }) {
  const [hover, setHover] = useState(null);
  const step = (delta) => onChange(Math.min(5, Math.max(0, value + delta)));
  return (
    <div className="ct-rating-picker">
      <div className="ct-rating-stars" role="radiogroup" aria-label="별점" onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className="ct-star-slot">
            <StarGlyph fill={starFill(value, index)} ghost={hover === null ? 0 : starFill(hover, index)} size={34} />
            {[0.5, 1].map((part) => {
              const score = index + part;
              return (
                <button key={part} type="button" role="radio" aria-checked={value === score} aria-label={`${score.toFixed(1)}점`}
                  className={part === 0.5 ? "ct-half ct-half-left" : "ct-half ct-half-right"}
                  onPointerEnter={() => setHover(score)} onClick={() => onChange(score)} />
              );
            })}
          </span>
        ))}
      </div>
      <div className="ct-rating-step">
        <button type="button" onClick={() => step(-0.5)} disabled={value <= 0} aria-label="0.5점 내리기"><Minus size={16} /></button>
        <strong>{value ? value.toFixed(1) : "–"}</strong>
        <button type="button" onClick={() => step(0.5)} disabled={value >= 5} aria-label="0.5점 올리기"><Plus size={16} /></button>
      </div>
      <div className="ct-rating-hint">
        {hover !== null && hover !== value ? <em>{hover.toFixed(1)}점으로</em>
          : value > 0 ? <button type="button" onClick={() => onChange(0)}>지우기</button>
            : <em>평가 전</em>}
      </div>
    </div>
  );
}

function Editor({ initial, number, onClose, onSave }) {
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
    searchCovers(title, type, { signal: controller.signal, naver: userId ? naverSearch : null })
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
  // A chosen candidate is copied into our own storage: straight from its host when allowed, else through
  // our server function (signed in), else it is kept as a link to the preview that already showed.
  const pickCover = async (candidate) => {
    setPicked(candidate.url);
    setError("");
    const blob = await downloadCover(candidate.url)
      || (userId && (await proxyImage(candidate.url) || (candidate.thumb && candidate.thumb !== candidate.url && await proxyImage(candidate.thumb))));
    if (blob) { await takeImage(blob); return; }
    setPreview("");
    set({ cover: null, coverUrl: candidate.thumb || candidate.url });
  };
  const googleUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${draft.title.trim()} ${GOOGLE_HINTS[draft.type] || "포스터"}`)}`;
  const intake = useImageIntake(async (blob) => { setPicked(""); await takeImage(blob); });
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.title.trim()) { setError("제목을 입력해 주세요."); return; }
    setBusy(true);
    try { await onSave({ ...draft, title: draft.title.trim(), coverUrl: draft.coverUrl.trim() }); }
    catch (problem) { setError(problem.message); setBusy(false); }
  };
  const upcoming = isUpcoming(draft);
  return (
    <Modal label={upcoming ? "출시 예정 작품" : initial.title ? "기록 수정" : "새 기록"} onClose={onClose} className="ct-editor" intake={intake}>
      <form onSubmit={submit}>
        <aside className="ct-editor-side">
          <button type="button" className="ct-drop" onClick={() => fileRef.current?.click()} aria-label="표지 이미지 고르기">
            {shownUrl || draft.title ? <Cover item={draft} url={shownUrl} className="ct-cover-large" /> : (
              <span className="ct-cover ct-cover-large ct-cover-empty"><ImagePlus size={28} strokeWidth={1.4} /><span>표지 이미지</span></span>
            )}
          </button>
          <p className={intake.error ? "ct-drop-hint ct-error" : "ct-drop-hint"} role="status">
            {intake.busy ? "표지를 가져오는 중…" : intake.error || "구글 이미지를 그대로 끌어다 놓거나 복사해서 붙여넣기(Ctrl+V)"}
          </p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            onChange={(event) => { void takeImage(event.target.files[0]); event.target.value = ""; }} />
          <div className="ct-cover-row">
            <input className="ct-input" placeholder="또는 이미지 주소 붙여넣기" value={draft.coverUrl}
              onChange={(event) => { setPreview(""); set({ coverUrl: event.target.value, cover: null }); }} />
            {(draft.cover || draft.coverUrl) && (
              <button type="button" className="ct-btn ct-btn-ghost" onClick={() => { setPreview(""); setPicked(""); set({ cover: null, coverUrl: "" }); }}>지우기</button>
            )}
          </div>
          <div className="ct-suggest">
            <div className="ct-suggest-head">
              <span><Sparkles size={14} />표지 후보</span>
              <div className="ct-suggest-tools">
                {draft.title.trim().length >= 2 && (
                  <a href={googleUrl} target="_blank" rel="noreferrer" title="구글 이미지에서 찾은 뒤 복사해서 여기에 붙여넣기(Ctrl+V)"><ExternalLink size={13} />구글</a>
                )}
                <button type="button" onClick={() => findCovers()} disabled={draft.title.trim().length < 2 || found.status === "loading"}>
                  <RefreshCw size={13} />{found.status === "idle" ? "찾기" : "다시 찾기"}
                </button>
              </div>
            </div>
            {found.status === "loading" ? (
              <p className="ct-suggest-note" role="status">표지를 찾는 중…</p>
            ) : found.list.length ? (
              <div className="ct-suggest-grid">
                {found.list.map((candidate) => (
                  <button key={candidate.url} type="button" className="ct-suggest-item" aria-pressed={picked === candidate.url}
                    onClick={() => void pickCover(candidate)} title={`${candidate.title} · ${candidate.source}`} aria-label={`${candidate.title} 표지 쓰기`}>
                    <img src={candidate.thumb || candidate.url} alt="" loading="lazy" referrerPolicy="no-referrer"
                      onError={(event) => { event.currentTarget.parentElement.hidden = true; }} />
                    <span>{candidate.source}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="ct-suggest-note">{found.status === "done" ? "찾지 못했어요. 구글 버튼으로 찾은 이미지를 복사해서 붙여넣어(Ctrl+V) 주세요." : "제목을 입력하면 표지를 알아서 찾아 드려요."}</p>
            )}
          </div>
        </aside>
        <div className="ct-form">
          <span className="ct-no">{upcoming ? "출시 예정" : initial.title ? recordNo(number) : "새 기록"}</span>
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
              placeholder={upcoming ? "기대하는 점, 예고편 링크 등" : "한 문장으로 남긴다면? 문답을 나눈 뒤에 적어도 돼요."} />
          </label>
          {error && <p className="ct-error" role="alert">{error}</p>}
          <div className="ct-actions">
            <button type="submit" className="ct-btn ct-btn-primary" disabled={busy}>{upcoming ? <Hourglass size={16} /> : <Check size={16} />}{initial.title ? "저장" : upcoming ? "출시 예정에 올리기" : "기록하기"}</button>
            <button type="button" className="ct-btn" onClick={onClose}>취소</button>
          </div>
          <p className="ct-updated">{initial.title ? `마지막 수정 ${editedOn(initial)}` : "저장하면 오늘 날짜가 수정일로 기록돼요."}</p>
        </div>
      </form>
    </Modal>
  );
}

export default function Contents({ route }) {
  const { items, ready, status, change, userId } = useContents();
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("edited");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const stats = useMemo(() => collectionStats(items), [items]);
  const shown = useMemo(() => visibleItems(items, { type, sort, query }), [items, type, sort, query]);
  const coming = useMemo(() => upcomingItems(items, { type, query }), [items, type, query]);
  const numbers = useMemo(() => archiveNumbers(items), [items]);
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
  const saveDialogue = (dialogue) => {
    const now = new Date().toISOString();
    void change(opened.id, (current) => ({ ...current, dialogue, updatedAt: now }));
  };
  // An image dropped or pasted on an open record becomes its cover right away.
  const setCover = async (blob) => {
    const id = await saveCover(userId, await prepareCover(blob));
    const now = new Date().toISOString();
    await change(opened.id, (current) => ({ ...current, cover: id, coverUrl: "", updatedAt: now }));
  };
  const addUpcoming = () => setEditing({ ...emptyItem(), status: "upcoming", date: "" });

  return (
    <div className="ct-room">
      <header className="ct-head">
        <div className="ct-head-title">
          <span className="ct-eyebrow">CONTENTS ARCHIVE</span>
          <h1>Contents</h1>
          <p>다 본 작품을 문답으로 남기는 기록 보관소</p>
        </div>
        <dl className="ct-stats">
          <div><dt>기록</dt><dd>{stats.total}</dd></div>
          <div><dt>평균 평점</dt><dd>{stats.average ? stats.average.toFixed(1) : "–"}</dd></div>
          <div><dt>{new Date().getFullYear()}년</dt><dd>{stats.thisYear}</dd></div>
          <div><dt>출시 예정</dt><dd>{stats.upcoming}</dd></div>
        </dl>
        <button type="button" className="ct-btn ct-btn-primary ct-add" onClick={() => setEditing(emptyItem())}>
          <Plus size={18} /><span>새 기록</span>
        </button>
      </header>

      <div className="ct-toolbar">
        <div className="ct-filters" role="tablist" aria-label="종류">
          <button type="button" role="tab" aria-selected={type === "all"} onClick={() => setType("all")}>전체<b>{stats.all}</b></button>
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" aria-label="제목, 한 줄 평 검색" />
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
      ) : (
        <div className="ct-layout">
          <section className="ct-archive" aria-label="기록">
            <div className="ct-section-head">
              <h2>기록</h2>
              <span>{shown.length}개 · {SORTS.find((entry) => entry.id === sort)?.label}순</span>
            </div>
            {shown.length ? (
              <div className="ct-cards">
                {shown.map((item) => <RecordCard key={item.id} item={item} number={numbers.get(item.id)} onOpen={setOpenId} />)}
              </div>
            ) : (
              <div className="ct-empty">
                <strong>{stats.total ? "조건에 맞는 기록이 없어요" : "아직 비어 있는 아카이브"}</strong>
                <p>{stats.total ? "다른 종류나 검색어로 찾아보세요." : "다 본 작품을 하나 기록하고, 채팅에서 Claude와 감상을 나눠 보세요."}</p>
                {!stats.total && <button type="button" className="ct-btn ct-btn-primary" onClick={() => setEditing(emptyItem())}><Plus size={18} />새 기록</button>}
              </div>
            )}
          </section>
          <aside className="ct-upcoming" aria-label="출시 예정">
            <div className="ct-section-head">
              <h2>출시 예정</h2>
              <button type="button" className="ct-btn ct-btn-small" onClick={addUpcoming}><Plus size={14} />추가</button>
            </div>
            {coming.length ? (
              <div className="ct-up-list">{coming.map((item) => <UpcomingRow key={item.id} item={item} onOpen={setOpenId} />)}</div>
            ) : (
              <p className="ct-up-empty">기다리는 작품을 추가하면 출시일이 Flow 일정에 자동으로 표시돼요.</p>
            )}
          </aside>
        </div>
      )}
      {ready && <p className="ct-sync">{status}</p>}

      {opened && !editing && (
        <Record item={opened} number={numbers.get(opened.id)} onClose={() => setOpenId(null)} onEdit={() => setEditing(opened)} onRemove={remove}
          onComplete={() => setEditing({ ...opened, status: "done", date: localDateKey() })} onDialogue={saveDialogue} onCover={setCover} />
      )}
      {editing && <Editor initial={editing} number={numbers.get(editing.id)} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
