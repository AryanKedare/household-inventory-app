import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type FirestoreError,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './client';
import type {
  ExpenseAllocation,
  ExpenseCategoryId,
  ExpenseDebt,
  HouseholdExpense,
  MonthlyBudget,
} from '../../types/domain';

export interface ParticipantSubtotalInput {
  userId: string;
  subtotalCents: number;
}

export interface ExpenseLineInput {
  description: string;
  totalCents: number;
  participantIds: string[];
}

export interface CreateHouseholdExpenseInput {
  householdId: string;
  title: string;
  merchantName?: string;
  categoryId: ExpenseCategoryId;
  paidBy: string;
  expenseDate: string;
  discountCents?: number;
  feeCents?: number;
  participantSubtotals?: ParticipantSubtotalInput[];
  lineItems?: ExpenseLineInput[];
  notes?: string;
}

export interface CreateHouseholdExpenseResult {
  expenseId: string;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalPaidCents: number;
  allocations: ExpenseAllocation[];
  debts: ExpenseDebt[];
}

export interface CategoryBudgetInput {
  categoryId: ExpenseCategoryId;
  limitCents: number;
}

export interface UpsertMonthlyBudgetInput {
  householdId: string;
  period: string;
  totalLimitCents: number;
  categoryLimits: CategoryBudgetInput[];
}

export interface RecordExpenseSettlementInput {
  householdId: string;
  expenseId: string;
  fromUserId: string;
  amountCents: number;
  note?: string;
}

export interface RecordExpenseSettlementResult {
  settlementId: string;
  expenseId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  settledCents: number;
  remainingCents: number;
  settlementStatus: 'partial' | 'settled';
}

function requireServices() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services;
}

export async function createHouseholdExpense(
  input: CreateHouseholdExpenseInput,
): Promise<CreateHouseholdExpenseResult> {
  const call = httpsCallable<CreateHouseholdExpenseInput, CreateHouseholdExpenseResult>(
    requireServices().functions,
    'createHouseholdExpense',
  );
  return (await call(input)).data;
}

export async function upsertMonthlyBudget(input: UpsertMonthlyBudgetInput): Promise<void> {
  const call = httpsCallable<UpsertMonthlyBudgetInput, { success: boolean }>(
    requireServices().functions,
    'upsertMonthlyBudget',
  );
  await call(input);
}

export async function recordExpenseSettlement(
  input: RecordExpenseSettlementInput,
): Promise<RecordExpenseSettlementResult> {
  const call = httpsCallable<RecordExpenseSettlementInput, RecordExpenseSettlementResult>(
    requireServices().functions,
    'recordExpenseSettlement',
  );
  return (await call(input)).data;
}

export function subscribeToHouseholdExpenses(
  householdId: string,
  onData: (expenses: HouseholdExpense[]) => void,
  onError: (error: FirestoreError) => void,
): () => void {
  const { db } = requireServices();
  const expensesQuery = query(
    collection(db, 'households', householdId, 'expenses'),
    orderBy('expenseDate', 'desc'),
    limit(150),
  );

  return onSnapshot(
    expensesQuery,
    (snapshot) => {
      onData(
        snapshot.docs.map((expense) => ({
          id: expense.id,
          ...(expense.data() as Omit<HouseholdExpense, 'id'>),
        })),
      );
    },
    onError,
  );
}

export function subscribeToMonthlyBudget(
  householdId: string,
  period: string,
  onData: (budget: MonthlyBudget | null) => void,
  onError: (error: FirestoreError) => void,
): () => void {
  const { db } = requireServices();
  const budgetRef = doc(db, 'households', householdId, 'budgets', period);
  return onSnapshot(
    budgetRef,
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as Omit<MonthlyBudget, 'id'>) } : null);
    },
    onError,
  );
}
