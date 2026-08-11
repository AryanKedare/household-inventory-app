import assert from 'node:assert/strict';
import test from 'node:test';

import { timestampFromDate, timestampFromIso } from '../../src/types/timestamp';

test('timestampFromIso exposes a defensive Date copy', () => {
  const timestamp = timestampFromIso('2026-08-11T10:30:00.000Z');
  const first = timestamp.toDate();
  first.setUTCFullYear(2000);

  assert.equal(timestamp.toDate().toISOString(), '2026-08-11T10:30:00.000Z');
});

test('timestampFromDate copies the input Date', () => {
  const source = new Date('2026-08-11T11:00:00.000Z');
  const timestamp = timestampFromDate(source);
  source.setUTCFullYear(2001);

  assert.equal(timestamp.toDate().toISOString(), '2026-08-11T11:00:00.000Z');
});

test('timestampFromIso rejects invalid values', () => {
  assert.throws(() => timestampFromIso('not-a-date'), /Invalid timestamp/);
});
