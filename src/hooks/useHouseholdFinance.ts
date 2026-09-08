import { useEffect, useMemo, useState } from 'react';

import {
  subscribeToHouseholdExpenses,
  subscribeToMonthlyBudget,
} from '../services/supabase/financeService';
import type { ExpenseCategoryId, HouseholdExpense, MonthlyBudget } from '../types/domain';

export function currentBudgetPeriod(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function isInPeriod(expense: HouseholdExpense, period: string): boolean {
  try {
    const date = expense.expenseDate.toDate();
    return currentBudgetPeriod(date) === period;
  } catch {
    return false;
  }
}

export function useHouseholdFinance(householdId: string | null) {
  const period = currentBudgetPeriod();
  const [expenses, setExpenses] = useState<HouseholdExpense[]>([]);
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) {
      setExpenses([]);
      setBudget(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    let expensesReady = false;
    let budgetReady = false;
    const updateReady = () => {
      if (expensesReady && budgetReady) {
        setLoading(false);
      }
    };

    const unsubscribeExpenses = subscribeToHouseholdExpenses(
      householdId,
      (nextExpenses) => {
        expensesReady = true;
        setExpenses(nextExpenses);
        setError(null);
        updateReady();
      },
      () => {
        expensesReady = true;
        setError('Unable to load household expenses.');
        updateReady();
      },
    );
    const unsubscribeBudget = subscribeToMonthlyBudget(
      householdId,
      period,
      (nextBudget) => {
        budgetReady = true;
        setBudget(nextBudget);
        updateReady();
      },
      () => {
        budgetReady = true;
        setError('Unable to load the household budget.');
        updateReady();
      },
    );

    return () => {
      unsubscribeExpenses();
      unsubscribeBudget();
    };
  }, [householdId, period]);

  const monthExpenses = useMemo(
    () => expenses.filter((expense) => isInPeriod(expense, period)),
    [expenses, period],
  );
  const monthSpendCents = useMemo(
    () => monthExpenses.reduce((sum, expense) => sum + expense.totalPaidCents, 0),
    [monthExpenses],
  );
  const categorySpendCents = useMemo(() => {
    const totals: Partial<Record<ExpenseCategoryId, number>> = {};
    for (const expense of monthExpenses) {
      totals[expense.categoryId] = (totals[expense.categoryId] ?? 0) + expense.totalPaidCents;
    }
    return totals;
  }, [monthExpenses]);

  return {
    period,
    expenses,
    monthExpenses,
    monthSpendCents,
    categorySpendCents,
    budget,
    loading,
    error,
  };
}
