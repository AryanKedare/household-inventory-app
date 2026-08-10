import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { consumeAiQuota } from './aiQuota';
import {
  EXPENSE_CATEGORY_IDS,
  EXPENSE_CATEGORY_SET,
  type ExpenseCategoryId,
} from './financeCategories';
import { GROQ_API_KEY, GROQ_TEXT_MODEL, requestGroqStructured } from './groqClient';

const db = getFirestore();
const REGION = 'europe-west1';
const MAX_MONEY_CENTS = 100_000_000;

interface SuggestExpenseCategoryRequest {
  householdId?: unknown;
  title?: unknown;
  merchantName?: unknown;
  notes?: unknown;
  lineDescriptions?: unknown;
}

interface AnalyzeBillTextRequest {
  householdId?: unknown;
  billText?: unknown;
}

interface GenerateHouseholdInsightsRequest {
  householdId?: unknown;
}

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
  generatedAt?: unknown;
  model: string;
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

function cleanText(
  value: unknown,
  fieldName: string,
  maxLength: number,
  required = true,
): string {
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

function cleanLineDescriptions(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpsError('invalid-argument', 'Line descriptions are invalid.');
  }
  return value.map((entry) => cleanText(entry, 'Line description', 120));
}

async function requireHouseholdMember(householdId: string, uid: string): Promise<void> {
  const member = await db.doc(`households/${householdId}/members/${uid}`).get();
  if (!member.exists) {
    throw new HttpsError('permission-denied', 'You are not a member of this household.');
  }
}

function isExpenseCategory(value: unknown): value is ExpenseCategoryId {
  return typeof value === 'string' && EXPENSE_CATEGORY_SET.has(value);
}

function cleanAiString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function cleanAiMoney(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_MONEY_CENTS
    ? (value as number)
    : 0;
}

const CATEGORY_SCHEMA = {
  name: 'expense_category_suggestion',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      categoryId: { type: 'string', enum: [...EXPENSE_CATEGORY_IDS] },
      confidence: { type: 'number' },
      reason: { type: 'string' },
      normalizedTitle: { type: 'string' },
    },
    required: ['categoryId', 'confidence', 'reason', 'normalizedTitle'],
  },
};

export const suggestExpenseCategory = onCall<SuggestExpenseCategoryRequest>(
  { region: REGION, enforceAppCheck: false, secrets: [GROQ_API_KEY] },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const title = cleanText(request.data.title, 'Expense title', 120);
    const merchantName = cleanText(request.data.merchantName, 'Merchant', 120, false);
    const notes = cleanText(request.data.notes, 'Notes', 1000, false);
    const lineDescriptions = cleanLineDescriptions(request.data.lineDescriptions);

    await requireHouseholdMember(householdId, uid);
    await consumeAiQuota(uid, 'category');

    const raw = await requestGroqStructured<Record<string, unknown>>({
      schema: CATEGORY_SCHEMA,
      system:
        'You classify household expenses. Choose exactly one provided category. Categorize the real purpose of the expense, not merely the merchant type. Keep the reason concise. Never invent monetary values.',
      user: JSON.stringify({
        categories: EXPENSE_CATEGORY_IDS,
        expense: { title, merchantName, notes, lineDescriptions },
      }),
      maxCompletionTokens: 600,
    });

    const categoryId = isExpenseCategory(raw.categoryId) ? raw.categoryId : 'other';
    const confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0;

    return {
      categoryId,
      confidence,
      reason: cleanAiString(raw.reason, 'AI category suggestion', 240),
      normalizedTitle: cleanAiString(raw.normalizedTitle, title, 120),
    } satisfies SuggestedCategory;
  },
);

interface MemberAlias {
  alias: string;
  userId: string;
  displayName: string;
}

async function householdMemberAliases(householdId: string): Promise<MemberAlias[]> {
  const members = await db.collection(`households/${householdId}/members`).get();
  return members.docs
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((member, index) => ({
      alias: `member_${index + 1}`,
      userId: member.id,
      displayName:
        typeof member.data().displayName === 'string' && member.data().displayName.trim().length > 0
          ? member.data().displayName.trim().slice(0, 80)
          : `Household member ${index + 1}`,
    }));
}

function billSchema(memberAliases: string[]) {
  return {
    name: 'household_bill_draft',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        merchantName: { type: 'string' },
        categoryId: { type: 'string', enum: [...EXPENSE_CATEGORY_IDS] },
        discountCents: { type: 'integer' },
        feeCents: { type: 'integer' },
        statedTotalCents: { type: 'integer' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              description: { type: 'string' },
              totalCents: { type: 'integer' },
              participantAliases: {
                type: 'array',
                items: { type: 'string', enum: memberAliases },
              },
            },
            required: ['description', 'totalCents', 'participantAliases'],
          },
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'title',
        'merchantName',
        'categoryId',
        'discountCents',
        'feeCents',
        'statedTotalCents',
        'lineItems',
        'warnings',
      ],
    },
  };
}

export const analyzeHouseholdBillText = onCall<AnalyzeBillTextRequest>(
  { region: REGION, enforceAppCheck: false, secrets: [GROQ_API_KEY] },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const billText = cleanText(request.data.billText, 'Bill text', 12_000);

    await requireHouseholdMember(householdId, uid);
    await consumeAiQuota(uid, 'bill');
    const roster = await householdMemberAliases(householdId);
    if (roster.length === 0) {
      throw new HttpsError('failed-precondition', 'This household has no members.');
    }
    const aliasMap = new Map(roster.map((member) => [member.alias, member.userId]));

    const raw = await requestGroqStructured<Record<string, unknown>>({
      schema: billSchema(roster.map((member) => member.alias)),
      system:
        'You extract a draft household bill. Monetary values must be integer euro cents. A discount is a bill-level reduction and fees include tax/service/delivery charges that are added after item subtotals. Use only participant aliases from the supplied roster. Assign a participant only when the text clearly identifies that person or clearly states an item is shared. If assignment is uncertain, return an empty participantAliases array and add a warning. Never calculate final per-person debts or distribute the discount; deterministic server code does that after user review. If the bill total is not stated, use 0 for statedTotalCents.',
      user: JSON.stringify({
        roster: roster.map(({ alias, displayName }) => ({ alias, displayName })),
        categories: EXPENSE_CATEGORY_IDS,
        billText,
      }),
      maxCompletionTokens: 3000,
    });

    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings
          .filter((warning): warning is string => typeof warning === 'string')
          .map((warning) => warning.trim().slice(0, 300))
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const rawLines = Array.isArray(raw.lineItems) ? raw.lineItems : [];
    const lineItems: BillDraftLine[] = rawLines.slice(0, 100).flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        warnings.push(`Line ${index + 1} could not be parsed.`);
        return [];
      }
      const data = entry as Record<string, unknown>;
      const totalCents = cleanAiMoney(data.totalCents);
      if (totalCents <= 0) {
        warnings.push(`Line ${index + 1} has no usable amount.`);
        return [];
      }
      const participantAliases = Array.isArray(data.participantAliases)
        ? [...new Set(
            data.participantAliases.filter(
              (alias): alias is string => typeof alias === 'string' && aliasMap.has(alias),
            ),
          )]
        : [];
      if (participantAliases.length === 0) {
        warnings.push(`Review who should share line ${index + 1}.`);
      }
      return [
        {
          description: cleanAiString(data.description, `Bill item ${index + 1}`, 120),
          totalCents,
          participantAliases,
          participantIds: participantAliases.map((alias) => aliasMap.get(alias)!).filter(Boolean),
        },
      ];
    });

    const discountCents = cleanAiMoney(raw.discountCents);
    const feeCents = cleanAiMoney(raw.feeCents);
    const statedTotalCents = cleanAiMoney(raw.statedTotalCents);
    const subtotalCents = lineItems.reduce((sum, line) => sum + line.totalCents, 0);
    const calculatedTotalCents = Math.max(0, subtotalCents - discountCents + feeCents);
    if (statedTotalCents > 0 && Math.abs(statedTotalCents - calculatedTotalCents) > 1) {
      warnings.push(
        `Parsed items calculate to €${(calculatedTotalCents / 100).toFixed(2)}, but the bill states €${(
          statedTotalCents / 100
        ).toFixed(2)}. Review the draft before saving.`,
      );
    }

    return {
      title: cleanAiString(raw.title, 'Household bill', 120),
      merchantName: cleanAiString(raw.merchantName, '', 120),
      categoryId: isExpenseCategory(raw.categoryId) ? raw.categoryId : 'other',
      discountCents,
      feeCents,
      statedTotalCents,
      calculatedTotalCents,
      lineItems,
      warnings: [...new Set(warnings)].slice(0, 20),
      requiresReview:
        lineItems.length === 0 ||
        lineItems.some((line) => line.participantIds.length === 0) ||
        warnings.length > 0,
    } satisfies BillDraft;
  },
);

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
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, limit);
}

export const generateHouseholdAiInsights = onCall<GenerateHouseholdInsightsRequest>(
  { region: REGION, enforceAppCheck: false, secrets: [GROQ_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    await requireHouseholdMember(householdId, uid);
    await consumeAiQuota(uid, 'insights');

    const now = new Date();
    const periods = previousPeriods(6, now);
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const expenseSnapshot = await db
      .collection(`households/${householdId}/expenses`)
      .where('expenseDate', '>=', Timestamp.fromDate(cutoff))
      .orderBy('expenseDate', 'asc')
      .limit(500)
      .get();

    const monthlyTotals: Record<string, number> = Object.fromEntries(periods.map((period) => [period, 0]));
    const categoryTotals: Record<string, number> = Object.fromEntries(
      EXPENSE_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
    );
    const categoryByMonth: Record<string, Record<string, number>> = Object.fromEntries(
      periods.map((period) => [period, {}]),
    );

    for (const expense of expenseSnapshot.docs) {
      const data = expense.data();
      const date = data.expenseDate instanceof Timestamp ? data.expenseDate.toDate() : null;
      const period = date ? periodForDate(date) : null;
      const total = cleanAiMoney(data.totalPaidCents);
      const categoryId = isExpenseCategory(data.categoryId) ? data.categoryId : 'other';
      if (!period || !periods.includes(period)) {
        continue;
      }
      monthlyTotals[period] = (monthlyTotals[period] ?? 0) + total;
      categoryTotals[categoryId] = (categoryTotals[categoryId] ?? 0) + total;
      const monthCategories = categoryByMonth[period] ?? {};
      monthCategories[categoryId] = (monthCategories[categoryId] ?? 0) + total;
      categoryByMonth[period] = monthCategories;
    }

    const budgetSnapshots = await Promise.all(
      periods.map((period) => db.doc(`households/${householdId}/budgets/${period}`).get()),
    );
    const budgets = budgetSnapshots.map((snapshot, index) => ({
      period: periods[index]!,
      totalLimitCents: cleanAiMoney(snapshot.data()?.totalLimitCents),
      categoryLimitsCents:
        snapshot.data()?.categoryLimitsCents && typeof snapshot.data()?.categoryLimitsCents === 'object'
          ? snapshot.data()?.categoryLimitsCents
          : {},
    }));

    const aggregate = {
      currency: 'EUR',
      periods,
      expenseCount: expenseSnapshot.size,
      monthlyTotals,
      categoryTotals,
      categoryByMonth,
      budgets,
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
          if (!entry || typeof entry !== 'object') {
            return [];
          }
          const data = entry as Record<string, unknown>;
          if (!isExpenseCategory(data.categoryId)) {
            return [];
          }
          const recommendedLimitCents = cleanAiMoney(data.recommendedLimitCents);
          if (recommendedLimitCents <= 0) {
            return [];
          }
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
    const result: HouseholdAiInsights = {
      period,
      summary: cleanAiString(raw.summary, 'Not enough data for a household summary yet.', 500),
      observations: cleanStringArray(raw.observations, 8),
      overspendRisks: cleanStringArray(raw.overspendRisks, 6),
      savingsOpportunities: cleanStringArray(raw.savingsOpportunities, 6),
      budgetSuggestions,
      model: GROQ_TEXT_MODEL,
    };

    await db.doc(`households/${householdId}/aiInsights/${period}`).set({
      ...result,
      source: {
        months: periods,
        expenseCount: expenseSnapshot.size,
      },
      generatedBy: uid,
      generatedAt: FieldValue.serverTimestamp(),
    });

    return result;
  },
);
