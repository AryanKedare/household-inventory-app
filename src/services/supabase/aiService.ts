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
