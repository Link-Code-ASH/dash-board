import test from 'node:test';
import assert from 'node:assert/strict';
import { readCalendarEntries, writeCalendarEntries, sortCalendarItems } from '../src/dashboard/calendarEntries.js';
import { createBackupPayload, splitBackupPayload, normalizeState, getWeekdayKey, getWeekSerial, weekDays } from '../src/dashboard/model.js';
import { mergeDashboard } from '../src/hub/merge.js';
import { applyEduAction, normalizeEdu } from '../src/edu/model.js';
import { createEduFlowSource } from '../src/edu/flow.js';

const date = '2026-10-11';
const legacy = () => ({ calendar: { [date]: '학교 (14:00)\n\n상담' }, calendarFormats: { [date]: [{ start: 12, end: 14, type: 'blue' }] } });

test('calendar reads never migrate; explicit edits retain original text, blank lines, colors and stable IDs', () => {
  const data = legacy(), before = structuredClone(data);
  const day = readCalendarEntries(data, date);
  assert.deepEqual(data, before);
  assert.equal(day.items.length, 3);
  writeCalendarEntries(data, date, day.items.map((item, index) => ({ ...item, time: index === 0 ? '14:00' : '' })));
  assert.equal(data.calendar[date], before.calendar[date]);
  assert.deepEqual(data.calendarFormats[date], before.calendarFormats[date]);
  assert.deepEqual(data.calendarEntries[date].original, { text: before.calendar[date], marks: before.calendarFormats[date] });
  const restored = normalizeState(splitBackupPayload(JSON.parse(JSON.stringify(createBackupPayload(data, [], null)))).state);
  assert.deepEqual(readCalendarEntries(restored, date).items, data.calendarEntries[date].items);
  assert.equal(readCalendarEntries(restored, date).mismatch, false);
});

test('older-client changes remain recoverable; unsupported versions cannot be initialized or edited', () => {
  const data = legacy();
  writeCalendarEntries(data, date, readCalendarEntries(data, date).items);
  data.calendar[date] = '구버전에서 수정';
  assert.equal(readCalendarEntries(data, date).mismatch, true);
  writeCalendarEntries(data, date, readCalendarEntries(data, date).items);
  assert.equal(data.calendarEntries[date].recovery[0].text, '구버전에서 수정');
  data.calendarEntries[date].version = 999;
  const before = structuredClone(data);
  assert.equal(readCalendarEntries(data, date).unsupported, true);
  assert.throws(() => writeCalendarEntries(data, date, []), /버전/);
  assert.deepEqual(data, before);
});

test('calendar merge keeps text, marks and timed entries together with conflict snapshots', () => {
  const base = legacy();
  writeCalendarEntries(base, date, readCalendarEntries(base, date).items);
  const local = structuredClone(base), remote = structuredClone(base);
  writeCalendarEntries(local, date, readCalendarEntries(local, date).items.map((item) => ({ ...item, time: '10:00' })));
  remote.calendar[date] = '원격 구버전 문구';
  const result = mergeDashboard(base, local, remote);
  assert.deepEqual(result.data.calendarEntries[date], local.calendarEntries[date]);
  assert.equal(result.conflicts[0].remote.text, '원격 구버전 문구');
  assert.ok(result.conflicts[0].relatedPaths.includes(`/calendarEntries/${date}`));
});

test('display order is untimed then time ascending without reordering storage or weekly recurrence', () => {
  const items = [{ id: 'a', time: '18:00' }, { id: 'b', time: '' }, { id: 'c', time: '09:00' }];
  assert.deepEqual(sortCalendarItems(items).map((item) => item.id), ['b', 'c', 'a']);
  assert.deepEqual(items.map((item) => item.id), ['a', 'b', 'c']);
  assert.equal(weekDays[0].key, 'sun');
  assert.equal(getWeekdayKey(date), 'sun');
  assert.equal(getWeekSerial(date), getWeekSerial('2026-10-05'));
});

test('common admissions support inclusive periods and optional first-day time, without student records', () => {
  const options = { now: new Date('2026-10-11T09:00:00+09:00') };
  const values = { title: '원서 접수', institution: '대학', track: '수시', startDate: date, endDate: '2026-10-13', time: '09:00', notes: '준비' };
  let edu = applyEduAction(normalizeEdu(), { type: 'admission.save', createId: 'exam', values }, options);
  assert.strictEqual(normalizeEdu(edu), edu);
  assert.deepEqual(edu.students, []);
  assert.deepEqual(edu.events, []);
  const source = createEduFlowSource({ getEdu: () => edu, subscribe: () => () => {}, save: async () => {} });
  assert.equal(source.getItems(date)[0].time, '09:00');
  assert.equal(source.getItems(date)[0].periodStatus, '시작');
  assert.equal(source.getItems('2026-10-12')[0].time, '');
  assert.equal(source.getItems('2026-10-13')[0].periodStatus, '마감');
  assert.deepEqual(source.getItems('2026-10-14'), []);
  assert.deepEqual(source.openTarget('admission:exam'), { moduleId: 'edu', section: 'admissions:exam' });
  const restored = normalizeState(JSON.parse(JSON.stringify({ edu })));
  assert.equal(restored.edu.admissions[0].id, 'exam');
  edu = applyEduAction(edu, { type: 'admission.delete', id: 'exam' }, options);
  assert.deepEqual(edu.admissions, []);
  assert.throws(() => applyEduAction(edu, { type: 'admission.save', values: { ...values, endDate: '2026-10-10' } }, options), /종료일/);
});
