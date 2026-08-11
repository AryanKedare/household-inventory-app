import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateExpenseSplit,
  participantSubtotalsFromLines,
} from '../../supabase/functions/_shared/financeMath';

test('Supabase Go Dutch applies a bill discount proportionally and exactly', () => {
  const split = calculateExpenseSplit({
    paidBy: 'person-5',
    participantSubtotals: [
      { userId: 'person-1', subtotalCents: 1500 },
      { userId: 'person-2', subtotalCents: 1000 },
      { userId: 'person-3', subtotalCents: 2100 },
      { userId: 'person-4', subtotalCents: 5300 },
      { userId: 'person-5', subtotalCents: 6700 },
    ],
    discountCents: 2000,
  });

  assert.equal(split.subtotalCents, 16600);
  assert.equal(split.totalPaidCents, 14600);
  assert.deepEqual(
    split.allocations.map(({ userId, discountShareCents, owedCents }) => ({
      userId,
      discountShareCents,
      owedCents,
    })),
    [
      { userId: 'person-1', discountShareCents: 181, owedCents: 1319 },
      { userId: 'person-2', discountShareCents: 120, owedCents: 880 },
      { userId: 'person-3', discountShareCents: 253, owedCents: 1847 },
      { userId: 'person-4', discountShareCents: 639, owedCents: 4661 },
      { userId: 'person-5', discountShareCents: 807, owedCents: 5893 },
    ],
  );
  assert.equal(split.allocations.reduce((sum, item) => sum + item.owedCents, 0), 14600);
  assert.deepEqual(split.debts, [
    { fromUserId: 'person-1', toUserId: 'person-5', amountCents: 1319 },
    { fromUserId: 'person-2', toUserId: 'person-5', amountCents: 880 },
    { fromUserId: 'person-3', toUserId: 'person-5', amountCents: 1847 },
    { fromUserId: 'person-4', toUserId: 'person-5', amountCents: 4661 },
  ]);
});

test('Supabase itemized lines split shared items exactly to cents', () => {
  const subtotals = participantSubtotalsFromLines([
    { description: 'Shared starter', totalCents: 1001, participantIds: ['a', 'b', 'c'] },
    { description: 'A meal', totalCents: 1500, participantIds: ['a'] },
  ]);

  assert.deepEqual(subtotals, [
    { userId: 'a', subtotalCents: 1834 },
    { userId: 'b', subtotalCents: 334 },
    { userId: 'c', subtotalCents: 333 },
  ]);
});

test('Supabase finance rejects discounts above subtotal', () => {
  assert.throws(
    () =>
      calculateExpenseSplit({
        paidBy: 'a',
        participantSubtotals: [{ userId: 'a', subtotalCents: 100 }],
        discountCents: 101,
      }),
    /Discount cannot exceed/,
  );
});
