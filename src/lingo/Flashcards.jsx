import React, { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Check, X } from "lucide-react";
import { createSession, judgeCard, swipeDirection, undoCard } from "./session.js";
import { sessionStageChanges } from "./sessionStages.js";
import { exampleSegments } from "./furigana.js";
import { wordTopicGroups } from "./topicGroups.js";
import SpeakButton from "./SpeakButton.jsx";
import { speechText } from "./speech.js";

export default function Flashcards({ words, onExit, onSaveStages = async () => {} }) {
  const [session, setSession] = useState(() => createSession(words));
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(0);
  const [draftStages, setDraftStages] = useState(() => new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pointer = useRef(null), moved = useRef(false), card = useRef(null);
  const draftRef = useRef(draftStages), saveRef = useRef(onSaveStages), wordsRef = useRef(words);
  const committing = useRef(false), finished = useRef(false), mounted = useRef(false);
  draftRef.current = draftStages; saveRef.current = onSaveStages;
  const word = session.queue[0];
  const categories = word && [...(word.partsOfSpeech || []), word.jlpt, ...wordTopicGroups(word)].filter(Boolean).join(", ");
  const answerLabel = word && [categories, word.japanese, word.reading, word.meaning,
    word.hanja, word.example, word.exampleReading, word.translation].filter(Boolean).join(". ");
  const example = useMemo(() => exampleSegments(word?.example || "", word?.exampleReading || ""), [word?.example, word?.exampleReading]);
  const pendingCount = useMemo(() => sessionStageChanges(words, draftStages).length, [words, draftStages]);
  const currentStage = word && (draftStages.get(word.id) ?? word.stage);
  const finish = async () => {
    if (committing.current) return;
    committing.current = true; setSaving(true); setError("");
    try {
      const changes = sessionStageChanges(wordsRef.current, draftRef.current);
      if (changes.length) await saveRef.current(changes);
      finished.current = true;
      onExit();
    } catch (e) { if (mounted.current) setError(`단계를 저장하지 못했습니다. ${e.message}`); }
    finally { committing.current = false; if (mounted.current && !finished.current) setSaving(false); }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (finished.current || committing.current) return;
      const changes = sessionStageChanges(wordsRef.current, draftRef.current);
      if (!changes.length) return;
      // Save on ordinary module/language navigation; disposed account stores reject stale work.
      committing.current = true;
      Promise.resolve().then(() => saveRef.current(changes)).catch(() => { /* Store exposes storage errors. */ });
    };
  }, []);
  const judge = (known) => { setSession((value) => judgeCard(value, known)); setFlipped(false); setDrag(0); };
  const undo = () => { setSession((value) => undoCard(value)); setFlipped(false); setDrag(0); };
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [flipped, word?.id]);
  useEffect(() => {
    const onKey = (event) => {
      if (committing.current || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
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
      <button disabled={saving} onClick={finish}><X size={17} />{saving ? "저장 중…" : "학습 종료"}</button></div>
    <div className="lingo-session-progress"><span aria-live="polite">완료 {session.total - session.queue.length} / {session.total}</span><span>남은 단어 {session.queue.length}개</span></div>
    <progress max={session.total || 1} value={session.total - session.queue.length} aria-label="학습 진행률" />
    {error && <p className="lingo-error" role="alert">{error}</p>}
    {word ? <>
      <div className="lingo-card-stage">
      <div className={`lingo-card-shell ${drag ? "is-dragging" : ""}`} style={{ "--drag": `${drag}px`, "--rotation": `${drag / 18}deg` }}>
      <div key={word.id} className={`lingo-card-turn ${flipped ? "is-flipped" : ""}`}>
      {[false, true].map((back) => <div key={back ? "back" : "front"} className={`lingo-card-face ${back ? "lingo-card-back" : "lingo-card-front"}`} aria-hidden={flipped !== back} inert={flipped !== back}>
      <CardToolbar word={word} back={back} currentStage={currentStage} saving={saving} onStageChange={(event) => {
          const nextStage = Number(event.target.value);
          setDraftStages((current) => {
            const next = new Map(current);
            if (nextStage === word.stage) next.delete(word.id); else next.set(word.id, nextStage);
            return next;
          });
        }} />
      <button ref={flipped === back ? card : null} className="lingo-flashcard" disabled={saving}
        type="button"
        aria-label={back ? `${answerLabel}. 앞면 보기` : `${categories} ${word.japanese}. 정답 보기`.trim()}
        aria-pressed={back}
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
          setDrag(Math.abs(dx) > Math.abs(dy) ? Math.max(-140, Math.min(140, dx)) : 0);
        }}
        onPointerCancel={() => { pointer.current = null; moved.current = true; setDrag(0); }}
        onPointerUp={(event) => {
          const start = pointer.current; pointer.current = null; setDrag(0);
          if (!start) return;
          const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
          if (direction) { moved.current = true; judge(direction === "known"); }
        }}>
        {back ? <span className="lingo-answer">
              <span className="lingo-answer-word" lang="ja">{word.japanese}</span>
              {word.reading && <span className="lingo-reading" lang="ja">{word.reading}</span>}
              <strong className="lingo-meaning">{word.meaning}</strong>
              {word.hanja && <span className="lingo-card-field lingo-hanja"><span className="lingo-card-field-label">한자 훈음</span><span className="lingo-hanja-items">{word.hanja.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item, index) => <span key={index}>{item}</span>)}</span></span>}
              {(word.example || word.exampleReading || word.translation) && <span className="lingo-card-field lingo-example">
                {(word.example || word.exampleReading) && <span className="lingo-example-text" lang="ja">{word.example ? example.map((segment, index) => segment.reading ? <ruby key={index}>{segment.text}<rp>(</rp><rt>{segment.reading}</rt><rp>)</rp></ruby> : <React.Fragment key={index}>{segment.text}</React.Fragment>) : word.exampleReading}</span>}
                {word.translation && <span className="lingo-translation">{word.translation}</span>}
              </span>}
            </span> : <span className="lingo-card-front-body"><span className="lingo-card-word" lang="ja">{word.japanese}</span></span>}
      </button>
      </div>)}
      </div>
      </div>
      </div>
      <div className="lingo-judge-actions"><button disabled={saving} className="lingo-known" onClick={() => judge(true)}><Check size={20} /><span>알아요<small>이번 세션에서 완료</small></span></button>
        <button disabled={saving} onClick={() => judge(false)}><span>다시 볼게요<small>맨 뒤에서 한 번 더</small></span><RotateCcw size={20} /></button></div>
    </> : <div className="lingo-complete lingo-panel" role="status"><Check size={38} /><h2>모든 단어를 확인했어요</h2><p>{session.total}개 단어 학습 완료</p><button className="lingo-primary" disabled={saving} onClick={finish}>{saving ? "저장 중…" : "단어장으로 돌아가기"}</button></div>}
    <div className="lingo-session-bottom"><button disabled={saving || !session.previous} onClick={undo}><RotateCcw size={16} />마지막 판정 되돌리기</button>
      <p className="lingo-muted" aria-live="polite">{pendingCount ? `변경한 단계 ${pendingCount}개 · 학습 종료 시 저장됩니다.` : "단계 변경은 학습 종료 시 저장됩니다."}</p></div>
  </section>;
}

function CardToolbar({ word, back, currentStage, saving, onStageChange }) {
  const sentence = speechText(word.example, word.exampleReading);
  return <div className="lingo-card-toolbar">
    <CategoryBadges word={word} />
    <span className="lingo-card-speak">
      <SpeakButton text={speechText(word.japanese, word.reading)} label={`${word.japanese} 발음 듣기`} size={17}>단어</SpeakButton>
      {back && <SpeakButton text={sentence} label="예문 듣기" size={17}>예문</SpeakButton>}
    </span>
    <select className="lingo-card-stage-select" aria-label="이 단어의 단계" value={currentStage} disabled={saving} onChange={onStageChange}>
      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단계</option>)}
    </select>
  </div>;
}

function CategoryBadges({ word }) {
  return <span className="lingo-card-parts" aria-label="단어 카테고리">
    {(word.partsOfSpeech || []).map((part) => <span key={`part:${part}`} aria-label={`품사: ${part}`}>{part}</span>)}
    {word.jlpt && <span className="lingo-card-jlpt" aria-label={`JLPT: ${word.jlpt}`}>{word.jlpt}</span>}
    {wordTopicGroups(word).map((topic) => <span key={`topic:${topic}`} className="lingo-card-topic" aria-label={`특성: ${topic}`}>{topic}</span>)}
  </span>;
}
