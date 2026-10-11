import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { defaultStages } from './model.js';
import { sides, ruleAt, rowCount, editableStages, addRule, addStrategyRow, removeStrategyRow, addStrategyStage, moveStrategyStage, validateStrategy, describeRule, orderLabel } from './strategy.js';

const priceLabel = price => price === null ? 'MOC' : `$${price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedClass = value => Number(value) > 0 ? 'stock-signed-positive' : Number(value) < 0 ? 'stock-signed-negative' : '';

function RuleCell({ rule, editing, label, onChange, onAdd, onRemove }) {
  if (!rule) return editing ? <div className="stock-cell-empty"><button aria-label={`${label} 규칙 추가`} onClick={onAdd}><Plus size={15} />주문 추가</button></div> : null;
  const text = describeRule(rule);
  if (!editing) return <div className="stock-rule-text">
    <div className="stock-rule-price"><span className="stock-rule-caption">{orderLabel(rule)}{rule.order === 'moc' ? '' : ' 가격'}</span><strong>{rule.order === 'moc' ? '장 마감 시장가' : <span className={signedClass(rule.percent)}>{text.price.replace('평단 ', '')}</span>}</strong></div>
    <div className="stock-rule-quantity"><span className="stock-rule-caption">주문 수량</span><strong>{text.quantity.replace('가능 수량', '추가 매수 가능 수량')}</strong></div>
    {(rule.offset || rule.special) ? <details className="stock-rule-details"><summary>가격·소량 보정</summary>{!!rule.offset && <p>가격 <span className={signedClass(rule.offset)}>{rule.offset > 0 ? '+' : ''}{rule.offset}달러</span></p>}{rule.special && <p>{rule.special === 'small-first' ? '1~3주 보유 시 1주' : '2~3주 보유 시 1주'}</p>}</details> : null}
  </div>;
  const percentage = rule.divisor === '' ? '' : Math.round(100 / Number(rule.divisor));
  return <div className="stock-rule-editor">
    <fieldset className="stock-rule-editor-group"><legend>주문 가격</legend>
    <label><select aria-label={`${label} 주문 방식`} value={rule.order} onChange={e => onChange({ order: e.target.value, ...(e.target.value === 'moc' ? { percent: rule.percent === '' ? 0 : rule.percent, offset: rule.offset === '' ? 0 : rule.offset } : {}) })}>{['loc', 'limit', 'moc'].map(order => <option key={order} value={order}>{orderLabel({ ...rule, order })}</option>)}</select></label>
    {rule.order !== 'moc' && <label><input className={signedClass(rule.percent)} aria-label={`${label} 평단 대비 비율`} type="number" step="any" value={rule.percent} onChange={e => onChange({ percent: e.target.value === '' ? '' : Number(e.target.value) })} /><span>%</span></label>}
    </fieldset>
    <fieldset className="stock-rule-editor-group"><legend>주문 수량</legend>
    <label><select aria-label={`${label} 수량 기준`} value={rule.mode} onChange={e => onChange({ mode: e.target.value, special: '', ...(e.target.value === 'remaining' ? { divisor: 1 } : {}) })}><option value="capacity">추가 매수 가능 수량</option><option value="held">보유 수량</option><option value="remaining">남은 보유 수량 전부</option><option value="fixed">고정 수량</option></select></label>
    {rule.mode !== 'remaining' && <label><input aria-label={`${label} ${rule.mode === 'fixed' ? '고정 수량' : '수량 비율'}`} type="number" min={rule.mode === 'fixed' ? 0 : 1} step="1" value={rule.mode === 'fixed' ? rule.divisor : percentage} onChange={e => onChange({ divisor: e.target.value === '' ? '' : rule.mode === 'fixed' ? Number(e.target.value) : Number(e.target.value) > 0 ? 100 / Number(e.target.value) : '' })} /><span>{rule.mode === 'fixed' ? '주' : '%'}</span></label>}
    </fieldset>
    <details className="stock-rule-details"><summary>상세 설정</summary><label><span>가격 보정 ($)</span><input className={signedClass(rule.offset)} aria-label={`${label} 가격 보정`} type="number" step="0.01" disabled={rule.order === 'moc'} value={rule.offset} onChange={e => onChange({ offset: e.target.value === '' ? '' : Number(e.target.value) })} /></label><label><span>소량 보유 보정</span><select aria-label={`${label} 소량 보유 보정`} value={rule.special} onChange={e => onChange({ special: e.target.value })}><option value="">없음</option><option value="small-first">1~3주: 1주</option><option value="small-second">2~3주: 1주</option></select></label><button onClick={onRemove} aria-label={`${label} 규칙 삭제`}><Trash2 size={12} />이 칸 삭제</button></details>
  </div>;
}

export default function StrategyTable({ asset, stages, draft, setDraft, accounts, onSave, onCancel, onEdit }) {
  const editing = !!draft;
  const [draggedStage, setDraggedStage] = useState('');
  const strategyError = validateStrategy(stages);
  const error = editing ? strategyError : '';
  const sorted = [...stages].sort((a, b) => Number(a.upper) - Number(b.upper));
  const changeStage = (id, patch) => setDraft(stages.map(s => s.id === id ? { ...s, ...patch } : s));
  const changeRule = (stage, rule, patch) => changeStage(stage.id, { rules: stage.rules.map(r => r.id === rule.id ? { ...r, ...patch } : r) });
  const moveStage = (from, to) => setDraft(moveStrategyStage(stages, from, to));
  const removeStage = id => {
    const next = stages.filter(s => s.id !== id);
    if (next.length) {
      const last = [...next].sort((a, b) => Number(a.upper) - Number(b.upper)).at(-1);
      setDraft(next.map(s => s.id === last.id ? { ...s, upper: 100 } : s));
    } else setDraft([]);
  };
  return <section className={`stock-panel stock-matrix-panel ${editing ? 'is-editing' : ''}`} aria-label="전략표">
    <div className="stock-section-heading">
      <h3>매매 규칙</h3>
      {!editing && <button onClick={onEdit} title="전략표 편집"><Pencil size={17} />편집</button>}
      {editing && <span className="stock-badge">미리보기</span>}
    </div>
    <p className="stock-strategy-guide">보유 비율에 맞는 단계의 열을 확인하세요. 각 행이 하나의 주문입니다.</p>
    {editing && <div className="stock-matrix-actions"><button onClick={() => setDraft(addStrategyStage(stages))}><Plus size={13} />단계 추가</button>{sides.map(([side, label]) => <button key={side} onClick={() => setDraft(addStrategyRow(stages, side))}><Plus size={13} />{label} 행 추가</button>)}<button onClick={() => setDraft(editableStages(defaultStages()))}>TQQQ 시트 규칙 불러오기</button></div>}
    {!stages.length ? <div className="stock-empty"><p>이 종목의 전략을 설정해 주세요.</p>{!editing && <button onClick={onEdit}>전략 만들기</button>}</div> : <div className="stock-table-wrap"><table className="stock-strategy-table"><thead><tr>
      <th scope="col">주문</th>
      {sorted.map((stage, index) => {
        const lower = sorted[index - 1]?.upper || 0;
        return <th scope="col" key={stage.id}>
          <div className="stock-stage-head" draggable={editing}
            onDragStart={e => {
              if (e.target.closest('input, button, select')) { e.preventDefault(); return; }
              setDraggedStage(stage.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/hub-stock-stage', stage.id);
            }}
            onDragOver={e => { if (editing && draggedStage) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
            onDrop={e => { if (editing && draggedStage) { e.preventDefault(); moveStage(draggedStage, stage.id); setDraggedStage(''); } }}
            onDragEnd={() => setDraggedStage('')}>
            {editing ? <>
              <div className="stock-stage-edit"><input aria-label={`${stage.name} 이름`} value={stage.name} onChange={e => changeStage(stage.id, { name: e.target.value })} /><button aria-label={`${stage.name} 삭제`} onClick={() => removeStage(stage.id)}><Trash2 size={13} /></button></div>
              <div className="stock-stage-move"><GripVertical size={14} aria-hidden="true" /><button disabled={index === 0} aria-label={`${stage.name} 앞으로 이동`} title="앞 단계로 이동 · 구간 경계 유지" onClick={() => moveStage(stage.id, sorted[index - 1].id)}><ArrowLeft size={14} /></button><button disabled={index === sorted.length - 1} aria-label={`${stage.name} 뒤로 이동`} title="뒤 단계로 이동 · 구간 경계 유지" onClick={() => moveStage(stage.id, sorted[index + 1].id)}><ArrowRight size={14} /></button></div>
            </> : <strong>{stage.name}</strong>}
            <div className="stock-stage-range"><span className="stock-stage-range-label">보유 비율</span>{editing ? <label>{lower}% ~ <input aria-label={`${stage.name} 구간 상한`} type="number" min="0.01" max="100" step="any" value={stage.upper} onChange={e => changeStage(stage.id, { upper: e.target.value === '' ? '' : Number(e.target.value) })} />%</label> : <span>{lower}% ~ {stage.upper}%{index === sorted.length - 1 ? '' : ' 미만'}</span>}</div>
          </div>
        </th>;
      })}
    </tr></thead><tbody>{sides.flatMap(([side, label]) => Array.from({ length: Math.max(1, rowCount(stages, side)) }, (_, row) => <tr key={`${side}-${row}`} className={`${side}-row ${side === 'sell' && row === 0 ? 'stock-sell-start' : ''}`}>
      <th scope="row" className={`stock-row-label ${side}`}><strong>{label}</strong><span>주문 {row + 1}</span>{editing && <button className="stock-row-delete" aria-label={`${label} ${row + 1}행 삭제`} onClick={() => setDraft(removeStrategyRow(stages, side, row))}><Trash2 size={15} /></button>}</th>
      {sorted.map(stage => {
        const rule = ruleAt(stage, side, row), cellLabel = `${asset.symbol} ${stage.name} ${label} ${row + 1}`;
        return <td key={stage.id}><RuleCell label={cellLabel} rule={rule} editing={editing} onChange={patch => changeRule(stage, rule, patch)} onAdd={() => changeStage(stage.id, { rules: addRule(stage, side, row).rules })} onRemove={() => changeStage(stage.id, { rules: stage.rules.filter(r => r.id !== rule.id) })} /></td>;
      })}
    </tr>))}</tbody></table></div>}
    {editing && <><div className="stock-draft-preview" aria-label="전략 변경 미리보기">{accounts.map(account => <div key={account.label} className={`account-${account.label.toLowerCase()}`}><strong>{account.label} · {account.result.stage?.name || '단계 미정'}</strong>{account.result.error ? <span>{account.result.error}</span> : sides.map(([side, label]) => <span key={side}>{label} {account.result.orders.filter(r => r.side === side && r.quantity > 0).map(r => `${orderLabel(r)} ${priceLabel(r.price)} · ${r.quantity}주`).join(' / ') || '—'}</span>)}</div>)}</div><div className="stock-edit-footer">{error && <span role="status">{error}</span>}<button onClick={onCancel}>취소</button><button className="stock-primary" disabled={!!error} onClick={onSave}><Check size={14} />저장</button></div></>}
  </section>;
}
