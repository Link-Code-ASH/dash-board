import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Check, X } from "lucide-react";
import { createSession, judgeCard, swipeDirection, undoCard } from "./session.js";

export default function Flashcards({ words, onExit }) {
  const [session, setSession] = useState(() => createSession(words));
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(0);
  const pointer = useRef(null), moved = useRef(false), card = useRef(null);
  const word = session.queue[0];
  const judge = (known) => { setSession((value) => judgeCard(value, known)); setFlipped(false); setDrag(0); };
  const undo = () => { setSession((value) => undoCard(value)); setFlipped(false); };
  useEffect(() => { card.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
          event.target.closest("input,select,textarea,[contenteditable=true]")) return;
      if (event.code === "Space" && (event.target === card.current || !event.target.closest("button"))) {
        event.preventDefault(); if (word) setFlipped((value) => !value);
      } else if (word && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault(); judge(event.key === "ArrowRight");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [word]);
  return <section className="lingo-session" aria-label="플래시카드 학습">
    <div className="lingo-row"><div><p className="lingo-eyebrow">FLASHCARDS</p><h2>나의 속도로, 한 단어씩</h2></div>
      <button onClick={onExit}><X size={17} />학습 종료</button></div>
    <div className="lingo-session-progress"><span aria-live="polite">완료 {session.total - session.queue.length} / {session.total}</span><span>남은 단어 {session.queue.length}개</span></div>
    <progress max={session.total || 1} value={session.total - session.queue.length} aria-label="학습 진행률" />
    {word ? <>
      <button ref={card} className={`lingo-flashcard ${flipped ? "is-flipped" : ""}`} style={{ "--drag": `${drag}px`, "--rotation": `${drag / 18}deg` }}
        aria-label={flipped ? `${word.japanese}, ${word.meaning}. 앞면 보기` : `${word.japanese}. 정답 보기`}
        onClick={(event) => { if (moved.current && event.detail !== 0) { moved.current = false; return; } setFlipped((value) => !value); }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          moved.current = false; pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = pointer.current; if (!start || start.id !== event.pointerId) return;
          const dx = event.clientX - start.x, dy = event.clientY - start.y;
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved.current = true;
          if (Math.abs(dx) > Math.abs(dy)) setDrag(Math.max(-140, Math.min(140, dx)));
        }}
        onPointerCancel={() => { pointer.current = null; moved.current = true; setDrag(0); }}
        onPointerUp={(event) => {
          const start = pointer.current; pointer.current = null; setDrag(0);
          if (!start) return;
          const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
          if (direction) { moved.current = true; judge(direction === "known"); }
        }}>
        <span className="lingo-card-label">{flipped ? "뜻 확인" : "日本語"}</span>
        <span className="lingo-card-word" lang="ja">{word.japanese}</span>
        {flipped && <span className="lingo-answer">
          {word.reading && <span className="lingo-reading" lang="ja">{word.reading}</span>}
          <strong>{word.meaning}</strong>
          {word.example && <span className="lingo-example" lang="ja">{word.example}</span>}
          {word.translation && <span className="lingo-muted">{word.translation}</span>}
        </span>}
        <span className="lingo-card-hint">{flipped ? "누르면 앞면으로" : "눌러서 뜻 확인 · Space"}</span>
      </button>
      <div className="lingo-judge-actions"><button onClick={() => judge(false)}><ArrowLeft size={20} /><span>다시 볼게요<small>맨 뒤에서 한 번 더</small></span></button>
        <button className="lingo-known" onClick={() => judge(true)}><span>알아요<small>이번 세션에서 완료</small></span><ArrowRight size={20} /></button></div>
    </> : <div className="lingo-complete lingo-panel" role="status"><Check size={38} /><h2>모든 단어를 확인했어요</h2><p>{session.total}개 단어 학습 완료</p><button className="lingo-primary" onClick={onExit}>단어장으로 돌아가기</button></div>}
    <div className="lingo-session-bottom"><button disabled={!session.previous} onClick={undo}><RotateCcw size={16} />마지막 판정 되돌리기</button>
      <p className="lingo-muted">학습 중에는 단어의 단계가 바뀌지 않아요.</p></div>
  </section>;
}
