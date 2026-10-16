import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDU_VERSION, GRADE_OPTIONS, seoulDateKey, seoulYear, countingAge, currentGrade, gradeLabel,
  normalizeEdu, reconcilePromotions, pendingTransitions, applyEduAction,
} from '../src/edu/model.js';

const NOW = new Date('2026-10-11T00:00:00Z');
const options = { now: NOW, actor: 'account-1' };
const values = { name: '김원생', birthYear: 2011, school: '서울중학교', grade: 9, studentPhone: '010-1234-5678', guardianPhone: '010-2222-3333' };
const create = (overrides = {}, now = NOW) => applyEduAction(normalizeEdu(), { type: 'student.save', values: { ...values, ...overrides } }, { now, actor: 'account-1' });
const saveProfile = (edu, patch, now = NOW) => {
  const student = edu.students[0];
  return applyEduAction(edu, { type: 'student.save', id: student.id, values: { ...student, grade: currentGrade(student, now), ...patch } }, { now, actor: 'account-1' });
};
const consultationValues = (edu, patch = {}) => ({ studentId: edu.students[0].id, title: '학습 상담', date: '2026-10-12', time: '16:30', notes: '진도 확인', status: 'scheduled', ...patch });

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('Seoul date, year and counting age change together at Seoul midnight', () => {
  const before = new Date('2026-12-31T14:59:59.999Z');
  const after = new Date('2026-12-31T15:00:00.000Z');
  assert.equal(seoulDateKey(before), '2026-12-31');
  assert.equal(seoulDateKey(after), '2027-01-01');
  assert.equal(seoulYear(after), 2027);
  assert.equal(countingAge(2011, before), 16);
  assert.equal(countingAge('2011', after), 17);
  for (const value of ['', 2028, '2e3', null, 1899, 2000.5]) assert.equal(countingAge(value, after), null);
  assert.throws(() => seoulDateKey(new Date('invalid')), /날짜/);
});

test('grade options cover primary through graduation and never regress before the anchor', () => {
  assert.equal(EDU_VERSION, 1);
  assert.equal(GRADE_OPTIONS.length, 13);
  assert.deepEqual(GRADE_OPTIONS.filter((item) => [1, 6, 7, 9, 10, 12, 13].includes(item.value)).map((item) => item.label), ['초1', '초6', '중1', '중3', '고1', '고3', '졸업']);
  assert.equal(gradeLabel(0), '미정');
  const student = create().students[0];
  assert.equal(currentGrade(student, new Date('2020-01-01T00:00:00Z')), 9);
  assert.equal(currentGrade(student, new Date('2027-01-01T00:00:00Z')), 10);
  assert.equal(currentGrade(student, new Date('2030-01-01T00:00:00Z')), 13);
});

test('registration stores a stable complete profile and atomic creation history without mutating inputs', () => {
  const blank = freeze(normalizeEdu());
  const input = freeze({ ...values, name: '  김원생  ', studentPhone: undefined, guardianPhone: undefined });
  const edu = applyEduAction(blank, { type: 'student.save', values: input }, options);
  const student = edu.students[0];
  assert.equal(blank.students.length, 0);
  assert.equal(student.name, '김원생');
  assert.equal(student.studentPhone, '');
  assert.equal(student.guardianPhone, '');
  assert.equal(student.memo, '');
  assert.deepEqual(student.academic, { referenceGrade: 9, referenceYear: 2026, referenceId: student.academic.referenceId });
  assert.match(student.id, /^[0-9a-f-]{36}$/);
  assert.equal(student.createdAt, NOW.toISOString());
  assert.equal(edu.events[0].studentId, student.id);
  assert.equal(edu.events[0].type, 'student.created');
  assert.equal(edu.events[0].actor, 'account-1');
  assert.deepEqual(edu.events[0].changes.find((item) => item.field === 'name'), { field: 'name', before: null, after: '김원생' });
  assert.strictEqual(normalizeEdu(edu), edu);
});

test('catch-up promotions are deterministic across tabs, bounded by graduation and immutable', () => {
  const original = freeze(create());
  const future = new Date('2035-01-01T00:00:00Z');
  const promoted = reconcilePromotions(original, future);
  const again = reconcilePromotions(original, future);
  assert.deepEqual(promoted, again);
  assert.equal(original.events.length, 1);
  const events = promoted.events.filter((event) => event.type === 'promotion.auto');
  assert.deepEqual(events.map((event) => event.changes[0]), [
    { field: 'grade', before: 9, after: 10 }, { field: 'grade', before: 10, after: 11 },
    { field: 'grade', before: 11, after: 12 }, { field: 'grade', before: 12, after: 13 },
  ]);
  assert.equal(events[0].at, '2026-12-31T15:00:00.000Z');
  assert.equal(events[0].id, `promotion:${original.students[0].id}:${original.students[0].academic.referenceId}:2027`);
  assert.ok(events.every((event) => event.actor === 'system'));
  assert.strictEqual(reconcilePromotions(promoted, future), promoted);
  assert.equal(currentGrade(promoted.students[0], future), 13);
  const graduated = create({ grade: 13 });
  assert.strictEqual(reconcilePromotions(graduated, future), graduated);
});

test('year-boundary catch-up and manual no-op preserve identity when there is nothing to save', () => {
  const edu = create();
  assert.strictEqual(reconcilePromotions(edu, new Date('2026-12-31T14:59:59Z')), edu);
  const jan = new Date('2026-12-31T15:00:00Z');
  const promoted = reconcilePromotions(edu, jan);
  assert.equal(promoted.events.length, 2);
  assert.strictEqual(saveProfile(edu, {}), edu);
  assert.strictEqual(saveProfile(promoted, {}, jan), promoted);
  const direct = saveProfile(edu, {}, jan);
  assert.equal(direct.events.length, 2);
  assert.equal(direct.events.at(-1).type, 'promotion.auto');
});

test('only middle-school to high-school creates an alert and confirmation preserves the school', () => {
  const future = new Date('2030-10-11T00:00:00Z');
  const edu = reconcilePromotions(create({ grade: 6 }), future);
  const id = edu.students[0].id;
  assert.equal(pendingTransitions(edu, id).length, 1);
  const onlyMiddle = reconcilePromotions(create({ grade: 6 }), new Date('2027-10-11T00:00:00Z'));
  assert.equal(pendingTransitions(onlyMiddle, onlyMiddle.students[0].id).length, 0);
  const onlyGraduation = reconcilePromotions(create({ grade: 12 }), future);
  assert.equal(pendingTransitions(onlyGraduation, onlyGraduation.students[0].id).length, 0);
  const confirmed = applyEduAction(edu, { type: 'promotion.confirm', studentId: id }, { now: future });
  assert.equal(pendingTransitions(confirmed, id).length, 0);
  assert.equal(confirmed.students[0].school, '서울중학교');
  assert.deepEqual(confirmed.events.at(-1).promotionIds, pendingTransitions(edu, id).map((item) => item.id));
  assert.strictEqual(applyEduAction(confirmed, { type: 'promotion.confirm', studentId: id }, { now: future }), confirmed);
  assert.equal(pendingTransitions(normalizeEdu(JSON.parse(JSON.stringify(confirmed))), id).length, 0);
});

test('confirmation catches an unrecorded annual transition and confirmation stays scoped to its student', () => {
  const original = create();
  const second = applyEduAction(original, { type: 'student.save', values: { ...values, name: '이원생' } }, options);
  const future = new Date('2027-01-01T00:00:00Z');
  const firstId = second.students[0].id;
  const secondId = second.students[1].id;
  const confirmed = applyEduAction(second, { type: 'promotion.confirm', studentId: firstId }, { now: future });
  assert.equal(pendingTransitions(confirmed, firstId).length, 0);
  assert.equal(pendingTransitions(confirmed, secondId).length, 1);
  assert.equal(confirmed.events.filter((event) => event.type === 'promotion.auto').length, 2);
  assert.equal(confirmed.events.at(-1).type, 'promotion.confirmed');
  const directHigh = saveProfile(original, { grade: 10 });
  assert.equal(pendingTransitions(directHigh, firstId).length, 0);
});

test('profile edits log exact changed values and resetting grade creates a fresh current-year anchor', () => {
  const initial = create();
  const future = new Date('2028-10-11T00:00:00Z');
  const promoted = reconcilePromotions(initial, future);
  const renamed = saveProfile(promoted, { name: '김학생', school: '서울고등학교' }, future);
  assert.strictEqual(renamed.students[0].academic, initial.students[0].academic);
  assert.equal(renamed.students[0].id, initial.students[0].id);
  assert.deepEqual(renamed.events.at(-1).changes, [
    { field: 'name', before: '김원생', after: '김학생' }, { field: 'school', before: '서울중학교', after: '서울고등학교' },
  ]);
  const corrected = saveProfile(renamed, { grade: 10 }, future);
  assert.equal(corrected.students[0].academic.referenceYear, 2028);
  assert.equal(corrected.students[0].academic.referenceGrade, 10);
  assert.notEqual(corrected.students[0].academic.referenceId, initial.students[0].academic.referenceId);
  assert.deepEqual(corrected.events.at(-1).changes, [{ field: 'grade', before: 11, after: 10 }]);
  assert.equal(currentGrade(corrected.students[0], new Date('2029-01-01T00:00:00Z')), 11);
  assert.equal(reconcilePromotions(corrected, new Date('2029-01-01T00:00:00Z')).events.at(-1).changes[0].after, 11);
});

test('memo saves preserve whitespace and record only explicit changed saves', () => {
  const edu = freeze(create());
  const action = { type: 'memo.save', studentId: edu.students[0].id, memo: '  상담 후 기록\n두 번째 줄  ' };
  const saved = applyEduAction(edu, action, options);
  assert.equal(saved.students[0].memo, action.memo);
  assert.equal(edu.students[0].memo, '');
  assert.deepEqual(saved.events.at(-1).changes, [{ field: 'memo', before: '', after: action.memo }]);
  assert.strictEqual(applyEduAction(saved, action, options), saved);
});

test('consultation creation, edits and status changes save their history atomically', () => {
  const edu = freeze(create());
  const created = applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu) }, options);
  const consultation = created.consultations[0];
  assert.equal(created.events.at(-1).consultationId, consultation.id);
  assert.equal(created.events.at(-1).type, 'consultation.created');
  assert.equal(edu.consultations.length, 0);
  assert.strictEqual(applyEduAction(created, { type: 'consultation.save', id: consultation.id, values: consultationValues(created) }, options), created);
  const updated = applyEduAction(created, { type: 'consultation.save', id: consultation.id, values: consultationValues(created, { time: '18:00', notes: '변경 기록' }) }, options);
  assert.equal(updated.consultations[0].id, consultation.id);
  assert.deepEqual(updated.events.at(-1).changes, [{ field: 'time', before: '16:30', after: '18:00' }, { field: 'notes', before: '진도 확인', after: '변경 기록' }]);
  const completed = applyEduAction(updated, { type: 'consultation.status', id: consultation.id, status: 'completed' }, options);
  assert.deepEqual(completed.events.at(-1).changes, [{ field: 'status', before: 'scheduled', after: 'completed' }]);
  assert.strictEqual(applyEduAction(completed, { type: 'consultation.status', id: consultation.id, status: 'completed' }, options), completed);
  const cancelled = applyEduAction(completed, { type: 'consultation.status', id: consultation.id, status: 'cancelled' }, options);
  assert.equal(cancelled.consultations[0].status, 'cancelled');
});

test('completing a consultation requires notes and consultations can be deleted', () => {
  const edu = freeze(create());
  const created = applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu, { notes: '  ' }) }, options);
  const id = created.consultations[0].id;
  assert.throws(() => applyEduAction(created, { type: 'consultation.status', id, status: 'completed' }, options), /상담 내용을 입력/);
  assert.throws(() => applyEduAction(created, { type: 'consultation.save', id, values: consultationValues(created, { notes: '', status: 'completed' }) }, options), /상담 내용을 입력/);
  const completed = applyEduAction(created, { type: 'consultation.save', id, values: consultationValues(created, { notes: '결과 기록', status: 'completed' }) }, options);
  assert.equal(completed.consultations[0].status, 'completed');
  // Older completed consultations without notes stay editable.
  const legacy = freeze({ ...completed, consultations: [{ ...completed.consultations[0], notes: '' }] });
  assert.equal(applyEduAction(legacy, { type: 'consultation.save', id, values: consultationValues(legacy, { notes: '', status: 'completed', time: '17:00' }) }, options).consultations[0].time, '17:00');
  const deleted = applyEduAction(completed, { type: 'consultation.delete', id }, options);
  assert.equal(deleted.consultations.length, 0);
  assert.equal(deleted.events.at(-1).type, 'consultation.deleted');
  assert.equal(deleted.events.at(-1).consultationId, id);
  assert.throws(() => applyEduAction(deleted, { type: 'consultation.delete', id }, options), /상담을 찾을 수 없습니다/);
});

test('withdrawing a student keeps all records and can be undone', () => {
  const edu = freeze(create());
  const student = edu.students[0];
  const withConsultation = applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu) }, options);
  const withdrawn = applyEduAction(withConsultation, { type: 'student.withdraw', id: student.id }, options);
  assert.ok(withdrawn.students[0].withdrawnAt);
  assert.equal(withdrawn.students[0].name, student.name);
  assert.equal(withdrawn.consultations.length, withConsultation.consultations.length);
  assert.equal(withdrawn.events.at(-1).type, 'student.withdrawn');
  assert.strictEqual(applyEduAction(withdrawn, { type: 'student.withdraw', id: student.id }, options), withdrawn);
  const returned = applyEduAction(withdrawn, { type: 'student.withdraw', id: student.id, withdrawn: false }, options);
  assert.equal('withdrawnAt' in returned.students[0], false);
  assert.equal(returned.events.at(-1).type, 'student.returned');
  assert.equal(edu.students[0].withdrawnAt, undefined, 'input stays untouched');
});

test('failed optimistic creation can be retried with stable IDs without duplicating entities or events', () => {
  const studentId = globalThis.crypto.randomUUID();
  const action = { type: 'student.save', createId: studentId, values };
  // The dashboard keeps this state after its durable write fails.
  const optimistic = applyEduAction(normalizeEdu(), action, options);
  const retried = applyEduAction(optimistic, action, options);
  assert.strictEqual(retried, optimistic);
  assert.equal(retried.students.length, 1);
  assert.equal(retried.students[0].id, studentId);
  assert.equal(retried.events.filter((event) => event.type === 'student.created').length, 1);

  const changed = applyEduAction(retried, { ...action, values: { ...values, name: '김학생' } }, options);
  assert.equal(changed.students.length, 1);
  assert.equal(changed.students[0].id, studentId);
  assert.equal(changed.students[0].name, '김학생');
  assert.equal(changed.events.filter((event) => event.type === 'student.created').length, 1);
  assert.deepEqual(changed.events.at(-1).changes, [{ field: 'name', before: '김원생', after: '김학생' }]);

  const consultationId = globalThis.crypto.randomUUID();
  const consultationAction = { type: 'consultation.save', createId: consultationId, values: consultationValues(changed) };
  const scheduled = applyEduAction(changed, consultationAction, options);
  assert.strictEqual(applyEduAction(scheduled, consultationAction, options), scheduled);
  const moved = applyEduAction(scheduled, { ...consultationAction, values: { ...consultationAction.values, time: '17:00' } }, options);
  assert.equal(moved.consultations.length, 1);
  assert.equal(moved.consultations[0].id, consultationId);
  assert.equal(moved.consultations[0].time, '17:00');
  assert.equal(moved.events.filter((event) => event.type === 'consultation.created').length, 1);
  assert.deepEqual(moved.events.at(-1).changes, [{ field: 'time', before: '16:30', after: '17:00' }]);
});

test('stable creation IDs are validated and cannot be combined with edit IDs', () => {
  const edu = create();
  for (const createId of ['', ' bad ', null, 123]) {
    assert.throws(() => applyEduAction(edu, { type: 'student.save', createId, values }, options), /등록 ID/);
    assert.throws(() => applyEduAction(edu, { type: 'consultation.save', createId, values: consultationValues(edu) }, options), /등록 ID/);
  }
  assert.throws(() => applyEduAction(edu, { type: 'student.save', id: edu.students[0].id, createId: globalThis.crypto.randomUUID(), values }, options), /동시에/);
  assert.throws(() => applyEduAction(edu, { type: 'consultation.save', id: 'edit', createId: globalThis.crypto.randomUUID(), values: consultationValues(edu) }, options), /동시에/);
});

test('invalid profile, date, time, status and targets are rejected without altering saved data', () => {
  const edu = freeze(create());
  for (const patch of [{ name: ' ' }, { school: '' }, { birthYear: 2027 }, { birthYear: 1899 }, { grade: 0 }, { grade: 14 }, { studentPhone: 123 }]) {
    assert.throws(() => applyEduAction(edu, { type: 'student.save', values: { ...values, ...patch } }, options), TypeError);
  }
  for (const date of ['2026-02-29', '2026-04-31', '2026-1-1', 'invalid']) {
    assert.throws(() => applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu, { date }) }, options), /날짜/);
  }
  for (const time of ['24:00', '12:60', '9:00', '12:30:00', '']) {
    assert.throws(() => applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu, { time }) }, options), /시간/);
  }
  assert.doesNotThrow(() => applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu, { date: '2028-02-29' }) }, options));
  assert.throws(() => applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu, { status: 'pending' }) }, options), /상태/);
  assert.throws(() => applyEduAction(edu, { type: 'memo.save', studentId: 'missing', memo: '' }, options), /원생/);
  assert.throws(() => applyEduAction(edu, { type: 'student.save', id: 'missing', values }, options), /원생/);
  assert.throws(() => applyEduAction(edu, { type: 'consultation.status', id: 'missing', status: 'completed' }, options), /상담/);
  assert.throws(() => applyEduAction(edu, { type: 'unknown' }, options), /알 수 없는/);
  assert.equal(edu.events.length, 1);
});

test('normalization migrates missing Edu and backup round trips preserve unknown fields and histories', () => {
  assert.deepEqual(normalizeEdu(), { version: 1, students: [], consultations: [], events: [], admissions: [] });
  assert.deepEqual(normalizeEdu(null), normalizeEdu());
  let edu = create();
  edu = applyEduAction(edu, { type: 'memo.save', studentId: edu.students[0].id, memo: '기록' }, options);
  edu = applyEduAction(edu, { type: 'consultation.save', values: consultationValues(edu) }, options);
  edu = reconcilePromotions(edu, new Date('2028-10-11T00:00:00Z'));
  const extended = { ...edu, futureField: { preserve: true }, students: edu.students.map((student) => ({ ...student, futureProfile: 'retained' })) };
  const restored = normalizeEdu(JSON.parse(JSON.stringify(extended)));
  assert.deepEqual(restored, extended);
  assert.strictEqual(reconcilePromotions(restored, new Date('2028-10-11T00:00:00Z')), restored);
});

test('normalization refuses malformed or future payloads rather than silently dropping records', () => {
  for (const invalid of [[], 'text', {}, { version: 2, students: [], consultations: [], events: [] }, { version: 1, students: [], consultations: null, events: [] }]) {
    assert.throws(() => normalizeEdu(invalid), TypeError);
  }
  const edu = create();
  assert.throws(() => normalizeEdu({ ...edu, students: [...edu.students, edu.students[0]] }), /중복/);
  assert.throws(() => normalizeEdu({ ...edu, students: [{ ...edu.students[0], academic: { ...edu.students[0].academic, referenceGrade: 20 } }] }), /학년/);
  assert.throws(() => normalizeEdu({ ...edu, students: [{ ...edu.students[0], birthYear: '2011' }] }), /출생년도/);
  assert.throws(() => normalizeEdu({ ...edu, events: [{ ...edu.events[0], changes: [{ field: 'name', after: 'new' }] }] }), /변경 전후/);
  assert.throws(() => normalizeEdu({ ...edu, consultations: [{ ...consultationValues(edu), id: 'consultation', studentId: 'missing', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }] }), /원생/);
});
