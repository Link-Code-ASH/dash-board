import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDateMarkers } from '../src/dashboard/model.js';

test('date markers keep a valid start time and drop anything else', () => {
  const markers = normalizeDateMarkers([
    { text: '중간고사', date: '2026-10-20', time: '09:10' },
    { text: '여행', date: '2026-11-07', time: '25:00' },
    { text: '시험', date: '2026-12-05' },
  ]);
  assert.equal(markers.length, 8);
  assert.deepEqual(markers[0], { text: '중간고사', date: '2026-10-20', time: '09:10' });
  assert.equal(markers[1].time, '');
  assert.deepEqual(markers[2], { text: '시험', date: '2026-12-05', time: '' });
});
