import { uid } from './model.js';

export const sides = [['buy', '매수'], ['sell', '매도']];
export const ruleRow = (stage, rule) => rule.row ?? stage.rules.filter(r => r.side === rule.side).indexOf(rule);
export const rowCount = (stages, side) => Math.max(0, ...stages.flatMap(stage => stage.rules.filter(r => r.side === side).map(r => ruleRow(stage, r) + 1)));
export const ruleAt = (stage, side, row) => stage.rules.find(r => r.side === side && ruleRow(stage, r) === row);
export const editableStages = stages => structuredClone(stages).map(stage => ({ ...stage, rules: stage.rules.map(rule => ({ ...rule, row: ruleRow(stage, rule) })) }));
export const newRule = (side, row) => ({ id: uid(), side, row, order: 'limit', percent: 0, offset: 0, mode: side === 'buy' ? 'capacity' : 'held', divisor: 30, special: '' });
export function addRule(stage, side, row) {
  const rules = [...stage.rules, newRule(side, row)];
  // The visual row order is also the order used to allocate remaining shares.
  rules.sort((a, b) => (a.side === 'buy' ? 0 : 1) - (b.side === 'buy' ? 0 : 1) || a.row - b.row);
  return { ...stage, rules };
}
export const addStrategyRow = (stages, side) => {
  const end = rowCount(stages, side);
  const remaining = side === 'sell' ? stages.flatMap(stage => stage.rules.filter(rule => rule.side === side && rule.mode === 'remaining').map(rule => ruleRow(stage, rule))) : [];
  const row = Math.min(end, ...remaining);
  return stages.map(stage => addRule({ ...stage, rules: stage.rules.map(rule => rule.side !== side ? rule : { ...rule, row: ruleRow(stage, rule) + (ruleRow(stage, rule) >= row ? 1 : 0) }) }, side, row));
};
export const removeStrategyRow = (stages, side, row) => stages.map(stage => ({ ...stage, rules: stage.rules.filter(r => !(r.side === side && ruleRow(stage, r) === row)).map(r => r.side === side && ruleRow(stage, r) > row ? { ...r, row: ruleRow(stage, r) - 1 } : r) }));
export function addStrategyStage(stages) {
  if (!stages.length) return [{ id: uid(), name: '1단계', upper: 100, rules: [] }];
  const ordered = [...stages].sort((a, b) => a.upper - b.upper);
  const last = ordered.at(-1), lower = Number(ordered.at(-2)?.upper || 0), upper = Number(last.upper);
  const midpoint = lower + (upper - lower) / 2;
  const rounded = Math.round(midpoint * 100) / 100;
  const split = rounded > lower && rounded < upper ? rounded : midpoint;
  if (!(split > lower && split < upper)) return stages;
  return [...ordered.slice(0, -1), { ...last, upper: split }, { id: uid(), name: `${stages.length + 1}단계`, upper, rules: [] }];
}
const finiteInput = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
export function validateStrategy(stages) {
  if (!stages.length) return '단계를 하나 이상 추가해 주세요.';
  const bounds = stages.map(s => Number(s.upper)).sort((a, b) => a - b);
  if (bounds.some(n => !Number.isFinite(n) || n <= 0 || n > 100) || new Set(bounds).size !== bounds.length || bounds.at(-1) !== 100) return '단계 상한은 서로 다르게 설정하고 마지막 상한은 100%로 맞춰 주세요.';
  for (const stage of stages) for (const rule of stage.rules) {
    if (!finiteInput(rule.percent) || Number(rule.percent) <= -100 || !finiteInput(rule.offset) || !finiteInput(rule.divisor) || (rule.mode === 'fixed' ? Number(rule.divisor) < 0 || !Number.isInteger(Number(rule.divisor)) : Number(rule.divisor) <= 0)) return '비율과 수량 기준을 확인해 주세요. 고정 수량은 0 이상의 정수입니다.';
  }
  return '';
}
export function describeRule(rule) {
  const price = rule.order === 'moc' ? 'MOC' : `평단 ${rule.percent >= 0 ? '+' : ''}${rule.percent}%`;
  const quantity = rule.mode === 'remaining' ? '남은 보유 수량 전부' : rule.mode === 'fixed' ? `${rule.divisor}주 고정` : `${rule.mode === 'held' ? '보유' : '가능'} 수량의 1/${rule.divisor}`;
  return { price, quantity };
}
