import assert from 'node:assert/strict';
import test from 'node:test';

const DAILY_AI_LIMITS = {
  category: 40,
  bill: 20,
  insights: 5,
} as const;

test('hosted AI keeps the established daily quota contract', () => {
  assert.deepEqual(DAILY_AI_LIMITS, {
    category: 40,
    bill: 20,
    insights: 5,
  });
});
