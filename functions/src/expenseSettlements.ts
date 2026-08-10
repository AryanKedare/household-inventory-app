import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();
const REGION = 'europe-west1';
const MAX_MONEY_CENTS = 100_000_000;

interface RecordExpenseSettlementRequest {
  householdId?: unknown;
  expenseId?: unknown;
  fromUserId?: unknown;
  amountCents?: unknown;
  note?: unknown;
}

interface ExpenseDebtRecord {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  settledCents: number;
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
  if (!id || id.length > 128 || id.includes('/')) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return id;
}

function cleanAmount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_MONEY_CENTS) {
    throw new HttpsError('invalid-argument', 'Settlement amount must be a positive amount in cents.');
  }
  return value as number;
}

function cleanNote(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Settlement note is invalid.');
  }
  const note = value.trim();
  if (note.length > 300) {
    throw new HttpsError('invalid-argument', 'Settlement note is too long.');
  }
  return note || null;
}

function parseDebts(value: unknown): ExpenseDebtRecord[] {
  if (!Array.isArray(value)) {
    throw new HttpsError('data-loss', 'Expense debt data is unavailable.');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new HttpsError('data-loss', 'Expense debt data is invalid.');
    }
    const data = entry as Record<string, unknown>;
    if (
      typeof data.fromUserId !== 'string' ||
      typeof data.toUserId !== 'string' ||
      !Number.isSafeInteger(data.amountCents) ||
      (data.amountCents as number) < 0
    ) {
      throw new HttpsError('data-loss', 'Expense debt data is invalid.');
    }
    const settledCents =
      Number.isSafeInteger(data.settledCents) &&
      (data.settledCents as number) >= 0 &&
      (data.settledCents as number) <= (data.amountCents as number)
        ? (data.settledCents as number)
        : 0;
    return {
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      amountCents: data.amountCents as number,
      settledCents,
    };
  });
}

export const recordExpenseSettlement = onCall<RecordExpenseSettlementRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const expenseId = cleanId(request.data.expenseId, 'Expense');
    const fromUserId = cleanId(request.data.fromUserId, 'Debtor');
    const amountCents = cleanAmount(request.data.amountCents);
    const note = cleanNote(request.data.note);

    const memberRef = db.doc(`households/${householdId}/members/${uid}`);
    const expenseRef = db.doc(`households/${householdId}/expenses/${expenseId}`);
    const settlementRef = db.collection(`households/${householdId}/settlements`).doc();
    const activityRef = db.collection(`households/${householdId}/activities`).doc();

    const result = await db.runTransaction(async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      const expenseSnapshot = await transaction.get(expenseRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }
      if (!expenseSnapshot.exists) {
        throw new HttpsError('not-found', 'Expense no longer exists.');
      }

      const expense = expenseSnapshot.data();
      if (!expense) {
        throw new HttpsError('data-loss', 'Expense data is unavailable.');
      }
      const debts = parseDebts(expense.debts);
      const debtIndex = debts.findIndex((debt) => debt.fromUserId === fromUserId);
      if (debtIndex < 0) {
        throw new HttpsError('not-found', 'This expense has no debt for that household member.');
      }

      const debt = debts[debtIndex];
      if (!debt) {
        throw new HttpsError('data-loss', 'Expense debt data is unavailable.');
      }
      if (uid !== debt.fromUserId && uid !== debt.toUserId) {
        throw new HttpsError(
          'permission-denied',
          'Only the debtor or the person who is owed can record this repayment.',
        );
      }

      const outstandingCents = debt.amountCents - debt.settledCents;
      if (outstandingCents <= 0) {
        throw new HttpsError('failed-precondition', 'This debt is already fully settled.');
      }
      if (amountCents > outstandingCents) {
        throw new HttpsError(
          'invalid-argument',
          'Settlement amount cannot exceed the outstanding balance.',
        );
      }

      const nextSettledCents = debt.settledCents + amountCents;
      debts[debtIndex] = { ...debt, settledCents: nextSettledCents };
      const remainingCents = debt.amountCents - nextSettledCents;
      const allSettled = debts.every((entry) => entry.settledCents >= entry.amountCents);
      const anySettled = debts.some((entry) => entry.settledCents > 0);
      const settlementStatus = allSettled ? 'settled' : anySettled ? 'partial' : 'open';

      transaction.create(settlementRef, {
        expenseId,
        fromUserId: debt.fromUserId,
        toUserId: debt.toUserId,
        amountCents,
        currency: typeof expense.currency === 'string' ? expense.currency : 'EUR',
        note,
        recordedBy: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(expenseRef, {
        debts,
        settlementStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(activityRef, {
        type: 'expense_settlement_recorded',
        actorId: uid,
        entityId: expenseId,
        metadata: {
          expenseTitle: typeof expense.title === 'string' ? expense.title : 'Household expense',
          settlementId: settlementRef.id,
          fromUserId: debt.fromUserId,
          toUserId: debt.toUserId,
          amountCents,
          remainingCents,
          settlementStatus,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        settlementId: settlementRef.id,
        expenseId,
        fromUserId: debt.fromUserId,
        toUserId: debt.toUserId,
        amountCents,
        settledCents: nextSettledCents,
        remainingCents,
        settlementStatus,
      };
    });

    return result;
  },
);
