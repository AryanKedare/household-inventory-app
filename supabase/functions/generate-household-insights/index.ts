import {
  cleanAiMoney,
  cleanAiString,
  cleanId,
  requireAiAccess,
} from '../_shared/aiSupport.ts';
import {
  EXPENSE_CATEGORY_IDS,
  EXPENSE_CATEGORY_SET,
  type ExpenseCategoryId,
} from '../_shared/financeCategories.ts';
import { GROQ_TEXT_MODEL, requestGroqStructured } from '../_shared/groq.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';

interface GenerateInsightsBody {
  householdId?: unknown;
}

function isExpenseCategory(value: unknown): value is ExpenseCategoryId {
  return typeof value === 'string' && EXPENSE_CATEGORY_SET.has(value);
}

function periodForDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousPeriods(count: number, now = new Date()): string[] {
  const periods: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    periods.push(periodForDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))));
  }
  return periods;
}

function insightSchema() {
  return {
    name: 'household_spending_insights',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        observations: { type: 'array', items: { type: 'string' } },
        overspendRisks: { type: 'array', items: { type: 'string' } },
        savingsOpportunities: { type: 'array', items: { type: 'string' } },
        budgetSuggestions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              categoryId: { type: 'string', enum: [...EXPENSE_CATEGORY_IDS] },
              recommendedLimitCents: { type: 'integer' },
              reason: { type: 'string' },
            },
            required: ['categoryId', 'recommendedLimitCents', 'reason'],
          },
        },
      },
      required: [
        'summary',
        'observations',
        'overspendRisks',
        'savingsOpportunities',
        'budgetSuggestions',
      ],
    },
  };
}

function cleanStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, limit);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as GenerateInsightsBody;
    const householdId = cleanId(body.householdId, 'Household');
    const { user, admin } = await requireAiAccess(req, householdId, 'insights');

    const now = new Date();
    const periods = previousPeriods(6, now);
    const cutoff = `${periods[0]}-01`;
    const periodStarts = periods.map((period) => `${period}-01`);

    const [{ data: expenses, error: expenseError }, { data: budgetRows, error: budgetError }] =
      await Promise.all([
        admin
          .from('expenses')
          .select('expense_date,total_cents,category')
          .eq('household_id', householdId)
          .gte('expense_date', cutoff)
          .order('expense_date', { ascending: true })
          .limit(500),
        admin
          .from('budgets')
          .select('period_start,category,limit_cents')
          .eq('household_id', householdId)
          .in('period_start', periodStarts),
      ]);
    if (expenseError) throw expenseError;
    if (budgetError) throw budgetError;

    const monthlyTotals: Record<string, number> = Object.fromEntries(
      periods.map((period) => [period, 0]),
    );
    const categoryTotals: Record<string, number> = Object.fromEntries(
      EXPENSE_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
    );
    const categoryByMonth: Record<string, Record<string, number>> = Object.fromEntries(
      periods.map((period) => [period, {}]),
    );

    for (const expense of expenses ?? []) {
      const expenseDate = typeof expense.expense_date === 'string' ? expense.expense_date : '';
      const period = expenseDate.slice(0, 7);
      if (!periods.includes(period)) continue;

      const total = cleanAiMoney(expense.total_cents);
      const categoryId = isExpenseCategory(expense.category) ? expense.category : 'other';
      monthlyTotals[period] = (monthlyTotals[period] ?? 0) + total;
      categoryTotals[categoryId] = (categoryTotals[categoryId] ?? 0) + total;
      const monthCategories = categoryByMonth[period] ?? {};
      monthCategories[categoryId] = (monthCategories[categoryId] ?? 0) + total;
      categoryByMonth[period] = monthCategories;
    }

    const budgetsByPeriod = new Map(
      periods.map((period) => [
        period,
        { period, totalLimitCents: 0, categoryLimitsCents: {} as Record<string, number> },
      ] as const),
    );
    for (const row of budgetRows ?? []) {
      const period = typeof row.period_start === 'string' ? row.period_start.slice(0, 7) : '';
      const target = budgetsByPeriod.get(period);
      if (!target) continue;
      const limitCents = cleanAiMoney(row.limit_cents);
      if (row.category === null) {
        target.totalLimitCents = limitCents;
      } else if (isExpenseCategory(row.category)) {
        target.categoryLimitsCents[row.category] = limitCents;
      }
    }

    const aggregate = {
      currency: 'EUR',
      periods,
      expenseCount: expenses?.length ?? 0,
      monthlyTotals,
      categoryTotals,
      categoryByMonth,
      budgets: periods.map((period) => budgetsByPeriod.get(period)),
    };

    const raw = await requestGroqStructured<Record<string, unknown>>({
      schema: insightSchema(),
      system:
        'You are a household budgeting analyst. Analyze only the supplied aggregate household figures. Do not infer personal behavior, income, protected traits, or financial facts that are not present. Identify trends, category pressure and practical household-level savings opportunities. Budget suggestions are advisory and should be grounded in recent spending. Monetary values are integer euro cents.',
      user: JSON.stringify(aggregate),
      maxCompletionTokens: 2200,
    });

    const budgetSuggestions = Array.isArray(raw.budgetSuggestions)
      ? raw.budgetSuggestions.slice(0, 8).flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const data = entry as Record<string, unknown>;
          if (!isExpenseCategory(data.categoryId)) return [];
          const recommendedLimitCents = cleanAiMoney(data.recommendedLimitCents);
          if (recommendedLimitCents <= 0) return [];
          return [
            {
              categoryId: data.categoryId,
              recommendedLimitCents,
              reason: cleanAiString(data.reason, 'Based on recent household spending.', 300),
            },
          ];
        })
      : [];

    const period = periods[periods.length - 1]!;
    const result = {
      period,
      summary: cleanAiString(raw.summary, 'Not enough data for a household summary yet.', 500),
      observations: cleanStringArray(raw.observations, 8),
      overspendRisks: cleanStringArray(raw.overspendRisks, 6),
      savingsOpportunities: cleanStringArray(raw.savingsOpportunities, 6),
      budgetSuggestions,
      model: GROQ_TEXT_MODEL,
    };

    const { error: persistError } = await admin.from('ai_insights').upsert(
      {
        household_id: householdId,
        period_start: `${period}-01`,
        insight_type: 'household_spending',
        model: GROQ_TEXT_MODEL,
        payload: {
          ...result,
          source: { months: periods, expenseCount: expenses?.length ?? 0 },
        },
        generated_by: user.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,period_start,insight_type' },
    );
    if (persistError) throw persistError;

    return jsonResponse(result);
  } catch (error) {
    console.error('generate-household-insights failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to generate insights.' }, 400);
  }
});
