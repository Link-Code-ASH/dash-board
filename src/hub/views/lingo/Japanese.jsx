import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, BookPlus, Library, Plus, Search, Play, RefreshCw, Download, Star, Pencil, Trash2, Check, X, FolderMinus } from "lucide-react";
import { useLingo } from "../../../lingo/LingoProvider.jsx";
import { JLPT_LEVELS, setStages } from "../../../lingo/model.js";
import { collectWordEntries, filterWordEntries, UNCATEGORIZED } from "../../../lingo/filter.js";
import { downloadJson } from "../../../lingo/importFile.js";
import ImportPanel from "../../../lingo/ImportPanel.jsx";
import Flashcards from "../../../lingo/Flashcards.jsx";
import { stageDeckChanges } from "../../../lingo/sessionStages.js";
import { favoriteDeckChanges } from "../../../lingo/favorites.js";
import { POOL_ID, isBook, newBook, addToBook, removeFromBook, renameBook, deleteBook } from "../../../lingo/books.js";
import "../../../lingo/lingo.css";
import "../../../lingo/category-filters.css";

const emptyCategories = () => ({ partsOfSpeech: [], jlpt: [], topics: [] });

function CategoryFilter({ name, field, entries, selected, onChange }) {
  const counts = new Map();
  entries.forEach(({ word }) => {
    const values = field === "jlpt" ? (word.jlpt ? [word.jlpt] : []) : word[field];
    (values.length ? values : [UNCATEGORIZED]).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  });
  const values = field === "jlpt" ? JLPT_LEVELS : [...counts.keys()].filter((value) => value !== UNCATEGORIZED).sort((a, b) => a.localeCompare(b, "ko"));
  return <fieldset className="lingo-category-group" aria-label={name}><legend>{name}{selected.length > 0 && <span>{selected.length}개 선택</span>}</legend>
    <div className="lingo-category-options">{[...values, UNCATEGORIZED].map((value) => <label key={value === UNCATEGORIZED ? "unclassified" : `tag:${value}`} className={selected.includes(value) ? "is-selected" : ""}>
      <input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])} />
      <span>{value === UNCATEGORIZED ? "미분류" : value}</span><small>{counts.get(value) || 0}</small>
    </label>)}</div>
  </fieldset>;
}

// Small inline form for a word book name (new book or rename).
function NameForm({ initial = "", label, onSubmit, onCancel, disabled }) {
  const [name, setName] = useState(initial);
  return <form className="lingo-book-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name); }}>
    <input autoFocus aria-label={label} placeholder="단어장 이름" maxLength={100} value={name} disabled={disabled} onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} />
    <button type="submit" aria-label="확인" disabled={disabled || !name.trim()}><Check size={15} /></button>
    <button type="button" aria-label="취소" onClick={onCancel}><X size={15} /></button>
  </form>;
}

// "단어장에 담기": a small card of the user's books opened from the selection bar.
function BookPicker({ books, count, disabled, onPick, onCreate }) {
  const [open, setOpen] = useState(false), [creating, setCreating] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!root.current?.contains(e.target)) { setOpen(false); setCreating(false); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const done = (run) => { setOpen(false); setCreating(false); run(); };
  return <div className="lingo-book-picker" ref={root}>
    <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}><BookPlus size={15} />단어장에 담기</button>
    {open && <div className="lingo-book-pop" role="menu">
      <p>{count}개 단어를 담을 단어장</p>
      {books.map((book) => <button key={book.id} type="button" role="menuitem" onClick={() => done(() => onPick(book.id))}><BookOpen size={15} /><span>{book.name}</span><small>{book.items.length}</small></button>)}
      {creating ? <NameForm label="새 단어장 이름" onSubmit={(name) => done(() => onCreate(name))} onCancel={() => setCreating(false)} />
        : <button type="button" className="lingo-book-new" onClick={() => setCreating(true)}><Plus size={15} />새 단어장 만들어 담기</button>}
    </div>}
  </div>;
}

export default function Japanese() {
  const { decks, ready, status, recoveryCount, change, changeMany, store } = useLingo();
  const [deckId, setDeckId] = useState("");
  const [favoriteScope, setFavoriteScope] = useState(false);
  const [stage, setStage] = useState(0);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState(emptyCategories);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(null);
  const [sessionWords, setSessionWords] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [naming, setNaming] = useState(null);
  const deck = decks.find((item) => item.id === deckId);
  const inBook = isBook(deck) && !deck.deleted;
  const books = decks.filter((item) => isBook(item) && !item.deleted);
  // Decks made by earlier imports keep showing as groups of their words.
  const oldDecks = decks.filter((item) => !isBook(item) && item.id !== POOL_ID && item.words.length);
  const entries = useMemo(() => collectWordEntries(decks), [decks]);
  const bookKeys = useMemo(() => new Set(inBook ? deck.items.map((item) => item.id) : []), [deck, inBook]);
  const favoriteEntries = useMemo(() => entries.filter((entry) => entry.word.favorite), [entries]);
  const scoped = useMemo(() => favoriteScope ? favoriteEntries : entries.filter((entry) => !deckId || (inBook ? bookKeys.has(entry.key) : entry.deckId === deckId)), [entries, favoriteEntries, deckId, favoriteScope, inBook, bookKeys]);
  const visible = useMemo(() => filterWordEntries(scoped, { ...categories, stages: stage ? [stage] : [], query: search }), [scoped, categories, search, stage]);
  const selectedEntries = visible.filter((entry) => selected.has(entry.key));
  const allChecked = visible.length > 0 && visible.every((entry) => selected.has(entry.key));
  const allFavorites = visible.length > 0 && visible.every((entry) => entry.word.favorite);
  const pages = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pages);
  const action = async (run) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await run(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const resetSelection = () => { setSelected(new Set()); setPage(1); };
  const openDeck = (id) => {
    setDeckId(id); setFavoriteScope(false); resetSelection(); setStage(0); setSearch(""); setCategories(emptyCategories());
  };
  const openFavorites = () => {
    openDeck(""); setFavoriteScope(true);
  };
  const favorite = (items, value) => action(async () => {
    await changeMany(favoriteDeckChanges(items, value));
    if (favoriteScope) resetSelection();
  });
  const assign = (items, next) => action(() => {
    const groups = new Map();
    items.forEach(({ deckId: sourceId, word }) => {
      if (!groups.has(sourceId)) groups.set(sourceId, []);
      groups.get(sourceId).push(word.id);
    });
    return changeMany([...groups].map(([id, ids]) => ({ id, transform: (current) => setStages(current, ids, next) })));
  });
  const createBook = (name, keys = []) => action(async () => {
    const book = newBook(name);
    await change(book.id, () => addToBook(book, keys));
    setNaming(null);
    if (!keys.length) openDeck(book.id); else setSelected(new Set());
  });
  const putInBook = (id, items) => action(async () => { await change(id, (current) => addToBook(current, items.map((entry) => entry.key))); setSelected(new Set()); });
  const takeFromBook = (items) => action(async () => { await change(deck.id, (current) => removeFromBook(current, items.map((entry) => entry.key))); resetSelection(); });
  const rename = (name) => action(async () => { await change(deck.id, (current) => renameBook(current, name)); setNaming(null); });
  const removeBook = () => {
    if (!window.confirm(`'${deck.name}' 단어장을 지울까요? 단어는 전체 단어에 그대로 남아요.`)) return;
    action(async () => { await change(deck.id, deleteBook); openDeck(""); });
  };
  const showSource = (entry) => (!deckId || inBook) && entry.deckId !== POOL_ID;
  if (sessionWords) return <div className="lingo-workspace"><Flashcards words={sessionWords} onSaveStages={(changes) => changeMany(stageDeckChanges(changes))} onExit={() => { setSessionWords(null); resetSelection(); }} /></div>;
  return <div className="lingo-workspace">
    <header className="lingo-heading lingo-row"><div><p className="lingo-eyebrow">JAPANESE VOCABULARY</p><h1>조금씩, 더 익숙하게.</h1><p className="lingo-muted">내 단어를 모으고, 오늘 공부할 단어를 골라보세요.</p></div>
      <button className="lingo-primary" disabled={!ready} onClick={() => setImporting("")}><Plus size={18} />단어 가져오기</button></header>
    <div className="lingo-sync lingo-row"><span role="status">{status}</span><div className="lingo-actions">
      {recoveryCount > 0 && <button disabled={busy} onClick={() => action(async () => downloadJson("lingo-recovery.json", await store.exportRecovery()))}><Download size={14} />복구 사본 {recoveryCount}개</button>}
      <button aria-label="단어장 다시 동기화" disabled={busy || !store} onClick={() => action(async () => { await store.load(); await store.sync(); })}><RefreshCw size={14} />동기화</button></div></div>
    {error && <p className="lingo-error" role="alert">{error}</p>}
    {importing !== null && <ImportPanel key={importing} initialDeckId={importing} onClose={() => setImporting(null)} onImported={() => { openDeck(""); setImporting(null); }} />}
    {!ready ? <p>단어장을 불러오고 있습니다.</p> : !entries.length && !books.length ? <section className="lingo-empty lingo-panel"><BookOpen size={44} strokeWidth={1.3} />
      <h2>첫 일본어 단어를 가져와 볼까요?</h2><p className="lingo-muted">엑셀이나 구글 시트에 정리한 단어가 전체 단어에 모여요.<br />단어장은 그 단어들 중에서 골라 직접 만들어요.</p>
      <button className="lingo-primary" onClick={() => setImporting("")}><Plus size={17} />단어 가져오기</button></section> : <div className="lingo-library">
      <aside className="lingo-decks" aria-label="단어장 목록">
        <button aria-current={!deckId && !favoriteScope ? "true" : undefined} onClick={() => openDeck("")}><Library size={18} /><span><strong>전체 단어</strong><small>{entries.length}개 단어</small></span></button>
        <button className="lingo-favorites-deck" aria-current={favoriteScope ? "true" : undefined} onClick={openFavorites}><Star size={18} /><span><strong>즐겨찾기</strong><small>{favoriteEntries.length}개 단어</small></span></button>
        <div className="lingo-row lingo-books-heading"><h2>내 단어장</h2><span>{books.length}</span></div>
        {books.map((item) => <button key={item.id} aria-current={!favoriteScope && item.id === deckId ? "true" : undefined} onClick={() => openDeck(item.id)}><BookOpen size={18} /><span><strong>{item.name}</strong><small>{entries.filter((entry) => item.items.some((ref) => ref.id === entry.key)).length}개 단어</small></span></button>)}
        {oldDecks.map((item) => <button key={item.id} aria-current={!favoriteScope && item.id === deckId ? "true" : undefined} onClick={() => openDeck(item.id)}><BookOpen size={18} /><span><strong>{item.name}</strong><small>{item.words.length}개 단어 · 예전 가져오기</small></span></button>)}
        {naming === "new" ? <NameForm label="새 단어장 이름" disabled={busy} onSubmit={(name) => createBook(name)} onCancel={() => setNaming(null)} />
          : <button className="lingo-book-add" onClick={() => setNaming("new")}><Plus size={16} /><span><strong>새 단어장</strong></span></button>}
        {!books.length && naming !== "new" && <p className="lingo-book-hint">단어를 고른 뒤 <b>단어장에 담기</b>로 모아도 돼요.</p>}
      </aside>
      <section className="lingo-words lingo-panel" aria-label="단어 관리"><div className="lingo-row lingo-words-heading"><div>{inBook && naming === "rename" ? <NameForm key={deck.id} initial={deck.name} label="단어장 이름 바꾸기" disabled={busy} onSubmit={rename} onCancel={() => setNaming(null)} />
          : <h2>{favoriteScope ? "즐겨찾기" : deck?.name || "전체 단어"}</h2>}<p className="lingo-muted">{scoped.length}개 단어 · 단계는 직접 지정해요</p></div>
        {inBook && naming !== "rename" && <div className="lingo-actions"><button onClick={() => setNaming("rename")}><Pencil size={14} />이름 바꾸기</button><button disabled={busy} onClick={removeBook}><Trash2 size={14} />단어장 지우기</button></div>}</div>
        {inBook && !scoped.length && <p className="lingo-book-hint">전체 단어에서 단어를 고른 뒤 <b>단어장에 담기</b>를 누르면 여기에 모여요.</p>}
        <div className="lingo-stages" aria-label="단계 필터">{[0, 1, 2, 3, 4, 5].map((value) => <button key={value} aria-pressed={stage === value} onClick={() => { setStage(value); resetSelection(); }}>
          <span>{value ? `${value}단계` : "전체"}</span><strong>{value ? scoped.filter(({ word }) => word.stage === value).length : scoped.length}</strong></button>)}</div>
        <div className="lingo-category-filters" aria-label="학습 카테고리 필터">
          <div className="lingo-filter-heading"><span>이번에 공부할 단어</span><button disabled={!search && !stage && !Object.values(categories).some((items) => items.length)} onClick={() => { setSearch(""); setStage(0); setCategories(emptyCategories()); resetSelection(); }}>조건 초기화</button></div>
          <div className="lingo-filter-groups">{[["품사", "partsOfSpeech"], ["JLPT", "jlpt"], ["특성", "topics"]].map(([name, field]) => <CategoryFilter key={field} name={name} field={field} entries={scoped} selected={categories[field]} onChange={(values) => { setCategories((current) => ({ ...current, [field]: values })); resetSelection(); }} />)}</div>
          <p className="lingo-filter-help">같은 그룹에서는 하나라도, 품사·JLPT·특성 사이에서는 모두 일치하는 단어를 찾아요.</p>
        </div>
        <label className="lingo-search"><Search size={17} /><input aria-label="단어 검색" placeholder="일본어, 읽는 법, 뜻 검색" value={search} onChange={(e) => { setSearch(e.target.value); resetSelection(); }} /></label>
        <div className="lingo-result-toolbar"><span aria-live="polite">검색 결과 {visible.length}개</span><button className="lingo-bulk-favorite" disabled={busy || !visible.length} aria-pressed={allFavorites} onClick={() => favorite(visible, !allFavorites)}><Star size={16} fill={allFavorites ? "currentColor" : "none"} />{allFavorites ? "전체 즐겨찾기 해제" : "결과 전체 즐겨찾기"}</button></div>
        <div className="lingo-selection"><label><input type="checkbox" checked={allChecked} disabled={busy || !visible.length} onChange={() => setSelected((current) => {
          const next = new Set(current); visible.forEach((entry) => allChecked ? next.delete(entry.key) : next.add(entry.key)); return next;
        })} />검색 결과 전체 선택 ({visible.length})</label>
          <div className="lingo-actions"><span>{selectedEntries.length}개 선택</span>
            {selectedEntries.length > 0 && <button onClick={() => setSelected(new Set())}>선택 해제</button>}
            <select aria-label="선택한 단어 단계 지정" value="" disabled={busy || !selectedEntries.length} onChange={(e) => assign(selectedEntries, Number(e.target.value))}>
              <option value="">단계 지정</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단계</option>)}</select>
            {inBook ? <button disabled={busy || !selectedEntries.length} onClick={() => takeFromBook(selectedEntries)}><FolderMinus size={15} />단어장에서 빼기</button>
              : <BookPicker books={books} count={selectedEntries.length} disabled={busy || !selectedEntries.length} onPick={(id) => putInBook(id, selectedEntries)} onCreate={(name) => createBook(name, selectedEntries.map((entry) => entry.key))} />}
            <button className="lingo-primary" disabled={!selectedEntries.length || busy} onClick={() => setSessionWords(selectedEntries.map(({ key, deckId: sourceId, word }) => ({ ...word, id: key, deckId: sourceId, sourceWordId: word.id })))}><Play size={15} />학습 시작</button></div>
        </div>
        <div className="lingo-word-results"><div className="lingo-word-list">{visible.slice((currentPage - 1) * 50, currentPage * 50).map((entry) => { const { key, word, deckName } = entry; const wordLabel = `${word.japanese}${showSource(entry) ? ` (${deckName})` : ""}`; return <div className="lingo-word-row" key={key}>
          <div className="lingo-word-controls"><label className="lingo-word-check"><input type="checkbox" aria-label={`${wordLabel} 선택`} checked={selected.has(key)} disabled={busy} onChange={() => setSelected((current) => {
            const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next;
          })} /></label><button className="lingo-favorite-toggle" aria-label={`${wordLabel} 즐겨찾기 ${word.favorite ? "해제" : "추가"}`} aria-pressed={word.favorite} title={word.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"} disabled={busy} onClick={() => favorite([entry], !word.favorite)}><Star size={18} fill={word.favorite ? "currentColor" : "none"} /></button></div>
          <div className="lingo-word-japanese"><strong lang="ja">{word.japanese}</strong>{word.reading && <small lang="ja">{word.reading}</small>}{showSource(entry) && <small className="lingo-word-source"><BookOpen size={12} />{deckName}</small>}</div>
          <div className="lingo-word-meaning"><span>{word.meaning}</span><div className="lingo-word-tags">{word.partsOfSpeech.map((part) => <span key={`part:${part}`}>{part}</span>)}{word.jlpt && <span className="lingo-level-tag">{word.jlpt}</span>}{word.topics.map((topic) => <span key={`topic:${topic}`} className="lingo-topic-tag">{topic}</span>)}</div>{word.example && <small lang="ja">{word.example}</small>}</div>
          <select aria-label={`${wordLabel} 단계`} value={word.stage} disabled={busy} onChange={(e) => assign([entry], Number(e.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단계</option>)}</select>
        </div>; })}</div>
        {!visible.length && <p className="lingo-empty-result" role="status">{favoriteScope && !favoriteEntries.length ? "별표를 누른 단어가 여기에 모여요." : "조건에 맞는 단어가 없어요."}</p>}
        {pages > 1 && <nav className="lingo-pagination" aria-label="단어 목록 페이지"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
        </div>
      </section>
    </div>}
  </div>;
}
