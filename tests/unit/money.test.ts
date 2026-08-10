import assert from 'node:assert/strict';
import test from 'node:test';

import { centsToEuros, eurosToCents, formatMoney, parseDecimalInput } from '../../src/utils/money';

test('currency conversion stores money as integer cents', () => {
  assert.equal(eurosToCents(2.75), 275);
  assert.equal(eurosToCents(10.999), 1100);
  assert.equal(centsToEuros(275), 2.75);
});

test('decimal input accepts dot and comma separators', () => {
  assert.equal(parseDecimalInput('2.75'), 2.75);
  assert.equal(parseDecimalInput('2,75'), 2.75);
  assert.equal(parseDecimalInput(' 10,50 '), 10.5);
  assert.equal(Number.isNaN(parseDecimalInput('invalid')), true);
});

test('blank decimal input is invalid instead of silently becoming zero', () => {
  assert.equal(Number.isNaN(parseDecimalInput('')), true);
  assert.equal(Number.isNaN(parseDecimalInput('   ')), true);
});

test('money formatting defaults to EUR for Ireland', () => {
  const formatted = formatMoney(275);
  assert.match(formatted, /2\.75/);
  assert.match(formatted, /€/);
});
