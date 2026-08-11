import type {
  ExpenseAllocation,
  ExpenseCategoryId,
  ExpenseDebt,
  HouseholdExpense,
  MonthlyBudget,
} from '../../types/domain';
import { timestampFromIso } from '../../types/timestamp';
import { requireSupabaseClient } from './client';

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

interface ExpenseRow {
  id: string;
  title: string;
  merchant: string | null;
  category: ExpenseCategoryId;
  category_source: 'manual' | 'ai' | 'inventory';
  category_confidence: number | string | null;
  paid_by: string;
  paid_by_name: string;
  participant_ids: string[];
  participant_subtotals: ParticipantSubtotalInput[];
  line_items: ExpenseLineInput[];
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  allocations: ExpenseAllocation[];
  currency: string;
  expense_date: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DebtRow {
  expense_id: string;
  debtor_id: string;
  creditor_id: string;
  original_cents: number;
  settled_cents: number;
}

interface BudgetRow {
  id: string;
  period_start: string;
  category: ExpenseCategoryId | null;
  limit_cents: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function mapExpense(row: ExpenseRow, debtRows: DebtRow[]): HouseholdExpense {
  const debts = debtRows.map((debt) => ({
    fromUserId: debt.debtor_id,
    toUserId: debt.creditor_id,
    amountCents: debt.original_cents,
    settledCents: debt.settled_cents,
  }));
  const settlementStatus: HouseholdExpense['settlementStatus'] =
    debts.length === 0 || debts.every((debt) => (debt.settledCents ?? 0) >= debt.amountCents)
      ? 'settled'
      : debts.some((debt) => (debt.settledCents ?? 0) > 0)
        ? 'partial'
        : 'open';

  const confidence = row.category_confidence === null ? null : Number(row.category_confidence);
  return {
    id: row.id,
    title: row.title,
    merchantName: row.merchant,
    categoryId: row.category,
    categorySource: row.category_source,
    categoryConfidence: Number.isFinite(confidence) ? confidence : null,
    paidBy: row.paid_by,
    paidByName: row.paid_by_name,
    participantIds: row.participant_ids,
    participantSubtotals: Array.isArray(row.participant_subtotals) ? row.participant_subtotals : [],
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    feeCents: row.fee_cents,
    totalPaidCents: row.total_cents,
    allocations: Array.isArray(row.allocations) ? row.allocations : [],
    debts,
    settlementStatus,
    currency: row.currency,
    expenseDate: timestampFromIso(`${row.expense_date}T12:00:00.000Z`),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: timestampFromIso(row.created_at),
    updatedAt: timestampFromIso(row.updated_at),
  };
}

async function loadExpenses(householdId: string): Promise<HouseholdExpense[]> {
  const supabase = requireSupabaseClient();
  const [{ data: expenses, error: expenseError }, { data: debts, error: debtError }] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        'id,title,merchant,category,category_source,category_confidence,paid_by,paid_by_name,participant_ids,participant_subtotals,line_items,subtotal_cents,discount_cents,fee_cents,total_cents,allocations,currency,expense_date,notes,created_by,created_at,updated_at',
      )
      .eq('household_id', householdId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(150),
    supabase
      .from('debts')
      .select('expense_id,debtor_id,creditor_id,original_cents,settled_cents')
      .eq('household_id', householdId),
  ]);
  if (expenseError) throw expenseError;
  if (debtError) throw debtError;

  const grouped = new Map<string, DebtRow[]>();
  for (const debt of (debts ?? []) as DebtRow[]) {
    const list = grouped.get(debt.expense_id) ?? [];
    list.push(debt);
    grouped.set(debt.expense_id, list);
  }
  return ((expenses ?? []) as unknown as ExpenseRow[]).map((row) => mapExpense(row, grouped.get(row.id) ?? []));
}

export async function createHouseholdExpense(
  input: CreateHouseholdExpenseInput,
): Promise<CreateHouseholdExpenseResult> {
  const { data, error } = await requireSupabaseClient().functions.invoke('create-expense', { body: input });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid expense response.');
  }
  if (typeof data.error === 'string') throw new Error(data.error);
  if (typeof data.expenseId !== 'string') throw new Error('Supabase response is missing expenseId.');
  return data as CreateHouseholdExpenseResult;
}

export async function upsertMonthlyBudget(input: UpsertMonthlyBudgetInput): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('upsert_monthly_budget', {
    p_household_id: input.householdId,
    p_period: input.period,
    p_total_limit_cents: input.totalLimitCents,
    p_category_limits: input.categoryLimits,
  });
  if (error) throw error;
}

export async function recordExpenseSettlement(
  input: RecordExpenseSettlementInput,
): Promise<RecordExpenseSettlementResult> {
  const { data, error } = await requireSupabaseClient().rpc('record_expense_settlement', {
    p_household_id: input.householdId,
    p_expense_id: input.expenseId,
    p_from_user_id: input.fromUserId,
    p_amount_cents: input.amountCents,
    p_note: input.note?.trim() || null,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid settlement response.');
  }
  return data as RecordExpenseSettlementResult;
}

export function subscribeToHouseholdExpenses(
  householdId: string,
  onData: (expenses: HouseholdExpense[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const refresh = async () => {
    try {
      const expenses = await loadExpenses(householdId);
      if (active) onData(expenses);
    } catch (error) {
      if (active) onError(asError(error));
    }
  };

  void refresh();
  const expenseChannel = supabase
    .channel(`finance-expenses:${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `household_id=eq.${householdId}` },
      () => void refresh(),
    )
    .subscribe();
  const debtChannel = supabase
    .channel(`finance-debts:${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'debts', filter: `household_id=eq.${householdId}` },
      () => void refresh(),
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(expenseChannel);
    void supabase.removeChannel(debtChannel);
  };
}

export function subscribeToMonthlyBudget(
  householdId: string,
  period: string,
  onData: (budget: MonthlyBudget | null) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const periodStart = `${period}-01`;

  const refresh = async () => {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('id,period_start,category,limit_cents,updated_by,created_at,updated_at')
        .eq('household_id', householdId)
        .eq('period_start', periodStart);
      if (error) throw error;
      if (!active) return;
      const rows = (data ?? []) as unknown as BudgetRow[];
      const overall = rows.find((row) => row.category === null);
      if (!overall) {
        onData(null);
        return;
      }
      const categoryLimitsCents: MonthlyBudget['categoryLimitsCents'] = {};
      for (const row of rows) {
        if (row.category) categoryLimitsCents[row.category] = row.limit_cents;
      }
      onData({
        id: overall.id,
        period,
        currency: 'EUR',
        totalLimitCents: overall.limit_cents,
        categoryLimitsCents,
        updatedBy: overall.updated_by,
        createdAt: timestampFromIso(overall.created_at),
        updatedAt: timestampFromIso(overall.updated_at),
      });
    } catch (error) {
      if (active) onError(asError(error));
    }
  };

  void refresh();
  const channel = supabase
    .channel(`finance-budget:${householdId}:${period}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budgets', filter: `household_id=eq.${householdId}` },
      () => void refresh(),
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
