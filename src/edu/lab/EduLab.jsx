import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, FileText, ListChecks, Printer, RefreshCw, Search, X } from "lucide-react";
import useLab from "./useLab.js";
import LabMarkdown from "./LabMarkdown.jsx";
import ItemPaper from "./ItemPaper.jsx";
import { DIFFICULTIES, distinct, filterItems, filterNotes, groupNotes, isComplete, isPrinciple, kindLabel, REVIEW_STATES, reviewLabel, selectedItems, sortPrinciples, USAGES, usageLabel } from "./filter.js";
import { notePatch, noteValues } from "./editing.js";
import "./lab.css";

function Empty({ children }) { return <div className="edu-lab-empty">{children}</div>; }
function ErrorNotice({ children }) { return children ? <p className="edu-error" role="alert">{children}</p> : null; }
function SelectFilter({ label, value, options, onChange, labels = {} }) {
  return <label className="edu-lab-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">전체 {label}</option>{options.map((option) => <option key={option} value={option}>{Object.hasOwn(labels, option) ? labels[option] : option}</option>)}</select></label>;
}
function SearchBox({ value, onChange }) {
  return <label className="edu-search"><Search size={17} /><input aria-label="연구소 검색" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="제목, 본문, 태그 검색" /></label>;
}
function NoteDetail({ note, busy, save, onRelated, deleted = false, drafts }) {
  const cached = drafts.get(note.id);
  const [editing, setEditing] = useState(cached?.dirty || false);
  const [base, setBase] = useState(cached?.base || note);
  const [values, setValues] = useState(() => cached?.values || noteValues(note));
  const [dirty, setDirty] = useState(cached?.dirty || false);
  const [error, setError] = useState(cached?.error || "");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!dirty) { setBase(note); setValues(noteValues(note)); } }, [note, dirty]);
  useEffect(() => { if (dirty) drafts.set(note.id, { base, values, dirty, error }); else drafts.delete(note.id); }, [drafts, note.id, base, values, dirty, error]);
  const change = (field) => (event) => { setValues((previous) => ({ ...previous, [field]: event.target.value })); setDirty(true); setSaved(false); };
  const reset = () => { setBase(note); setValues(noteValues(note)); setDirty(false); setError(""); setSaved(false); };
  const submit = async (event) => {
    event.preventDefault(); if (deleted) return; setError(""); setSaved(false);
    try {
      const next = await save(base, notePatch(base, values));
      setBase(next); setValues(noteValues(next)); setDirty(false); setEditing(false); setSaved(true);
    } catch (failure) { setError(failure.message || "저장하지 못했습니다. 입력 내용은 유지됩니다."); }
  };
  return <section className="edu-panel edu-lab-detail" aria-label="노트 본문">
    <div className="edu-panel-heading"><div><span className="edu-lab-eyebrow">{kindLabel(note.kind)} · {note.scope || "범위 미지정"}</span><h3>{note.title || "제목 없는 노트"}</h3></div><div className="edu-actions"><button type="button" className="edu-button" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "본문 보기" : "간단 편집"}</button></div></div>
    {dirty && base.revision !== note.revision && <p className="edu-lab-notice">바깥에서 노트가 변경되었습니다. 저장할 때 최신 내용과 비교합니다. 같은 내용을 함께 수정했다면 입력을 유지하고 저장을 멈춥니다.</p>}
    <ErrorNotice>{error}</ErrorNotice>
    {editing ? <form className="edu-form" onSubmit={submit}><div className="edu-form-grid">
      {[ ["title", "제목"], ["kind", "종류"], ["scope", "적용 범위"], ["tags", "태그 (쉼표로 구분)"], ["source", "출처"] ].map(([field, label]) => <label className={`edu-field${field === "title" || field === "source" ? " edu-field-wide" : ""}`} key={field}><span>{label}</span><input value={values[field]} onChange={change(field)} disabled={busy} /></label>)}
      <label className="edu-field edu-field-wide"><span>본문 (마크다운)</span><textarea rows={12} value={values.body} onChange={change("body")} disabled={busy} /></label>
    </div><div className="edu-form-footer"><span className="edu-save-hint">{dirty ? "저장하지 않은 변경사항이 있습니다." : "수식은 $…$ 또는 $$…$$로 입력하세요."}</span><div className="edu-actions"><button type="button" className="edu-button" disabled={busy || deleted} onClick={reset}>최신 내용으로 되돌리기</button><button className="edu-button edu-primary" disabled={busy || !dirty || deleted}>{busy ? "저장 중…" : "노트 저장"}</button></div></div></form> : <><LabMarkdown>{note.body}</LabMarkdown>{note.source && <p className="edu-lab-source">출처 · {note.source}</p>}{Array.isArray(note.tags) && <div className="edu-lab-tags">{note.tags.map((tag, index) => <span key={`${tag}:${index}`}>#{tag}</span>)}</div>}{Array.isArray(note.related) && note.related.length > 0 && <div className="edu-lab-related"><span>관련 기록</span>{note.related.map((id, index) => <button type="button" className="edu-text-button" key={`${id}:${index}`} onClick={() => onRelated(id)}>{id}</button>)}</div>}</>}
    {saved && <p className="edu-save-hint" role="status">노트를 저장했습니다.</p>}
  </section>;
}
function AttributeSelect({ label, value, options, onChange, disabled, empty }) {
  return <label className="edu-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{empty && <option value="">{empty}</option>}{Object.entries(options).map(([option, text]) => <option value={option} key={option}>{text}</option>)}</select></label>;
}
function ItemBadges({ item }) {
  if (isComplete(item)) return <span className="edu-lab-badges"><span className="edu-lab-status is-complete">완성</span></span>;
  return <span className="edu-lab-badges"><span className={`edu-lab-status is-${item.review_state || "unreviewed"}`}>{reviewLabel(item.review_state)}</span><span className={`edu-lab-status is-usage-${item.usage || "hold"}`}>{usageLabel(item.usage)}</span></span>;
}
const itemValues = (item) => ({ feedback: item.feedback || "", review_state: item.review_state || "unreviewed", usage: item.usage || "hold", difficulty: item.difficulty || "" });
function ItemDetail({ item, items, notes, busy, save, remove, onNote, onItem, deleted = false, drafts }) {
  const cached = drafts.get(item.id);
  const [base, setBase] = useState(cached?.base || item);
  const [values, setValues] = useState(() => cached?.values || itemValues(item));
  const [reviewTouched, setReviewTouched] = useState(cached?.reviewTouched || false);
  const [dirty, setDirty] = useState(cached?.dirty || false);
  const [error, setError] = useState(cached?.error || "");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!dirty) { setBase(item); setValues(itemValues(item)); setReviewTouched(false); } }, [item, dirty]);
  useEffect(() => { if (dirty) drafts.set(item.id, { base, values, reviewTouched, dirty, error }); else drafts.delete(item.id); }, [drafts, item.id, base, values, reviewTouched, dirty, error]);
  // Any judgement written here is a request for Claude, unless the state was chosen by hand.
  const change = (field) => (value) => {
    setValues((previous) => ({ ...previous, [field]: value, ...(field !== "review_state" && !reviewTouched ? { review_state: "feedback" } : {}) }));
    if (field === "review_state") setReviewTouched(true);
    setDirty(true); setSaved(false);
  };
  const reset = () => { setBase(item); setValues(itemValues(item)); setReviewTouched(false); setDirty(false); setError(""); setSaved(false); };
  const submit = async (event) => {
    event.preventDefault(); if (deleted) return; setError(""); setSaved(false);
    const before = itemValues(base);
    const patch = Object.fromEntries(Object.entries(values).filter(([field, value]) => value !== before[field]));
    try {
      const next = await save(base, patch);
      setBase(next); setValues(itemValues(next)); setReviewTouched(false); setDirty(false); setSaved(true);
    } catch (failure) { setError(failure.message || "저장하지 못했습니다. 피드백은 유지됩니다."); }
  };
  const discard = async () => {
    if (dirty || deleted || !window.confirm("이 문항을 삭제할까요? 목록에서 사라집니다.")) return;
    setError("");
    try { await remove(item); } catch (failure) { setError(failure.message || "삭제하지 못했습니다."); }
  };
  const externalChange = dirty && base.revision !== item.revision;
  const original = item.revised_from ? items.find((entry) => entry.id === item.revised_from) : null;
  const revisions = items.filter((entry) => entry.revised_from === item.id);
  return <section className="edu-panel edu-lab-detail" aria-label="문항 상세">
    <div className="edu-lab-item-meta"><span>문항 검토</span><ItemBadges item={item} /></div>
    <ItemPaper item={item} />
    {Array.isArray(item.based_on) && item.based_on.length > 0 && <div className="edu-lab-related"><span>참고한 노트</span>{item.based_on.map((id, index) => <button type="button" className="edu-text-button" key={`${id}:${index}`} onClick={() => onNote(id)}>{notes.find((note) => note.id === id)?.title || id}</button>)}</div>}
    {(item.revised_from || revisions.length > 0) && <div className="edu-lab-related">
      {item.revised_from && <><span>수정 전 문항</span>{original ? <button type="button" className="edu-text-button" onClick={() => onItem(original.id)}>{original.title || original.id}</button> : <span>삭제됨</span>}</>}
      {revisions.length > 0 && <><span>수정본</span>{revisions.map((entry) => <button type="button" className="edu-text-button" key={entry.id} onClick={() => onItem(entry.id)}>{entry.title || entry.id}</button>)}</>}
    </div>}
    <form className="edu-form edu-lab-feedback" onSubmit={submit}><h3>애쉬의 검토</h3>
      {externalChange && <div className="edu-lab-notice"><p>문항에 새 변경사항이 있습니다. 작성 중인 피드백은 유지됩니다.</p><details><summary>최신 피드백과 속성 확인</summary><p>{[reviewLabel(item.review_state), usageLabel(item.usage), item.difficulty].filter(Boolean).join(" · ")}</p><p className="edu-lab-feedback-current">{item.feedback || "피드백 없음"}</p></details></div>}
      <div className="edu-lab-attributes">
        <AttributeSelect label="난이도" value={values.difficulty} options={DIFFICULTIES} onChange={change("difficulty")} disabled={busy} empty="미정" />
        <AttributeSelect label="쓰임" value={values.usage} options={USAGES} onChange={change("usage")} disabled={busy} />
        <AttributeSelect label="상태" value={values.review_state} options={REVIEW_STATES} onChange={change("review_state")} disabled={busy} />
      </div>
      <label className="edu-field"><span>피드백</span><textarea rows={5} value={values.feedback} onChange={(event) => change("feedback")(event.target.value)} disabled={busy} placeholder="좋았던 점, 고칠 점, 다음 문항에 반영할 생각을 적어 주세요." /></label>
      <ErrorNotice>{error}</ErrorNotice><div className="edu-form-footer"><span className="edu-save-hint" role="status">{saved ? "저장했습니다. Claude가 다음 점검 때 확인합니다." : dirty ? "저장하면 상태가 피드백 작성으로 바뀌어 Claude에게 전달됩니다." : "피드백을 쓰거나 쓰임을 바꾸면 Claude에게 확인을 요청합니다."}</span><div className="edu-actions">{dirty && <button type="button" className="edu-button" disabled={busy || deleted} onClick={reset}>되돌리기</button>}{!dirty && item.usage === "discard" && <button type="button" className="edu-button edu-danger" disabled={busy || deleted} onClick={discard}>문항 삭제</button>}<button className="edu-button edu-primary" disabled={busy || !dirty || deleted}>{busy ? "저장 중…" : "저장"}</button></div></div>
    </form>
  </section>;
}
// One free-form document that Claude reads before anything else. The oldest
// principle row is the document; the app never adds a second one.
function PrincipleBoard({ principle, busy, save, create, drafts }) {
  const key = "principle-board";
  const cached = drafts.get(key);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(cached?.dirty || false);
  const [base, setBase] = useState(cached?.base || principle);
  const [body, setBody] = useState(cached?.body ?? (principle?.body || ""));
  const [dirty, setDirty] = useState(cached?.dirty || false);
  const [error, setError] = useState("");
  useEffect(() => { if (!dirty) { setBase(principle); setBody(principle?.body || ""); } }, [principle, dirty]);
  useEffect(() => { if (dirty) drafts.set(key, { base, body, dirty }); else drafts.delete(key); }, [drafts, key, base, body, dirty]);
  const cancel = () => { setBase(principle); setBody(principle?.body || ""); setDirty(false); setEditing(false); setError(""); };
  const submit = async (event) => {
    event.preventDefault(); setError("");
    try {
      const next = base ? await save(base, { body }) : await create({ kind: "principle", scope: "전 과목", title: "제작 원칙", body });
      setBase(next); setBody(next.body || ""); setDirty(false); setEditing(false);
    } catch (failure) { setError(failure.message || "저장하지 못했습니다. 입력 내용은 유지됩니다."); }
  };
  const externalChange = dirty && base && principle && base.revision !== principle.revision;
  return <section className="edu-panel edu-lab-principles" aria-label="제작 원칙">
    <div className="edu-panel-heading"><div><span className="edu-lab-eyebrow"><ListChecks size={14} /> Claude가 가장 먼저 읽는 글</span><h3>제작 원칙</h3></div><div className="edu-actions">{!editing && <button type="button" className="edu-button" disabled={busy} onClick={() => { setOpen(true); setEditing(true); }}>{principle ? "편집" : "작성"}</button>}<button type="button" className="edu-text-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기" : "펼치기"}</button></div></div>
    {open && <>{externalChange && <p className="edu-lab-notice">바깥에서 원칙이 변경되었습니다. 저장할 때 최신 내용과 비교합니다.</p>}<ErrorNotice>{error}</ErrorNotice>
      {editing ? <form className="edu-form" onSubmit={submit}><textarea className="edu-lab-principles-input" aria-label="제작 원칙" rows={14} value={body} onChange={(event) => { setBody(event.target.value); setDirty(true); }} disabled={busy} placeholder="문항을 만들 때 지켜야 할 것을 자유롭게 적어 주세요." /><div className="edu-form-footer"><span className="edu-save-hint">{dirty ? "저장하지 않은 변경사항이 있습니다." : "마크다운과 $…$ 수식을 쓸 수 있습니다."}</span><div className="edu-actions"><button type="button" className="edu-button" disabled={busy} onClick={cancel}>취소</button><button className="edu-button edu-primary" disabled={busy || !dirty || !body.trim()}>{busy ? "저장 중…" : "저장"}</button></div></div></form>
        : principle?.body ? <div className="edu-lab-principles-body"><LabMarkdown>{principle.body}</LabMarkdown></div> : <Empty>아직 제작 원칙이 없습니다. Claude가 문항을 만들 때 가장 먼저 읽을 원칙을 적어 주세요.</Empty>}</>}
  </section>;
}
function PrintPreview({ items, onClose }) {
  const [answers, setAnswers] = useState(false);
  const [title, setTitle] = useState("과학 문항 연구소");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);
  const closeButton = useRef(null);
  const operation = useRef(0);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const nodes = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", keydown);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("edu-lab-print-preview-open");
    return () => { operation.current += 1; document.removeEventListener("keydown", keydown); document.body.style.overflow = oldOverflow; document.body.classList.remove("edu-lab-print-preview-open"); previous?.focus(); };
  }, [onClose]);
  const print = async () => {
    const token = ++operation.current;
    setBusy(true); setError("");
    try {
      await document.fonts?.ready;
      await Promise.all([...ref.current.querySelectorAll("img")].map(async (img) => {
        if (img.decode) await img.decode();
      }));
      if (token === operation.current && ref.current?.isConnected) window.print();
    } catch { setError("그림을 불러오지 못했습니다. 문항의 SVG 그림을 확인해 주세요."); }
    finally { if (token === operation.current) setBusy(false); }
  };
  return createPortal(<div ref={ref} className="edu-lab-print-overlay" role="dialog" aria-modal="true" aria-label="시험지 인쇄 미리보기">
    <div className="edu-lab-print-toolbar"><button ref={closeButton} type="button" onClick={onClose}><X size={18} />닫기</button><label>시험지 제목<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="edu-lab-print-check"><input type="checkbox" checked={answers} onChange={(event) => setAnswers(event.target.checked)} />정답·해설 포함</label><button type="button" onClick={print} disabled={busy}><Printer size={18} />{busy ? "인쇄 준비 중…" : "인쇄 / PDF 저장"}</button></div>
    {error && <p className="edu-lab-print-error" role="alert">{error}</p>}
    <div className="edu-lab-print-sheet"><header><h1>{title || "문항 연구소"}</h1><div><span>총 {items.length}문항</span><span>이름: ____________________</span></div></header>{items.map((item, index) => <ItemPaper key={item.id} item={item} number={index + 1} showAnswers={answers} collapsible={false} />)}</div>
  </div>, document.body);
}
export function LabWorkspace({ lab }) {
  const { notes: allNotes, items, loading, loaded, error, busy, refresh, updateNote, updateItem, createNote, removeItem } = lab;
  const notes = useMemo(() => allNotes.filter((note) => !isPrinciple(note)), [allNotes]);
  const principle = useMemo(() => sortPrinciples(allNotes)[0] || null, [allNotes]);
  const [tab, setTab] = useState("items");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [scope, setScope] = useState("");
  const [subject, setSubject] = useState("");
  const [unit, setUnit] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [review, setReview] = useState("");
  const [usage, setUsage] = useState("");
  const [noteId, setNoteId] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [printing, setPrinting] = useState(false);
  const closePrint = useCallback(() => setPrinting(false), []);
  const [relationError, setRelationError] = useState("");
  const rememberedNote = useRef(null);
  const rememberedItem = useRef(null);
  const drafts = useRef({ notes: new Map(), items: new Map() });
  useEffect(() => {
    const preventDraftLoss = (event) => {
      if (!drafts.current.notes.size && !drafts.current.items.size) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventDraftLoss);
    return () => window.removeEventListener("beforeunload", preventDraftLoss);
  }, []);
  const visibleNotes = useMemo(() => filterNotes(notes, { query, kind, scope }), [notes, query, kind, scope]);
  const groups = useMemo(() => groupNotes(visibleNotes), [visibleNotes]);
  const visibleItems = useMemo(() => filterItems(items, { query, subject, unit, difficulty, review, usage }), [items, query, subject, unit, difficulty, review, usage]);
  const printItems = useMemo(() => selectedItems(items, selected), [items, selected]);
  const liveNote = notes.find((note) => note.id === noteId);
  const liveItem = items.find((item) => item.id === itemId);
  // Keep an open editor available for copying its draft if an external writer
  // soft-deletes the row during refresh. It can no longer be saved or printed.
  if (liveNote) rememberedNote.current = liveNote;
  if (liveItem) rememberedItem.current = liveItem;
  const activeNote = liveNote || (rememberedNote.current?.id === noteId ? rememberedNote.current : null);
  const activeItem = liveItem || (rememberedItem.current?.id === itemId ? rememberedItem.current : null);
  const toggleItem = (id) => setSelected((ids) => ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]);
  const openRelated = (id) => {
    setRelationError("");
    if (principle?.id === id) document.querySelector(".edu-lab-principles")?.scrollIntoView({ behavior: "smooth" });
    else if (notes.some((note) => note.id === id)) { setTab("notes"); setNoteId(id); }
    else if (items.some((item) => item.id === id)) { setTab("items"); setItemId(id); }
    else setRelationError("관련 기록이 없거나 삭제되었습니다.");
  };
  const selectVisible = () => setSelected((ids) => [...new Set([...ids, ...visibleItems.map((item) => item.id)])]);
  return <div className="edu-lab">
    <div className="edu-section-heading"><div><h2>문항 연구소</h2><p>생각을 쌓고, 문항을 다듬고, 수업으로 가져갑니다.</p></div><button type="button" className="edu-button" onClick={() => refresh().catch(() => {})} disabled={loading || busy}><RefreshCw size={16} className={loading ? "edu-lab-spinning" : ""} />{loading ? "불러오는 중…" : "새로고침"}</button></div>
    {loaded && <PrincipleBoard principle={principle} busy={busy} save={updateNote} create={createNote} drafts={drafts.current.notes} />}
    <div className="edu-lab-tabs" aria-label="연구소 보기"><button type="button" className={tab === "items" ? "active" : ""} aria-pressed={tab === "items"} onClick={() => setTab("items")}><FileText size={17} />문항 <span>{items.length}</span></button><button type="button" className={tab === "notes" ? "active" : ""} aria-pressed={tab === "notes"} onClick={() => setTab("notes")}><BookOpen size={17} />노트 <span>{notes.length}</span></button></div>
    <ErrorNotice>{error || relationError}</ErrorNotice>
    <div className="edu-lab-filters"><SearchBox value={query} onChange={setQuery} />{tab === "notes" ? <><SelectFilter label="종류" value={kind} options={distinct(notes, "kind")} labels={Object.fromEntries(distinct(notes, "kind").map((entry) => [entry, kindLabel(entry)]))} onChange={setKind} /><SelectFilter label="적용 범위" value={scope} options={distinct(notes, "scope")} onChange={setScope} /></> : <><SelectFilter label="과목" value={subject} options={distinct(items, "subject")} onChange={(value) => { setSubject(value); setUnit(""); }} /><SelectFilter label="단원" value={unit} options={distinct(items.filter((item) => !subject || item.subject === subject), "unit")} onChange={setUnit} /><SelectFilter label="난이도" value={difficulty} options={Object.keys(DIFFICULTIES)} onChange={setDifficulty} /><SelectFilter label="상태" value={review} options={[...Object.keys(REVIEW_STATES), "complete"]} labels={{ ...REVIEW_STATES, complete: "완성 (적용 + 활용)" }} onChange={setReview} /><SelectFilter label="쓰임" value={usage} options={Object.keys(USAGES)} labels={USAGES} onChange={setUsage} /></>}</div>
    <p className="edu-lab-refresh-hint">Claude가 기록한 내용은 새로고침하거나 이 화면으로 돌아오면 불러옵니다.</p>
    {!loaded && loading ? <Empty>노트와 문항을 불러오는 중입니다…</Empty> : <>
      {tab === "items" && <div className="edu-lab-selection"><span>인쇄할 문항 {printItems.length}개 선택</span><div className="edu-actions"><button type="button" className="edu-text-button" onClick={selectVisible} disabled={!visibleItems.length}>현재 목록 모두 선택</button><button type="button" className="edu-text-button" onClick={() => setSelected([])} disabled={!selected.length}>선택 해제</button><button type="button" className="edu-button edu-primary" disabled={!printItems.length} onClick={() => setPrinting(true)}><Printer size={16} />시험지 인쇄</button></div></div>}
      <div className="edu-lab-layout"><aside className="edu-panel edu-lab-list" aria-label={tab === "items" ? "문항 목록" : "노트 목록"}>
        {tab === "notes" ? groups.length ? groups.map((group) => <section className="edu-lab-note-group" key={group.kind}><h3>{kindLabel(group.kind)}</h3>{group.scopes.map((entry) => <div key={entry.scope}><h4>{entry.scope || "범위 미지정"}</h4>{entry.rows.map((note) => <button type="button" key={note.id} className={`edu-lab-list-entry${note.id === noteId ? " active" : ""}`} aria-pressed={note.id === noteId} onClick={() => setNoteId(note.id)}><strong>{note.title || "제목 없는 노트"}</strong><span>{note.source || (Array.isArray(note.tags) ? note.tags.join(" · ") : "") || "본문 보기"}</span></button>)}</div>)}</section>) : <Empty>{notes.length ? "검색 결과가 없습니다." : "아직 노트가 없습니다. Claude가 아이디어와 풀이법을 기록하면 여기에 나타납니다."}</Empty> : visibleItems.length ? visibleItems.map((item) => <div className={`edu-lab-item-entry${item.id === itemId ? " active" : ""}`} key={item.id}><input type="checkbox" aria-label={`${item.title || "제목 없는 문항"} 인쇄 선택`} checked={selected.includes(item.id)} onChange={() => toggleItem(item.id)} /><button type="button" className="edu-lab-list-entry" aria-pressed={item.id === itemId} onClick={() => setItemId(item.id)}><span className="edu-lab-entry-top"><strong>{item.title || "제목 없는 문항"}</strong><ItemBadges item={item} /></span><span>{[item.subject, item.unit, item.difficulty].filter(Boolean).join(" · ") || "과목 · 단원 미지정"}</span></button></div>) : <Empty>{items.length ? "검색 결과가 없습니다." : "아직 문항이 없습니다. Claude가 만든 문항을 여기에서 검토하고 인쇄할 수 있습니다."}</Empty>}
      </aside><div className="edu-lab-detail-area">
        {((tab === "notes" && activeNote && !liveNote) || (tab === "items" && activeItem && !liveItem)) && <p className="edu-lab-notice" role="alert">다른 곳에서 삭제한 기록입니다. 작성 중인 내용을 복사할 수 있도록 편집창을 유지합니다. 저장과 인쇄는 할 수 없습니다.</p>}
        {tab === "notes" ? activeNote
          ? <NoteDetail key={activeNote.id} note={activeNote} busy={busy} save={updateNote} onRelated={openRelated} deleted={!liveNote} drafts={drafts.current.notes} />
          : <section className="edu-panel"><Empty>노트를 선택하면 본문과 관련 기록을 볼 수 있습니다.</Empty></section>
          : activeItem
            ? <ItemDetail key={activeItem.id} item={activeItem} items={items} notes={allNotes} busy={busy} save={updateItem} remove={(item) => removeItem(item).then(() => { setItemId(null); setSelected((ids) => ids.filter((id) => id !== item.id)); })} onNote={openRelated} onItem={openRelated} deleted={!liveItem} drafts={drafts.current.items} />
            : <section className="edu-panel"><Empty>문항을 선택해 문제를 보고 피드백을 남겨 주세요.</Empty></section>}
      </div></div>
    </>}
    {printing && <PrintPreview items={printItems} onClose={closePrint} />}
  </div>;
}
export default function EduLab() {
  const lab = useLab();
  if (!lab.connected) return <section className="edu-panel edu-lab"><Empty>{lab.loading ? "계정 연결을 확인하는 중입니다…" : "문항 연구소는 로그인한 계정에 보관됩니다. Settings에서 Google 계정을 연결해 주세요."}</Empty></section>;
  return <LabWorkspace key={lab.scope} lab={lab} />;
}
