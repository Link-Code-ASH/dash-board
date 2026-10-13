import React from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useDashboardData } from "./context.jsx";
import { formatScore } from "../dashboard/model.js";
import "./flow-summary.css";

const signedScore = (score) => formatScore(score).replace(/^-/, "−");
const scoreTone = (score) => score > 0 ? "positive" : score < 0 ? "negative" : "neutral";

export function FlowScore() {
  const d = useDashboardData();
  return (
    <section className="flow-score" aria-label="선택 날짜 점수">
      <div className="flow-score-head">
        <div className="flow-score-total">
          <h2>Total Score</h2>
          <strong className={`flow-score-value is-${scoreTone(d.scoreInfo.total)}`}>
            {signedScore(d.scoreInfo.total)}
          </strong>
        </div>
        <dl className="flow-score-split">
          <div>
            <dt>Plus</dt>
            <dd className="is-positive">{signedScore(d.scoreInfo.plus)}</dd>
          </div>
          <div>
            <dt>Minus</dt>
            <dd className="is-negative">{signedScore(d.scoreInfo.minus)}</dd>
          </div>
        </dl>
      </div>
      <div className="flow-score-foot">
        <label className={`flow-score-check is-attempt ${d.routineTried ? "is-checked" : ""}`}>
          <input type="checkbox" checked={d.routineTried} onChange={d.toggleRoutineAttempt} aria-label="선택 날짜 루틴 시도" />
          <span>루틴 시도</span>
        </label>
        <label className={`flow-score-check is-penalty ${d.carryPenaltyMarked ? "is-checked" : ""}`}>
          <input type="checkbox" checked={d.carryPenaltyMarked} onChange={d.toggleCarryPenalty} aria-label="선택 날짜 Carry -2 적용" />
          <span>Carry −2</span>
        </label>
        <div className="flow-score-carry">
          <span>Carry</span>
          <strong>{signedScore(d.scoreInfo.carry)}</strong>
          <div className="flow-score-carry-tools" aria-label="Carry 조정">
            <button type="button" aria-label="Carry 1 감소" title="Carry 1 감소" onClick={() => d.adjustCarry(-1)}>
              <Minus size={14} aria-hidden="true" />
            </button>
            <button type="button" aria-label="선택 날짜부터 Carry 초기화" title="Carry 초기화" onClick={d.resetCarry}>
              <RotateCcw size={13} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Carry 1 증가" title="Carry 1 증가" onClick={() => d.adjustCarry(1)}>
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
