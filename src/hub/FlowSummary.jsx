import React from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { useDashboardData } from "./context.jsx";
import { formatScore } from "../dashboard/model.js";
import "./flow-summary.css";

const signedScore = (score) => formatScore(score).replace(/^-/, "−");
const scoreTone = (score) => score > 0 ? "positive" : score < 0 ? "negative" : "neutral";

export function FlowScore() {
  const d = useDashboardData();
  // One compact strip: total, plus/minus, carry, then the two routine checks.
  return (
    <section className="flow-score-strip" aria-label="선택 날짜 점수">
      <div className="fs-total">
        <span>Total</span>
        <strong className={`is-${scoreTone(d.scoreInfo.total)}`}>{signedScore(d.scoreInfo.total)}</strong>
      </div>
      <dl className="fs-split">
        <div><dt>Plus</dt><dd className="is-positive">{signedScore(d.scoreInfo.plus)}</dd></div>
        <div><dt>Minus</dt><dd className="is-negative">{signedScore(d.scoreInfo.minus)}</dd></div>
        <div className="fs-carry">
          <dt>Carry</dt>
          <dd>{signedScore(d.scoreInfo.carry)}</dd>
          <span className="fs-carry-tools" aria-label="Carry 조정">
            <button type="button" aria-label="Carry 1 감소" title="Carry 1 감소" onClick={() => d.adjustCarry(-1)}>
              <Minus size={12} aria-hidden="true" />
            </button>
            <button type="button" aria-label="선택 날짜부터 Carry 초기화" title="Carry 초기화" onClick={d.resetCarry}>
              <RotateCcw size={11} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Carry 1 증가" title="Carry 1 증가" onClick={() => d.adjustCarry(1)}>
              <Plus size={12} aria-hidden="true" />
            </button>
          </span>
        </div>
      </dl>
      <div className="fs-checks">
        <label className={`fs-check is-attempt ${d.routineTried ? "is-checked" : ""}`} title="초록 체크">
          <input type="checkbox" checked={d.routineTried} onChange={d.toggleRoutineAttempt} aria-label="선택 날짜 초록 체크" />
          <Check size={16} strokeWidth={3} aria-hidden="true" />
        </label>
        <label className={`fs-check is-penalty ${d.carryPenaltyMarked ? "is-checked" : ""}`} title="빨간 체크 (−2)">
          <input type="checkbox" checked={d.carryPenaltyMarked} onChange={d.toggleCarryPenalty} aria-label="선택 날짜 빨간 체크, −2점" />
          <Check size={16} strokeWidth={3} aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}
