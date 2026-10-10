import React, { useMemo, useState } from "react";
import { BookOpen, Plus, Search, Play, RefreshCw, Download } from "lucide-react";
import { useLingo } from "../../../lingo/LingoProvider.jsx";
import { setStages } from "../../../lingo/model.js";
import { downloadJson } from "../../../lingo/importFile.js";
import ImportPanel from "../../../lingo/ImportPanel.jsx";
import Flashcards from "../../../lingo/Flashcards.jsx";
import "../../../lingo/lingo.css";

export default function Japanese() {
  const { decks, ready, status, recoveryCount, change, store } = useLingo();
  const [deckId, setDeckId] = useState("");
  const [stage, setStage] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(null);
  const [sessionWords, setSessionWords] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const deck = decks.find((item) => item.id === deckId) || decks[0];
  const words = deck?.words || [];
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return words.filter((word) => (!stage || word.stage === stage) &&
      (!query || [word.japanese, word.reading, word.meaning].some((value) => value.toLocaleLowerCase().includes(query))));
  }, [words, search, stage]);
  const selectedWords = words.filter((word) => selected.has(word.id));
  const allChecked = visible.length > 0 && visible.every((word) => selected.has(word.id));
  const pages = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pages);
  const action = async (run) => {
    setBusy(true); setError("");
    try { await run(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const assign = (ids, next) => action(() => change(deck.id, (current) => setStages(current, ids, next)));
  if (sessionWords) return <div className="lingo-workspace"><Flashcards words={sessionWords} onExit={() => setSessionWords(null)} /></div>;
  return <div className="lingo-workspace">
    <header className="lingo-heading lingo-row"><div><p className="lingo-eyebrow">JAPANESE VOCABULARY</p><h1>조금씩, 더 익숙하게.</h1><p className="lingo-muted">내 단어를 모으고, 오늘 공부할 단어를 골라보세요.</p></div>
      <button className="lingo-primary" disabled={!ready} onClick={() => setImporting("")}><Plus size={18} />단어 가져오기</button></header>
    <div className="lingo-sync lingo-row"><span role="status">{status}</span><div className="lingo-actions">
      {recoveryCount > 0 && <button disabled={busy} onClick={() => action(async () => downloadJson("lingo-recovery.json", await store.exportRecovery()))}><Download size={14} />복구 사본 {recoveryCount}개</button>}
      <button aria-label="단어장 다시 동기화" disabled={busy || !store} onClick={() => action(async () => { await store.load(); await store.sync(); })}><RefreshCw size={14} />동기화</button></div></div>
    {error && <p className="lingo-error" role="alert">{error}</p>}
    {importing !== null && <ImportPanel key={importing} initialDeckId={importing} onClose={() => setImporting(null)} onImported={(id) => { setDeckId(id); setSelected(new Set()); setImporting(null); setStage(0); setSearch(""); setPage(1); }} />}
    {!ready ? <p>단어장을 불러오고 있습니다.</p> : !decks.length ? <section className="lingo-empty lingo-panel"><BookOpen size={44} strokeWidth={1.3} />
      <h2>첫 일본어 단어장을 만들어볼까요?</h2><p className="lingo-muted">엑셀이나 구글 시트에 정리한 단어가<br />나만의 플래시카드가 됩니다.</p>
      <button className="lingo-primary" onClick={() => setImporting("")}><Plus size={17} />첫 단어장 가져오기</button></section> : <div className="lingo-library">
      <aside className="lingo-decks" aria-label="단어장 목록"><div className="lingo-row"><h2>내 단어장</h2><span>{decks.length}</span></div>
        {decks.map((item) => <button key={item.id} aria-current={item.id === deck.id ? "true" : undefined} onClick={() => {
          setDeckId(item.id); setSelected(new Set()); setStage(0); setSearch(""); setPage(1);
        }}><BookOpen size={18} /><span><strong>{item.name}</strong><small>{item.words.length}개 단어</small></span></button>)}
      </aside>
      <section className="lingo-words lingo-panel" aria-label="단어 관리"><div className="lingo-row"><div><h2>{deck.name}</h2><p className="lingo-muted">{words.length}개 단어 · 단계는 직접 지정해요</p></div>
        <button onClick={() => setImporting(deck.id)}><RefreshCw size={15} />다시 가져오기</button></div>
        <div className="lingo-stages" aria-label="단계 필터">{[0, 1, 2, 3, 4, 5].map((value) => <button key={value} aria-pressed={stage === value} onClick={() => { setStage(value); setPage(1); }}>
          <span>{value ? `${value}단계` : "전체"}</span><strong>{value ? words.filter((word) => word.stage === value).length : words.length}</strong></button>)}</div>
        <label className="lingo-search"><Search size={17} /><input aria-label="단어 검색" placeholder="일본어, 읽는 법, 뜻 검색" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
        <div className="lingo-selection"><label><input type="checkbox" checked={allChecked} disabled={!visible.length} onChange={() => setSelected((current) => {
          const next = new Set(current); visible.forEach((word) => allChecked ? next.delete(word.id) : next.add(word.id)); return next;
        })} />검색 결과 전체 선택 ({visible.length})</label>
          <div className="lingo-actions"><span>{selectedWords.length}개 선택</span>
            {selectedWords.length > 0 && <button onClick={() => setSelected(new Set())}>선택 해제</button>}
            <select aria-label="선택한 단어 단계 지정" value="" disabled={busy || !selectedWords.length} onChange={(e) => assign(selectedWords.map((word) => word.id), Number(e.target.value))}>
              <option value="">단계 지정</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단계</option>)}</select>
            <button className="lingo-primary" disabled={!selectedWords.length || busy} onClick={() => setSessionWords(selectedWords)}><Play size={15} />학습 시작</button></div>
        </div>
        <div className="lingo-word-list">{visible.slice((currentPage - 1) * 50, currentPage * 50).map((word) => <div className="lingo-word-row" key={word.id}>
          <label className="lingo-word-check"><input type="checkbox" aria-label={`${word.japanese} 선택`} checked={selected.has(word.id)} onChange={() => setSelected((current) => {
            const next = new Set(current); next.has(word.id) ? next.delete(word.id) : next.add(word.id); return next;
          })} /></label>
          <div className="lingo-word-japanese"><strong lang="ja">{word.japanese}</strong>{word.reading && <small lang="ja">{word.reading}</small>}</div>
          <div className="lingo-word-meaning"><span>{word.meaning}</span>{word.example && <small lang="ja">{word.example}</small>}{word.translation && <small>{word.translation}</small>}</div>
          <select aria-label={`${word.japanese} 단계`} value={word.stage} disabled={busy} onChange={(e) => assign([word.id], Number(e.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단계</option>)}</select>
        </div>)}</div>
        {!visible.length && <p className="lingo-empty-result">조건에 맞는 단어가 없어요.</p>}
        {pages > 1 && <nav className="lingo-pagination" aria-label="단어 목록 페이지"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
      </section>
    </div>}
  </div>;
}
