export interface ParticipantSubtotalInput {
  userId: string;
  subtotalCents: number;
}

export interface ExpenseLineInput {
  description: string;
  totalCents: number;
  participantIds: string[];
}

export interface ExpenseAllocation {
  userId: string;
  subtotalCents: number;
  discountShareCents: number;
  feeShareCents: number;
  owedCents: number;
}

export interface ExpenseDebt {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface ExpenseSplitResult {
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalPaidCents: number;
  allocations: ExpenseAllocation[];
  debts: ExpenseDebt[];
}

const MAX_EXPENSE_CENTS = 100_000_000;

function assertMoney(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_EXPENSE_CENTS) {
    throw new Error(`${field} must be a non-negative integer amount in cents.`);
  }
}

function allocateIntegerAmount(
  amountCents: number,
  weights: Array<{ id: string; weight: number }>,
): Map<string, number> {
  assertMoney(amountCents, 'Amount');
  const result = new Map<string, number>();
  for (const { id } of weights) result.set(id, 0);
  if (amountCents === 0 || weights.length === 0) return result;

  const positive = weights.filter(({ weight }) => Number.isSafeInteger(weight) && weight > 0);
  const totalWeight = positive.reduce((sum, { weight }) => sum + BigInt(weight), 0n);
  if (totalWeight <= 0n) throw new Error('Cannot allocate a positive amount without positive weights.');

  const ranked = positive.map(({ id, weight }) => {
    const numerator = BigInt(amountCents) * BigInt(weight);
    const base = numerator / totalWeight;
    const remainder = numerator % totalWeight;
    result.set(id, Number(base));
    return { id, remainder };
  });

  let remaining = amountCents - [...result.values()].reduce((sum, value) => sum + value, 0);
  ranked.sort((left, right) => {
    if (right.remainder !== left.remainder) return right.remainder > left.remainder ? 1 : -1;
    return left.id.localeCompare(right.id);
  });

  for (let index = 0; remaining > 0; index += 1) {
    const target = ranked[index % ranked.length];
    if (!target) throw new Error('Unable to finish cent allocation.');
    result.set(target.id, (result.get(target.id) ?? 0) + 1);
    remaining -= 1;
  }
  return result;
}

function splitLineEqually(line: ExpenseLineInput): ParticipantSubtotalInput[] {
  assertMoney(line.totalCents, 'Line total');
  const participantIds = [...new Set(line.participantIds)].sort();
  if (participantIds.length === 0) throw new Error('Every expense line must have at least one participant.');

  const shares = allocateIntegerAmount(
    line.totalCents,
    participantIds.map((id) => ({ id, weight: 1 })),
  );
  return participantIds.map((userId) => ({ userId, subtotalCents: shares.get(userId) ?? 0 }));
}

export function participantSubtotalsFromLines(lines: ExpenseLineInput[]): ParticipantSubtotalInput[] {
  if (lines.length === 0) throw new Error('At least one expense line is required.');
  if (lines.length > 100) throw new Error('An expense can contain at most 100 line items.');

  const totals = new Map<string, number>();
  for (const line of lines) {
    if (typeof line.description !== 'string' || line.description.trim().length === 0) {
      throw new Error('Every expense line requires a description.');
    }
    for (const share of splitLineEqually(line)) {
      const next = (totals.get(share.userId) ?? 0) + share.subtotalCents;
      if (!Number.isSafeInteger(next) || next > MAX_EXPENSE_CENTS) {
        throw new Error('Expense subtotal exceeds the supported maximum.');
      }
      totals.set(share.userId, next);
    }
  }

  return [...totals.entries()]
    .map(([userId, subtotalCents]) => ({ userId, subtotalCents }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

export function calculateExpenseSplit(input: {
  paidBy: string;
  participantSubtotals: ParticipantSubtotalInput[];
  discountCents?: number;
  feeCents?: number;
}): ExpenseSplitResult {
  if (!input.paidBy) throw new Error('A payer is required.');

  const merged = new Map<string, number>();
  for (const participant of input.participantSubtotals) {
    if (!participant.userId) throw new Error('Every participant requires a user ID.');
    assertMoney(participant.subtotalCents, 'Participant subtotal');
    const next = (merged.get(participant.userId) ?? 0) + participant.subtotalCents;
    if (!Number.isSafeInteger(next) || next > MAX_EXPENSE_CENTS) {
      throw new Error('Participant subtotal exceeds the supported maximum.');
    }
    merged.set(participant.userId, next);
  }

  const subtotals = [...merged.entries()]
    .filter(([, subtotalCents]) => subtotalCents > 0)
    .map(([userId, subtotalCents]) => ({ userId, subtotalCents }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
  if (subtotals.length === 0) throw new Error('At least one participant must have a positive subtotal.');

  const subtotalCents = subtotals.reduce((sum, participant) => sum + participant.subtotalCents, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > MAX_EXPENSE_CENTS) {
    throw new Error('Expense subtotal exceeds the supported maximum.');
  }

  const discountCents = input.discountCents ?? 0;
  const feeCents = input.feeCents ?? 0;
  assertMoney(discountCents, 'Discount');
  assertMoney(feeCents, 'Fees and tax');
  if (discountCents > subtotalCents) throw new Error('Discount cannot exceed the pre-discount subtotal.');

  const totalPaidCents = subtotalCents - discountCents + feeCents;
  if (!Number.isSafeInteger(totalPaidCents) || totalPaidCents > MAX_EXPENSE_CENTS) {
    throw new Error('Paid total exceeds the supported maximum.');
  }

  const weights = subtotals.map(({ userId, subtotalCents: weight }) => ({ id: userId, weight }));
  const discountShares = allocateIntegerAmount(discountCents, weights);
  const feeShares = allocateIntegerAmount(feeCents, weights);

  const allocations = subtotals.map(({ userId, subtotalCents: participantSubtotal }) => {
    const discountShareCents = discountShares.get(userId) ?? 0;
    const feeShareCents = feeShares.get(userId) ?? 0;
    return {
      userId,
      subtotalCents: participantSubtotal,
      discountShareCents,
      feeShareCents,
      owedCents: participantSubtotal - discountShareCents + feeShareCents,
    };
  });

  if (allocations.reduce((sum, allocation) => sum + allocation.owedCents, 0) !== totalPaidCents) {
    throw new Error('Expense allocation did not reconcile to the paid total.');
  }

  const debts = allocations
    .filter(({ userId, owedCents }) => userId !== input.paidBy && owedCents > 0)
    .map(({ userId, owedCents }) => ({ fromUserId: userId, toUserId: input.paidBy, amountCents: owedCents }));

  return { subtotalCents, discountCents, feeCents, totalPaidCents, allocations, debts };
}
