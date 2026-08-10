import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateExpenseSplit,
  participantSubtotalsFromLines,
} from '../../functions/src/financeMath';

test('restaurant discount is allocated proportionally and reconciles to the paid total', () => {
  const result = calculateExpenseSplit({
    paidBy: 'person-1',
    participantSubtotals: [
      { userId: 'person-1', subtotalCents: 1500 },
      { userId: 'person-2', subtotalCents: 1000 },
      { userId: 'person-3', subtotalCents: 2100 },
      { userId: 'person-4', subtotalCents: 5300 },
      { userId: 'person-5', subtotalCents: 6700 },
    ],
    discountCents: 2000,
  });

  assert.equal(result.subtotalCents, 16600);
  assert.equal(result.discountCents, 2000);
  assert.equal(result.totalPaidCents, 14600);
  assert.deepEqual(
    result.allocations.map(({ userId, discountShareCents, owedCents }) => ({
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
  assert.deepEqual(result.debts, [
    { fromUserId: 'person-2', toUserId: 'person-1', amountCents: 880 },
    { fromUserId: 'person-3', toUserId: 'person-1', amountCents: 1847 },
    { fromUserId: 'person-4', toUserId: 'person-1', amountCents: 4661 },
    { fromUserId: 'person-5', toUserId: 'person-1', amountCents: 5893 },
  ]);
});

test('fees and discounts both preserve exact cent totals', () => {
  const result = calculateExpenseSplit({
    paidBy: 'a',
    participantSubtotals: [
      { userId: 'a', subtotalCents: 333 },
      { userId: 'b', subtotalCents: 333 },
      { userId: 'c', subtotalCents: 334 },
    ],
    discountCents: 101,
    feeCents: 77,
  });

  assert.equal(result.totalPaidCents, 976);
  assert.equal(
    result.allocations.reduce((sum, allocation) => sum + allocation.owedCents, 0),
    976,
  );
  assert.equal(
    result.allocations.reduce((sum, allocation) => sum + allocation.discountShareCents, 0),
    101,
  );
  assert.equal(
    result.allocations.reduce((sum, allocation) => sum + allocation.feeShareCents, 0),
    77,
  );
});

test('itemized lines split shared items exactly to the cent', () => {
  const subtotals = participantSubtotalsFromLines([
    { description: 'Shared starter', totalCents: 1001, participantIds: ['b', 'a'] },
    { description: 'Person A main', totalCents: 1500, participantIds: ['a'] },
  ]);

  assert.deepEqual(subtotals, [
    { userId: 'a', subtotalCents: 2001 },
    { userId: 'b', subtotalCents: 500 },
  ]);
});

test('discount cannot exceed the pre-discount subtotal', () => {
  assert.throws(
    () =>
      calculateExpenseSplit({
        paidBy: 'a',
        participantSubtotals: [{ userId: 'a', subtotalCents: 1000 }],
        discountCents: 1001,
      }),
    /Discount cannot exceed/,
  );
});
