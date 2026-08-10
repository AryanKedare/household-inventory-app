import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  calculateExpenseSplit,
  participantSubtotalsFromLines,
  type ExpenseLineInput,
  type ParticipantSubtotalInput,
} from './financeMath';

const db = getFirestore();
const REGION = 'europe-west1';

export const EXPENSE_CATEGORY_IDS = [
  'groceries',
  'dining_out',
  'rent_mortgage',
  'utilities',
  'household_supplies',
  'transport_commute',
  'fuel',
  'public_transport',
  'electronics',
  'furniture_home',
  'subscriptions',
  'entertainment',
  'health',
  'insurance',
  'childcare',
  'travel',
  'maintenance_repairs',
  'pets',
  'shared_personal',
  'other',
] as const;

type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number];
const EXPENSE_CATEGORY_SET = new Set<string>(EXPENSE_CATEGORY_IDS);

interface CreateHouseholdExpenseRequest {
  householdId?: unknown;
  title?: unknown;
  merchantName?: unknown;
  categoryId?: unknown;
  paidBy?: unknown;
  expenseDate?: unknown;
  discountCents?: unknown;
  feeCents?: unknown;
  participantSubtotals?: unknown;
  lineItems?: unknown;
  notes?: unknown;
}

interface UpsertMonthlyBudgetRequest {
  householdId?: unknown;
  period?: unknown;
  totalLimitCents?: unknown;
  categoryLimits?: unknown;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return auth.uid;
}

function cleanId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }
  const id = value.trim();
  if (id.length === 0 || id.length > 128 || id.includes('/')) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return id;
}

function cleanText(value: unknown, fieldName: string, maxLength: number, required = true): string {
  if (value === undefined || value === null) {
    if (required) {
      throw new HttpsError('invalid-argument', `${fieldName} is required.`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  const text = value.trim();
  if ((required && text.length === 0) || text.length > maxLength) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return text;
}

function cleanMoney(value: unknown, fieldName: string): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 100_000_000) {
    throw new HttpsError('invalid-argument', `${fieldName} must be a non-negative amount in cents.`);
  }
  return value as number;
}

function cleanCategory(value: unknown): ExpenseCategoryId {
  if (typeof value !== 'string' || !EXPENSE_CATEGORY_SET.has(value)) {
    throw new HttpsError('invalid-argument', 'Expense category is invalid.');
  }
  return value as ExpenseCategoryId;
}

function cleanExpenseDate(value: unknown): Timestamp {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Expense date is required.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Expense date is invalid.');
  }
  const now = Date.now();
  const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
  const oneDayAhead = now + 24 * 60 * 60 * 1000;
  if (date.getTime() < fiveYearsAgo || date.getTime() > oneDayAhead) {
    throw new HttpsError('invalid-argument', 'Expense date is outside the allowed range.');
  }
  return Timestamp.fromDate(date);
}

function cleanParticipantSubtotals(value: unknown): ParticipantSubtotalInput[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new HttpsError('invalid-argument', 'Participant subtotals are invalid.');
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new HttpsError('invalid-argument', 'Participant subtotal is invalid.');
    }
    const data = entry as Record<string, unknown>;
    return {
      userId: cleanId(data.userId, 'Participant'),
      subtotalCents: cleanMoney(data.subtotalCents, 'Participant subtotal'),
    };
  });
}

function cleanLineItems(value: unknown): ExpenseLineInput[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new HttpsError('invalid-argument', 'Expense line items are invalid.');
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new HttpsError('invalid-argument', 'Expense line item is invalid.');
    }
    const data = entry as Record<string, unknown>;
    if (!Array.isArray(data.participantIds) || data.participantIds.length === 0 || data.participantIds.length > 20) {
      throw new HttpsError('invalid-argument', 'Every line item needs at least one participant.');
    }
    return {
      description: cleanText(data.description, 'Line item description', 120),
      totalCents: cleanMoney(data.totalCents, 'Line item total'),
      participantIds: data.participantIds.map((participantId) => cleanId(participantId, 'Participant')),
    };
  });
}

export const createHouseholdExpense = onCall<CreateHouseholdExpenseRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const title = cleanText(request.data.title, 'Expense title', 120);
    const merchantName = cleanText(request.data.merchantName, 'Merchant', 120, false);
    const categoryId = cleanCategory(request.data.categoryId);
    const paidBy = cleanId(request.data.paidBy ?? uid, 'Payer');
    const expenseDate = cleanExpenseDate(request.data.expenseDate);
    const discountCents = cleanMoney(request.data.discountCents, 'Discount');
    const feeCents = cleanMoney(request.data.feeCents, 'Fees and tax');
    const notes = cleanText(request.data.notes, 'Notes', 1000, false);
    const directSubtotals = cleanParticipantSubtotals(request.data.participantSubtotals);
    const lineItems = cleanLineItems(request.data.lineItems);

    if ((directSubtotals === null) === (lineItems === null)) {
      throw new HttpsError(
        'invalid-argument',
        'Provide either participant subtotals or itemized expense lines, but not both.',
      );
    }

    let participantSubtotals: ParticipantSubtotalInput[];
    try {
      participantSubtotals = directSubtotals ?? participantSubtotalsFromLines(lineItems ?? []);
    } catch (error) {
      throw new HttpsError(
        'invalid-argument',
        error instanceof Error ? error.message : 'Expense split is invalid.',
      );
    }

    let split;
    try {
      split = calculateExpenseSplit({ paidBy, participantSubtotals, discountCents, feeCents });
    } catch (error) {
      throw new HttpsError(
        'invalid-argument',
        error instanceof Error ? error.message : 'Expense split is invalid.',
      );
    }

    const expenseRef = db.collection(`households/${householdId}/expenses`).doc();
    const activityRef = db.collection(`households/${householdId}/activities`).doc();
    const householdRef = db.doc(`households/${householdId}`);
    const participantIds = split.allocations.map(({ userId }) => userId);
    const requiredMemberIds = [...new Set([uid, paidBy, ...participantIds])];
    const memberRefs = requiredMemberIds.map((userId) =>
      db.doc(`households/${householdId}/members/${userId}`),
    );

    await db.runTransaction(async (transaction) => {
      const householdSnapshot = await transaction.get(householdRef);
      if (!householdSnapshot.exists) {
        throw new HttpsError('not-found', 'Household no longer exists.');
      }

      const memberSnapshots = [];
      for (const memberRef of memberRefs) {
        memberSnapshots.push(await transaction.get(memberRef));
      }
      const memberData = new Map<string, Record<string, unknown>>();
      memberSnapshots.forEach((snapshot, index) => {
        const memberId = requiredMemberIds[index];
        if (!memberId || !snapshot.exists) {
          throw new HttpsError(
            'failed-precondition',
            'Every payer and participant must belong to the household.',
          );
        }
        memberData.set(memberId, snapshot.data() ?? {});
      });
      if (!memberData.has(uid)) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }

      const currency =
        typeof householdSnapshot.data()?.currency === 'string'
          ? householdSnapshot.data()?.currency
          : 'EUR';
      const payerName = memberData.get(paidBy)?.displayName;

      transaction.create(expenseRef, {
        title,
        merchantName: merchantName || null,
        categoryId,
        categorySource: 'manual',
        paidBy,
        paidByName: typeof payerName === 'string' ? payerName : 'Household member',
        participantIds,
        participantSubtotals: split.allocations.map(({ userId, subtotalCents }) => ({
          userId,
          subtotalCents,
        })),
        lineItems: lineItems ?? [],
        subtotalCents: split.subtotalCents,
        discountCents: split.discountCents,
        feeCents: split.feeCents,
        totalPaidCents: split.totalPaidCents,
        allocations: split.allocations,
        debts: split.debts.map((debt) => ({ ...debt, settledCents: 0 })),
        currency,
        expenseDate,
        notes: notes || null,
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.create(activityRef, {
        type: 'expense_created',
        actorId: uid,
        entityId: expenseRef.id,
        metadata: {
          title,
          merchantName: merchantName || null,
          categoryId,
          totalPaidCents: split.totalPaidCents,
          paidBy,
          participantCount: participantIds.length,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      expenseId: expenseRef.id,
      subtotalCents: split.subtotalCents,
      discountCents: split.discountCents,
      feeCents: split.feeCents,
      totalPaidCents: split.totalPaidCents,
      allocations: split.allocations,
      debts: split.debts,
    };
  },
);

function cleanBudgetPeriod(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Budget period must use YYYY-MM.');
  }
  return value;
}

function cleanCategoryLimits(value: unknown): Record<string, number> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!Array.isArray(value) || value.length > EXPENSE_CATEGORY_IDS.length) {
    throw new HttpsError('invalid-argument', 'Category budget limits are invalid.');
  }

  const limits: Record<string, number> = {};
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      throw new HttpsError('invalid-argument', 'Category budget limit is invalid.');
    }
    const data = entry as Record<string, unknown>;
    const categoryId = cleanCategory(data.categoryId);
    limits[categoryId] = cleanMoney(data.limitCents, 'Category budget');
  }
  return limits;
}

export const upsertMonthlyBudget = onCall<UpsertMonthlyBudgetRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const period = cleanBudgetPeriod(request.data.period);
    const totalLimitCents = cleanMoney(request.data.totalLimitCents, 'Monthly budget');
    const categoryLimitsCents = cleanCategoryLimits(request.data.categoryLimits);

    const memberRef = db.doc(`households/${householdId}/members/${uid}`);
    const householdRef = db.doc(`households/${householdId}`);
    const budgetRef = db.doc(`households/${householdId}/budgets/${period}`);

    await db.runTransaction(async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      const householdSnapshot = await transaction.get(householdRef);
      const budgetSnapshot = await transaction.get(budgetRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }
      if (!householdSnapshot.exists) {
        throw new HttpsError('not-found', 'Household no longer exists.');
      }
      const role = memberSnapshot.data()?.role;
      if (role !== 'owner' && role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only household admins can change budgets.');
      }
      const currency =
        typeof householdSnapshot.data()?.currency === 'string'
          ? householdSnapshot.data()?.currency
          : 'EUR';
      const budgetData: Record<string, unknown> = {
        period,
        currency,
        totalLimitCents,
        categoryLimitsCents,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!budgetSnapshot.exists) {
        budgetData.createdAt = FieldValue.serverTimestamp();
      }
      transaction.set(budgetRef, budgetData, { merge: true });
    });

    return { success: true, period, totalLimitCents, categoryLimitsCents };
  },
);
