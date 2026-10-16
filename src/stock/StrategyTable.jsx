import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Merge, Pencil, Plus, Scissors, Trash2, X } from 'lucide-react';
import { defaultStages } from './model.js';
import { sides, ruleAt, rowCount, editableStages, addRule, addStrategyRow, removeStrategyRow, addStrategyStage, moveStrategyStage, splitStrategyStage, mergeStrategyStage, validateStrategy, orderLabel } from './strategy.js';

// One stage per row, one order per column: every stage fits on one screen and
// each cell reads as "price · quantity" with any tweak written out in words.

const priceLabel = price => price === null ? 'MOC' : `$${price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedClass = value => Number(value) > 0 ? 'stock-signed-positive' : Number(value) < 0 ? 'stock-signed-negative' : '';
const orderType = rule => rule.order === 'loc' ? 'LOC' : rule.order === 'moc' ? 'MOC' : '지정가';
const bound = value => Number.isFinite(Number(value)) ? String(Number(value)) : '?';
const percentText = value => `${Number(value) > 0 ? '+' : ''}${Number(value)}%`;
const quantityText = rule => {
  if (rule.mode === 'remaining') return '남은 수량 전부';
  if (rule.mode === 'fixed') return `${rule.divisor}주`;
  const share = Math.round(100 / Number(rule.divisor));
  return `${rule.mode === 'held' ? '보유' : '가능'} ${Number.isFinite(share) ? share : '?'}%`;
};
const offsetText = offset => {
  const value = Number(offset);
  if (!value) return '';
  const cents = Math.round(Math.abs(value) * 100);
  return `${cents < 100 ? `${cents}센트` : `$${Math.abs(value).toFixed(2)}`} ${value < 0 ? '낮게' : '높게'}`;
};
const specialText = special => special === 'small-first' ? '1~3주면 1주' : special === 'small-second' ? '2~3주면 1주' : '';
const columns = stages => sides.flatMap(([side, label]) => Array.from({ length: rowCount(stages, side) }, (_, row) => ({ side, row, label: `${label} ${row + 1}` })));
// The order type most cells of a column use; only cells that differ show their own.
const columnType = (stages, column) => {
  const counts = {};
  for (const stage of stages) { const rule = ruleAt(stage, column.side, column.row); if (rule) counts[rule.order] = (counts[rule.order] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

function RuleSummary({ rule, commonType }) {
  const notes = [rule.order !== commonType && orderType(rule), offsetText(rule.offset), specialText(rule.special)].filter(Boolean);
  return <>
    <strong className={rule.order === 'moc' ? '' : signedClass(rule.percent)}>{rule.order === 'moc' ? '종가' : percentText(rule.percent)}</strong>
    <span className="sx-qty">{quantityText(rule)}</span>
    {notes.length > 0 && <span className="sx-notes">{notes.map(note => <em key={note}>{note}</em>)}</span>}
  </>;
}

const offsetChoices = [['0', '그대로'], ['-0.01', '1센트 낮게'], ['0.01', '1센트 높게']];

function RuleEditor({ stage, column, rule, onChange, onAdd, onRemove, onClose }) {
  const title = `${stage.name} · ${column.label}`;
  if (!rule) return <div className="sx-editor"><div className="sx-editor-head"><strong>{title}</strong><button type="button" aria-label="편집 닫기" onClick={onClose}><X size={16} /></button></div>
    <p>이 칸에는 주문이 없어요.</p><button type="button" className="sx-editor-add" onClick={onAdd}><Plus size={14} />주문 넣기</button></div>;
  const share = rule.divisor === '' ? '' : Math.round(100 / Number(rule.divisor));
  const offsetKey = offsetChoices.some(([value]) => Number(value) === Number(rule.offset)) && rule.offset !== '' ? String(Number(rule.offset)) : 'custom';
  return <div className="sx-editor">
    <div className="sx-editor-head"><strong>{title}</strong><button type="button" className="sx-editor-remove" onClick={onRemove}><Trash2 size={13} />이 주문 빼기</button><button type="button" aria-label="편집 닫기" onClick={onClose}><X size={16} /></button></div>
    <div className="sx-editor-fields">
      <label><span>주문 방식</span><select aria-label={`${title} 주문 방식`} value={rule.order} onChange={e => onChange({ order: e.target.value, ...(e.target.value === 'moc' ? { percent: rule.percent === '' ? 0 : rule.percent, offset: rule.offset === '' ? 0 : rule.offset } : {}) })}>
        {['loc', 'limit', 'moc'].map(order => <option key={order} value={order}>{orderLabel({ ...rule, order })}</option>)}</select></label>
      {rule.order !== 'moc' && <label><span>가격 (평단 대비)</span><span className="sx-input"><input className={signedClass(rule.percent)} aria-label={`${title} 평단 대비 비율`} type="number" step="any" value={rule.percent} onChange={e => onChange({ percent: e.target.value === '' ? '' : Number(e.target.value) })} />%</span></label>}
      <label><span>수량 기준</span><select aria-label={`${title} 수량 기준`} value={rule.mode} onChange={e => onChange({ mode: e.target.value, special: '', ...(e.target.value === 'remaining' ? { divisor: 1 } : {}) })}>
        <option value="capacity">추가 매수 가능 수량</option><option value="held">보유 수량</option><option value="remaining">남은 보유 수량 전부</option><option value="fixed">고정 수량</option></select></label>
      {rule.mode !== 'remaining' && <label><span>{rule.mode === 'fixed' ? '수량' : '그중'}</span><span className="sx-input"><input aria-label={`${title} ${rule.mode === 'fixed' ? '고정 수량' : '수량 비율'}`} type="number" min={rule.mode === 'fixed' ? 0 : 1} step="1" value={rule.mode === 'fixed' ? rule.divisor : share} onChange={e => onChange({ divisor: e.target.value === '' ? '' : rule.mode === 'fixed' ? Number(e.target.value) : Number(e.target.value) > 0 ? 100 / Number(e.target.value) : '' })} />{rule.mode === 'fixed' ? '주' : '%'}</span></label>}
      {rule.order !== 'moc' && <label><span>가격 살짝 조정</span><select aria-label={`${title} 가격 조정`} value={offsetKey} onChange={e => e.target.value !== 'custom' && onChange({ offset: Number(e.target.value) })}>
        {offsetChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="custom" disabled={offsetKey !== 'custom'}>{offsetKey === 'custom' ? offsetText(rule.offset) || '직접 입력' : '직접 입력'}</option></select></label>}
      {rule.side === 'sell' && rule.mode === 'held' && <label><span>조금 보유할 때</span><select aria-label={`${title} 소량 보유 보정`} value={rule.special} onChange={e => onChange({ special: e.target.value })}>
        <option value="">그대로</option><option value="small-first">1~3주면 1주만</option><option value="small-second">2~3주면 1주만</option></select></label>}
    </div>
    {rule.order !== 'moc' && <p className="sx-editor-hint">가격 살짝 조정: 같은 가격의 매수·매도가 겹치지 않게 1센트만 옮겨요.</p>}
  </div>;
}

export default function StrategyTable({ asset, stages, draft, setDraft, accounts, onSave, onCancel, onEdit }) {
  const editing = !!draft;
  const [selected, setSelected] = useState(null);
  const error = editing ? validateStrategy(stages) : '';
  const sorted = [...stages].sort((a, b) => Number(a.upper) - Number(b.upper));
  const cols = columns(stages);
  const types = cols.map(column => columnType(stages, column));
  const changeStage = (id, patch) => setDraft(stages.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStage = id => {
    const next = stages.filter(s => s.id !== id);
    if (next.length) {
      const last = [...next].sort((a, b) => Number(a.upper) - Number(b.upper)).at(-1);
      setDraft(next.map(s => s.id === last.id ? { ...s, upper: 100 } : s));
    } else setDraft([]);
    if (selected?.stageId === id) setSelected(null);
  };
  const pick = (stage, column) => setSelected(selected?.stageId === stage.id && selected.side === column.side && selected.row === column.row ? null : { stageId: stage.id, side: column.side, row: column.row });
  const selStage = editing && selected && stages.find(s => s.id === selected.stageId);
  const selColumn = selStage && cols.find(c => c.side === selected.side && c.row === selected.row);
  const selRule = selColumn && ruleAt(selStage, selColumn.side, selColumn.row);
  return <section className={`stock-panel stock-matrix-panel sx-panel ${editing ? 'is-editing' : ''}`} aria-label="전략표">
    <div className="sx-top">
      <p className="sx-legend">보유 비율에 맞는 <b>줄</b>의 주문을 내요. 가격은 <b>평단 대비</b>, <b>가능</b>은 추가 매수 가능 수량, <b>보유</b>는 보유 수량이에요.</p>
      {!editing ? <button className="sx-edit" onClick={onEdit} title="전략표 편집"><Pencil size={15} />편집</button> : <span className="stock-badge">편집 중</span>}
    </div>
    {editing && <div className="sx-tools">
      {!stages.length && <button onClick={() => setDraft(addStrategyStage(stages))}><Plus size={13} />단계 추가</button>}
      {sides.map(([side, label]) => <button key={side} onClick={() => setDraft(addStrategyRow(stages, side))}><Plus size={13} />{label} 칸 추가</button>)}
      <button onClick={() => { setDraft(editableStages(defaultStages())); setSelected(null); }}>TQQQ 시트 규칙 불러오기</button>
      <span>칸을 누르면 아래에서 고칠 수 있어요.</span>
    </div>}
    {!stages.length ? <div className="stock-empty"><p>이 종목의 전략을 설정해 주세요.</p>{!editing && <button onClick={onEdit}>전략 만들기</button>}</div> : <div className="sx-wrap"><table className="sx-table">
      <thead><tr>
        <th scope="col" className="sx-stage-col">단계</th>
        <th scope="col" className="sx-range-col">보유 비율</th>
        {cols.map((column, index) => <th scope="col" key={`${column.side}-${column.row}`} className={`sx-${column.side}${column.side === 'sell' && column.row === 0 ? ' sx-split' : ''}`}>
          <span>{column.label}</span>{types[index] && <small>{orderType({ order: types[index] })}</small>}
          {editing && <button type="button" className="sx-col-remove" aria-label={`${column.label} 칸 전체 삭제`} title={`${column.label} 칸 전체 삭제`} onClick={() => { setDraft(removeStrategyRow(stages, column.side, column.row)); setSelected(null); }}><Trash2 size={12} /></button>}
        </th>)}
        {editing && <th scope="col" className="sx-actions-col"><span className="sx-sr">단계 도구</span></th>}
      </tr></thead>
      <tbody>{sorted.map((stage, index) => {
        const lower = Number(sorted[index - 1]?.upper || 0), last = index === sorted.length - 1;
        return <tr key={stage.id}>
          <th scope="row" className="sx-stage-col">{editing ? <input aria-label={`${stage.name} 이름`} value={stage.name} onChange={e => changeStage(stage.id, { name: e.target.value })} /> : stage.name}</th>
          <td className="sx-range-col" data-label="보유 비율">{editing ? <span className="sx-range-edit">{bound(lower)} ~ {last ? '100' : <input aria-label={`${stage.name} 구간 상한`} type="number" min="0.01" max="100" step="any" value={stage.upper} onChange={e => changeStage(stage.id, { upper: e.target.value === '' ? '' : Number(e.target.value) })} />}%</span> : <span>{bound(lower)}~{bound(stage.upper)}%</span>}
            <i className="sx-range-bar" aria-hidden="true"><b style={{ left: `${Math.min(100, lower)}%`, width: `${Math.max(1, Math.min(100, Number(stage.upper)) - lower)}%` }} /></i></td>
          {cols.map((column, i) => {
            const rule = ruleAt(stage, column.side, column.row);
            const isSelected = selected?.stageId === stage.id && selected.side === column.side && selected.row === column.row;
            const body = rule ? <RuleSummary rule={rule} commonType={types[i]} /> : <span className="sx-empty">{editing ? '+' : '—'}</span>;
            return <td key={`${column.side}-${column.row}`} data-label={column.label} className={`sx-${column.side}${column.side === 'sell' && column.row === 0 ? ' sx-split' : ''}${isSelected ? ' is-selected' : ''}${rule ? '' : ' is-empty'}`}>
              {editing ? <button type="button" className="sx-cell" aria-label={`${stage.name} ${column.label} 편집`} aria-pressed={isSelected} onClick={() => pick(stage, column)}>{body}</button> : <div className="sx-cell">{body}</div>}
            </td>;
          })}
          {editing && <td className="sx-actions-col"><span className="sx-actions">
            <button type="button" title="이 구간 반으로 나누기" aria-label={`${stage.name} 구간 반으로 나누기`} disabled={!(Number(stage.upper) - lower > 0.02)} onClick={() => setDraft(splitStrategyStage(stages, stage.id))}><Scissors size={14} /></button>
            <button type="button" title="아래 단계와 합치기" aria-label={`${stage.name}와 아래 단계 합치기`} disabled={last} onClick={() => { setDraft(mergeStrategyStage(stages, stage.id)); setSelected(null); }}><Merge size={14} /></button>
            <button type="button" title="주문을 위 단계와 바꾸기" aria-label={`${stage.name} 위로 이동`} disabled={index === 0} onClick={() => setDraft(moveStrategyStage(stages, stage.id, sorted[index - 1].id))}><ArrowUp size={14} /></button>
            <button type="button" title="주문을 아래 단계와 바꾸기" aria-label={`${stage.name} 아래로 이동`} disabled={last} onClick={() => setDraft(moveStrategyStage(stages, stage.id, sorted[index + 1].id))}><ArrowDown size={14} /></button>
            <button type="button" className="is-danger" title="단계 삭제" aria-label={`${stage.name} 삭제`} onClick={() => removeStage(stage.id)}><Trash2 size={14} /></button>
          </span></td>}
        </tr>;
      })}</tbody>
    </table></div>}
    {editing && <div className="sx-bottom">
      {selStage && selColumn && <RuleEditor stage={selStage} column={selColumn} rule={selRule}
        onClose={() => setSelected(null)}
        onChange={patch => changeStage(selStage.id, { rules: selStage.rules.map(r => r.id === selRule.id ? { ...r, ...patch } : r) })}
        onAdd={() => changeStage(selStage.id, { rules: addRule(selStage, selColumn.side, selColumn.row).rules })}
        onRemove={() => changeStage(selStage.id, { rules: selStage.rules.filter(r => r.id !== selRule.id) })} />}
      <div className="sx-preview" aria-label="전략 변경 미리보기">{accounts.map(account => <div key={account.label}><strong>{account.label} · {account.result.stage?.name || '단계 미정'}</strong>{account.result.error ? <span>{account.result.error}</span> : sides.map(([side, label]) => <span key={side}>{label} {account.result.orders.filter(r => r.side === side && r.quantity > 0).map(r => `${orderLabel(r)} ${priceLabel(r.price)} · ${r.quantity}주`).join(' / ') || '—'}</span>)}</div>)}</div>
      <div className="sx-footer">{error && <span role="status">{error}</span>}<button onClick={onCancel}>취소</button><button className="stock-primary" disabled={!!error} onClick={onSave}><Check size={14} />저장</button></div>
    </div>}
  </section>;
}
