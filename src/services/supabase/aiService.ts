import type { ExpenseCategoryId } from '../../types/domain';
import { requireSupabaseClient } from './client';

export interface SuggestedCategory {
  categoryId: ExpenseCategoryId;
  confidence: number;
  reason: string;
  normalizedTitle: string;
}

export interface BillDraftLine {
  description: string;
  totalCents: number;
  participantIds: string[];
  participantAliases: string[];
}

export interface BillDraft {
  title: string;
  merchantName: string;
  categoryId: ExpenseCategoryId;
  discountCents: number;
  feeCents: number;
  statedTotalCents: number;
  calculatedTotalCents: number;
  lineItems: BillDraftLine[];
  warnings: string[];
  requiresReview: boolean;
}

export interface HouseholdAiInsights {
  period: string;
  summary: string;
  observations: string[];
  overspendRisks: string[];
  savingsOpportunities: string[];
  budgetSuggestions: Array<{
    categoryId: ExpenseCategoryId;
    recommendedLimitCents: number;
    reason: string;
  }>;
  model: string;
}

function responseObject(data: unknown, label: string): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Supabase returned an invalid ${label} response.`);
  }
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string') throw new Error(record.error);
  return record;
}

export async function suggestExpenseCategory(input: {
  householdId: string;
  title: string;
  merchantName?: string;
  notes?: string;
  lineDescriptions?: string[];
}): Promise<SuggestedCategory> {
  const result = await requireSupabaseClient().functions.invoke('suggest-expense-category', {
    body: input,
  });
  if (result.error) throw result.error;
  return responseObject(result.data, 'category suggestion') as unknown as SuggestedCategory;
}

export async function analyzeHouseholdBillText(input: {
  householdId: string;
  billText: string;
}): Promise<BillDraft> {
  const result = await requireSupabaseClient().functions.invoke('analyze-household-bill', {
    body: input,
  });
  if (result.error) throw result.error;
  return responseObject(result.data, 'bill analysis') as unknown as BillDraft;
}

export async function generateHouseholdAiInsights(
  householdId: string,
): Promise<HouseholdAiInsights> {
  const result = await requireSupabaseClient().functions.invoke('generate-household-insights', {
    body: { householdId },
  });
  if (result.error) throw result.error;
  return responseObject(result.data, 'household insight') as unknown as HouseholdAiInsights;
}

interface InsightRow {
  payload: unknown;
  model: string | null;
}

function mapInsight(row: InsightRow | null, period: string): HouseholdAiInsights | null {
  if (!row || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    return null;
  }
  const payload = row.payload as Record<string, unknown>;
  if (typeof payload.summary !== 'string') return null;
  return {
    ...(payload as unknown as HouseholdAiInsights),
    period: typeof payload.period === 'string' ? payload.period : period,
    model: typeof payload.model === 'string' ? payload.model : row.model ?? '',
  };
}

async function loadHouseholdAiInsights(
  householdId: string,
  period: string,
): Promise<HouseholdAiInsights | null> {
  const result = await requireSupabaseClient()
    .from('ai_insights')
    .select('payload,model')
    .eq('household_id', householdId)
    .eq('period_start', `${period}-01`)
    .eq('insight_type', 'household_spending')
    .maybeSingle();
  if (result.error) throw result.error;
  return mapInsight((result.data as InsightRow | null) ?? null, period);
}

export function subscribeToHouseholdAiInsights(
  householdId: string,
  period: string,
  onData: (insights: HouseholdAiInsights | null) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;

  const refresh = () => {
    void loadHouseholdAiInsights(householdId, period)
      .then((insights) => {
        if (active) onData(insights);
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const channel = supabase
    .channel(`household-ai:${householdId}:${period}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ai_insights',
        filter: `household_id=eq.${householdId}`,
      },
      refresh,
    )
    .subscribe((status) => {
      if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        onError(new Error(`Supabase AI realtime channel ${status.toLowerCase()}.`));
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
