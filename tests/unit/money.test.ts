import assert from 'node:assert/strict';
import test from 'node:test';

import { centsToEuros, eurosToCents, formatMoney } from '../../src/utils/money';

test('currency conversion stores money as integer cents', () => {
  assert.equal(eurosToCents(2.75), 275);
  assert.equal(eurosToCents(10.999), 1100);
  assert.equal(centsToEuros(275), 2.75);
});

test('money formatting defaults to EUR for Ireland', () => {
  const formatted = formatMoney(275);
  assert.match(formatted, /2\.75/);
  assert.match(formatted, /€/);
});
