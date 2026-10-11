import React, { useMemo, useState } from "react";
import { BookOpen, Library, Plus, Search, Play, RefreshCw, Download, Star } from "lucide-react";
import { useLingo } from "../../../lingo/LingoProvider.jsx";
import { JLPT_LEVELS, setStages } from "../../../lingo/model.js";
import { collectWordEntries, filterWordEntries, UNCATEGORIZED } from "../../../lingo/filter.js";
import { downloadJson } from "../../../lingo/importFile.js";
import ImportPanel from "../../../lingo/ImportPanel.jsx";
import Flashcards from "../../../lingo/Flashcards.jsx";
import { stageDeckChanges } from "../../../lingo/sessionStages.js";
import { favoriteDeckChanges } from "../../../lingo/favorites.js";
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

export default function Japanese() {
  const { decks, ready, status, recoveryCount, changeMany, store } = useLingo();
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
  const deck = decks.find((item) => item.id === deckId);
  const entries = useMemo(() => collectWordEntries(decks), [decks]);
  const favoriteEntries = useMemo(() => entries.filter((entry) => entry.word.favorite), [entries]);
  const scoped = useMemo(() => favoriteScope ? favoriteEntries : entries.filter((entry) => !deckId || entry.deckId === deckId), [entries, favoriteEntries, deckId, favoriteScope]);
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
  if (sessionWords) return <div className="lingo-workspace"><Flashcards words={sessionWords} onSaveStages={(changes) => changeMany(stageDeckChanges(changes))} onExit={() => { setSessionWords(null); resetSelection(); }} /></div>;
  return <div className="lingo-workspace">
    <header className="lingo-heading lingo-row"><div><p className="lingo-eyebrow">JAPANESE VOCABULARY</p><h1>조금씩, 더 익숙하게.</h1><p className="lingo-muted">내 단어를 모으고, 오늘 공부할 단어를 골라보세요.</p></div>
      <button className="lingo-primary" disabled={!ready} onClick={() => setImporting("")}><Plus size={18} />단어 가져오기</button></header>
    <div className="lingo-sync lingo-row"><span role="status">{status}</span><div className="lingo-actions">
      {recoveryCount > 0 && <button disabled={busy} onClick={() => action(async () => downloadJson("lingo-recovery.json", await store.exportRecovery()))}><Download size={14} />복구 사본 {recoveryCount}개</button>}
      <button aria-label="단어장 다시 동기화" disabled={busy || !store} onClick={() => action(async () => { await store.load(); await store.sync(); })}><RefreshCw size={14} />동기화</button></div></div>
    {error && <p className="lingo-error" role="alert">{error}</p>}
    {importing !== null && <ImportPanel key={importing} initialDeckId={importing} onClose={() => setImporting(null)} onImported={(id) => { openDeck(id); setImporting(null); }} />}
    {!ready ? <p>단어장을 불러오고 있습니다.</p> : !decks.length ? <section className="lingo-empty lingo-panel"><BookOpen size={44} strokeWidth={1.3} />
      <h2>첫 일본어 단어장을 만들어볼까요?</h2><p className="lingo-muted">엑셀이나 구글 시트에 정리한 단어가<br />나만의 플래시카드가 됩니다.</p>
      <button className="lingo-primary" onClick={() => setImporting("")}><Plus size={17} />첫 단어장 가져오기</button></section> : <div className="lingo-library">
      <aside className="lingo-decks" aria-label="단어장 목록"><div className="lingo-row"><h2>내 단어장</h2><span>{decks.length}</span></div>
        <button aria-current={!deckId && !favoriteScope ? "true" : undefined} onClick={() => openDeck("")}><Library size={18} /><span><strong>전체 단어장</strong><small>{entries.length}개 단어</small></span></button>
        <button className="lingo-favorites-deck" aria-current={favoriteScope ? "true" : undefined} onClick={openFavorites}><Star size={18} /><span><strong>즐겨찾기</strong><small>{favoriteEntries.length}개 단어</small></span></button>
        {decks.map((item) => <button key={item.id} aria-current={!favoriteScope && item.id === deckId ? "true" : undefined} onClick={() => openDeck(item.id)}><BookOpen size={18} /><span><strong>{item.name}</strong><small>{item.words.length}개 단어</small></span></button>)}
      </aside>
      <section className="lingo-words lingo-panel" aria-label="단어 관리"><div className="lingo-row lingo-words-heading"><div><h2>{favoriteScope ? "즐겨찾기" : deck?.name || "전체 단어장"}</h2><p className="lingo-muted">{scoped.length}개 단어 · 단계는 직접 지정해요</p></div>
        {deck && <button onClick={() => setImporting(deck.id)}><RefreshCw size={15} />다시 가져오기</button>}</div>
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
            <button className="lingo-primary" disabled={!selectedEntries.length || busy} onClick={() => setSessionWords(selectedEntries.map(({ key, deckId: sourceId, word }) => ({ ...word, id: key, deckId: sourceId, sourceWordId: word.id })))}><Play size={15} />학습 시작</button></div>
        </div>
        <div className="lingo-word-results"><div className="lingo-word-list">{visible.slice((currentPage - 1) * 50, currentPage * 50).map((entry) => { const { key, word, deckName } = entry; const wordLabel = `${word.japanese}${!deckId ? ` (${deckName})` : ""}`; return <div className="lingo-word-row" key={key}>
          <div className="lingo-word-controls"><label className="lingo-word-check"><input type="checkbox" aria-label={`${wordLabel} 선택`} checked={selected.has(key)} disabled={busy} onChange={() => setSelected((current) => {
            const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next;
          })} /></label><button className="lingo-favorite-toggle" aria-label={`${wordLabel} 즐겨찾기 ${word.favorite ? "해제" : "추가"}`} aria-pressed={word.favorite} title={word.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"} disabled={busy} onClick={() => favorite([entry], !word.favorite)}><Star size={18} fill={word.favorite ? "currentColor" : "none"} /></button></div>
          <div className="lingo-word-japanese"><strong lang="ja">{word.japanese}</strong>{word.reading && <small lang="ja">{word.reading}</small>}{!deckId && <small className="lingo-word-source"><BookOpen size={12} />{deckName}</small>}</div>
          <div className="lingo-word-meaning"><span>{word.meaning}</span><div className="lingo-word-tags">{word.partsOfSpeech.map((part) => <span key={`part:${part}`}>{part}</span>)}{word.jlpt && <span className="lingo-level-tag">{word.jlpt}</span>}{word.topics.map((topic) => <span key={`topic:${topic}`} className="lingo-topic-tag">{topic}</span>)}</div>{word.example && <small lang="ja">{word.example}</small>}</div>
          <select aria-label={`${word.japanese}${!deckId ? ` (${deckName})` : ""} 단계`} value={word.stage} disabled={busy} onChange={(e) => assign([entry], Number(e.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단계</option>)}</select>
        </div>; })}</div>
        {!visible.length && <p className="lingo-empty-result" role="status">{favoriteScope && !favoriteEntries.length ? "별표를 누른 단어가 여기에 모여요." : "조건에 맞는 단어가 없어요."}</p>}
        {pages > 1 && <nav className="lingo-pagination" aria-label="단어 목록 페이지"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
        </div>
      </section>
    </div>}
  </div>;
}
