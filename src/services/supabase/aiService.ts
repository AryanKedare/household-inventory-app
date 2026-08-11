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

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabaseClient().functions.invoke('household-ai', { body });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Supabase returned an invalid AI response.');
  if (typeof data.error === 'string') throw new Error(data.error);
  return data as T;
}

export function suggestExpenseCategory(input: {
  householdId: string;
  title: string;
  merchantName?: string;
  notes?: string;
  lineDescriptions?: string[];
}): Promise<SuggestedCategory> {
  return invoke<SuggestedCategory>({ action: 'category', ...input });
}

export function analyzeHouseholdBillText(input: {
  householdId: string;
  billText: string;
}): Promise<BillDraft> {
  return invoke<BillDraft>({ action: 'bill', ...input });
}

export function generateHouseholdAiInsights(householdId: string): Promise<HouseholdAiInsights> {
  return invoke<HouseholdAiInsights>({ action: 'insights', householdId });
}

export function subscribeToHouseholdAiInsights(
  householdId: string,
  period: string,
  onData: (insights: HouseholdAiInsights | null) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const periodStart = `${period}-01`;

  const refresh = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('payload')
        .eq('household_id', householdId)
        .eq('period_start', periodStart)
        .eq('insight_type', 'spending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (active) onData(data?.payload ? data.payload as HouseholdAiInsights : null);
    } catch (error) {
      if (active) onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void refresh();
  const channel = supabase
    .channel(`ai-insights:${householdId}:${period}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_insights', filter: `household_id=eq.${householdId}` }, () => void refresh())
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
