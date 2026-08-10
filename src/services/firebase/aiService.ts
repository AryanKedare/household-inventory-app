import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './client';
import type { ExpenseCategoryId } from '../../types/domain';

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

function requireServices() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services;
}

export async function suggestExpenseCategory(input: {
  householdId: string;
  title: string;
  merchantName?: string;
  notes?: string;
  lineDescriptions?: string[];
}): Promise<SuggestedCategory> {
  const call = httpsCallable<typeof input, SuggestedCategory>(
    requireServices().functions,
    'suggestExpenseCategory',
  );
  return (await call(input)).data;
}

export async function analyzeHouseholdBillText(input: {
  householdId: string;
  billText: string;
}): Promise<BillDraft> {
  const call = httpsCallable<typeof input, BillDraft>(
    requireServices().functions,
    'analyzeHouseholdBillText',
  );
  return (await call(input)).data;
}

export async function generateHouseholdAiInsights(
  householdId: string,
): Promise<HouseholdAiInsights> {
  const call = httpsCallable<{ householdId: string }, HouseholdAiInsights>(
    requireServices().functions,
    'generateHouseholdAiInsights',
  );
  return (await call({ householdId })).data;
}

export function subscribeToHouseholdAiInsights(
  householdId: string,
  period: string,
  onData: (insights: HouseholdAiInsights | null) => void,
  onError: (error: FirestoreError) => void,
): () => void {
  const { db } = requireServices();
  return onSnapshot(
    doc(db, 'households', householdId, 'aiInsights', period),
    (snapshot) => {
      onData(
        snapshot.exists()
          ? ({ period: snapshot.id, ...snapshot.data() } as HouseholdAiInsights)
          : null,
      );
    },
    onError,
  );
}
