import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDateInput, parseDateInput } from '../../src/utils/date';

test('formats a date for the purchase date field', () => {
  assert.equal(formatDateInput(new Date(2026, 7, 5, 9, 30)), '2026-08-05');
});

test('parses a valid calendar date to a stable ISO timestamp', () => {
  assert.equal(parseDateInput('2026-08-10'), '2026-08-10T12:00:00.000Z');
});

test('rejects malformed and impossible purchase dates', () => {
  assert.equal(parseDateInput('10/08/2026'), null);
  assert.equal(parseDateInput('2026-02-30'), null);
  assert.equal(parseDateInput(''), null);
});
