import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStages, emptyPosition, calculateIBS } from '../src/stock/model.js';
import { editableStages, ruleAt, rowCount, addRule, addStrategyRow, removeStrategyRow, addStrategyStage, validateStrategy, describeRule } from '../src/stock/strategy.js';

const outcome = result => ({
  ratio: result.ratio,
  stageId: result.stage?.id,
  error: result.error,
  orders: result.orders?.map(({ row, ...rule }) => rule),
});

test('opening and saving the sheet editor preserves every seeded stage calculation and rule order', () => {
  const saved = defaultStages(), draft = editableStages(saved);
  assert.equal(validateStrategy(draft), '');
  assert.equal(rowCount(draft, 'buy'), 3);
  assert.equal(rowCount(draft, 'sell'), 3);
  for (const held of [20, 42, 47, 52, 57, 65, 80, 95]) {
    const position = { ...emptyPosition(), average: 78.68, held, capacity: 100 - held };
    assert.deepEqual(outcome(calculateIBS(position, draft)), outcome(calculateIBS(position, saved)));
  }
  assert.deepEqual(draft.map(stage => stage.rules.map(rule => rule.id)), saved.map(stage => stage.rules.map(rule => rule.id)));
  assert.equal(ruleAt(draft[0], 'buy', 2).offset, -0.01);
  assert.equal(ruleAt(draft[0], 'sell', 0).special, 'small-first');
  assert.equal(ruleAt(draft[0], 'sell', 1).special, 'small-second');
  assert.equal(ruleAt(draft[7], 'sell', 0).order, 'moc');
});

test('a deleted cell stays a sparse slot and adding it back does not move later rules', () => {
  const stages = editableStages(defaultStages()), original = structuredClone(stages);
  const later = ruleAt(stages[0], 'buy', 2);
  const sparse = { ...stages[0], rules: stages[0].rules.filter(rule => rule.id !== ruleAt(stages[0], 'buy', 1).id) };
  assert.equal(ruleAt(sparse, 'buy', 1), undefined);
  assert.equal(ruleAt(sparse, 'buy', 2).id, later.id);
  const filled = addRule(sparse, 'buy', 1);
  assert.deepEqual(filled.rules.filter(rule => rule.side === 'buy').map(rule => rule.row), [0, 1, 2]);
  assert.equal(ruleAt(filled, 'buy', 2).id, later.id);
  assert.equal(ruleAt(filled, 'buy', 1).mode, 'capacity');
  assert.deepEqual(stages, original);
});

test('whole-row additions and deletions preserve sparse cells and independent sell rows', () => {
  const draft = editableStages(defaultStages()), before = structuredClone(draft);
  const added = addStrategyRow(draft, 'buy');
  assert.equal(rowCount(added, 'buy'), 4);
  assert.equal(ruleAt(added[7], 'buy', 0), undefined);
  assert.equal(ruleAt(added[7], 'buy', 3).side, 'buy');
  const removed = removeStrategyRow(added, 'buy', 1);
  assert.equal(rowCount(removed, 'buy'), 3);
  assert.equal(ruleAt(removed[0], 'buy', 1).id, ruleAt(draft[0], 'buy', 2).id);
  assert.equal(ruleAt(removed[7], 'buy', 0), undefined);
  assert.equal(ruleAt(removed[7], 'buy', 2).id, ruleAt(added[7], 'buy', 3).id);
  assert.deepEqual(removed.map(stage => stage.rules.filter(rule => rule.side === 'sell')), draft.map(stage => stage.rules.filter(rule => rule.side === 'sell')));
  assert.deepEqual(draft, before);
});

test('adding a sell row inserts it before remaining-all and allocates useful shares', () => {
  const saved = defaultStages(), before = structuredClone(saved);
  const added = addStrategyRow(saved, 'sell');
  assert.equal(rowCount(added, 'sell'), 4);
  for (let index = 0; index < saved.length; index++) {
    const previousRemaining = saved[index].rules.find(rule => rule.mode === 'remaining');
    assert.equal(ruleAt(added[index], 'sell', 2).mode, 'held');
    assert.equal(ruleAt(added[index], 'sell', 3).id, previousRemaining.id);
  }
  const position = { ...emptyPosition(), average: 100, held: 30, capacity: 70 };
  const result = calculateIBS(position, added);
  assert.deepEqual(result.orders.filter(rule => rule.side === 'sell').map(rule => rule.quantity), [4, 4, 1, 21]);
  assert.equal(result.orders.filter(rule => rule.side === 'sell').reduce((sum, rule) => sum + rule.quantity, 0), 30);
  const removed = removeStrategyRow(added, 'sell', 2);
  assert.deepEqual(outcome(calculateIBS(position, removed)), outcome(calculateIBS(position, saved)));
  assert.deepEqual(saved, before);
});

test('a common inserted sell slot uses the earliest remaining-all row across stages', () => {
  const draft = editableStages(defaultStages());
  draft[0].rules.find(rule => rule.side === 'sell' && rule.row === 1).mode = 'remaining';
  const before = structuredClone(draft), added = addStrategyRow(draft, 'sell');
  for (let index = 0; index < draft.length; index++) {
    assert.equal(ruleAt(added[index], 'sell', 1).mode, 'held');
    assert.equal(ruleAt(added[index], 'sell', 2).id, ruleAt(draft[index], 'sell', 1).id);
    assert.equal(ruleAt(added[index], 'sell', 3).id, ruleAt(draft[index], 'sell', 2).id);
  }
  assert.deepEqual(draft, before);
});

test('adding stages preserves a valid final boundary even for narrow or legacy string intervals', () => {
  const initial = addStrategyStage([]);
  assert.equal(initial.length, 1);
  assert.equal(initial[0].upper, 100);
  assert.equal(validateStrategy(initial), '');
  const saved = editableStages(defaultStages()), before = structuredClone(saved), added = addStrategyStage(saved);
  assert.equal(added.length, 9);
  assert.equal(added[7].upper, 95);
  assert.equal(added[8].upper, 100);
  assert.equal(validateStrategy(added), '');
  assert.deepEqual(saved, before);
  let narrow = [{ id: 'lower', name: '1단계', upper: '99.99', rules: [] }, { id: 'last', name: '2단계', upper: '100', rules: [] }];
  for (let i = 0; i < 12; i++) {
    const oldLength = narrow.length;
    narrow = addStrategyStage(narrow);
    assert.equal(narrow.length, oldLength + 1);
    assert.equal(validateStrategy(narrow), '');
  }
});

test('stage removal requires a final 100% boundary and does not accept an empty strategy', () => {
  const stages = editableStages(defaultStages());
  assert.equal(validateStrategy(stages.filter((_, index) => index !== 3)), '');
  const missingFinal = stages.slice(0, -1);
  assert.ok(validateStrategy(missingFinal));
  assert.equal(validateStrategy(missingFinal.map((stage, index) => index === missingFinal.length - 1 ? { ...stage, upper: 100 } : stage)), '');
  assert.ok(validateStrategy([]));
  assert.ok(validateStrategy(stages.map((stage, index) => index === 1 ? { ...stage, upper: 40 } : stage)));
});

test('restored numeric strings remain editable but cleared numeric fields block saving', () => {
  const stages = editableStages(defaultStages()).map(stage => ({
    ...stage,
    upper: String(stage.upper),
    rules: stage.rules.map(rule => ({ ...rule, percent: String(rule.percent), offset: String(rule.offset), divisor: String(rule.divisor) })),
  }));
  assert.equal(validateStrategy(stages), '');
  for (const field of ['percent', 'offset', 'divisor']) {
    for (const value of ['', ' ', null, NaN]) {
      const invalid = structuredClone(stages);
      invalid[0].rules[0][field] = value;
      assert.ok(validateStrategy(invalid));
    }
  }
  const fixed = structuredClone(stages);
  fixed[0].rules[0] = { ...fixed[0].rules[0], mode: 'fixed', divisor: '0' };
  assert.equal(validateStrategy(fixed), '');
  fixed[0].rules[0].divisor = '1.5';
  assert.ok(validateStrategy(fixed));
});

test('discarding a modified draft restores saved orders without mutating nested saved rules', () => {
  const saved = defaultStages(), before = structuredClone(saved);
  const position = { ...emptyPosition(), average: 100, held: 9, capacity: 31 };
  const originalOrders = outcome(calculateIBS(position, saved));
  let draft = editableStages(saved);
  draft[0].rules[0].percent = -20;
  draft = addStrategyRow(draft, 'sell');
  assert.notDeepEqual(outcome(calculateIBS(position, draft)), originalOrders);
  draft = null;
  assert.deepEqual(outcome(calculateIBS(position, draft || saved)), originalOrders);
  assert.deepEqual(saved, before);
});

test('readable rule descriptions retain MOC and distinguish remaining held shares', () => {
  const stages = defaultStages();
  assert.deepEqual(describeRule(stages[7].rules[0]), { price: 'MOC', quantity: '보유 수량의 1/8' });
  assert.equal(describeRule(stages[0].rules.at(-1)).quantity, '남은 보유 수량 전부');
  assert.equal(describeRule(stages[0].rules[0]).quantity, '가능 수량의 1/30');
  assert.equal(describeRule({ ...stages[0].rules[0], mode: 'fixed', divisor: 2 }).quantity, '2주 고정');
});
