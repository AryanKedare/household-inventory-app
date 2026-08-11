import { EXPENSE_CATEGORY_IDS, EXPENSE_CATEGORY_SET, type ExpenseCategoryId } from '../_shared/financeCategories.ts';
import { GROQ_TEXT_MODEL, requestGroqStructured } from '../_shared/groq.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const MAX_MONEY_CENTS = 100_000_000;
const QUOTAS = { category: 40, bill: 20, insights: 5 } as const;

type AiOperation = keyof typeof QUOTAS;

function cleanText(value: unknown, field: string, max: number, required = true): string {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) throw new Error(`${field} is invalid.`);
  return clean;
}

function cleanMoney(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_MONEY_CENTS
    ? value as number
    : 0;
}

function cleanAiString(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function cleanStringArray(value: unknown, limit = 10): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim().slice(0, 300)).filter(Boolean).slice(0, limit)
    : [];
}

function isCategory(value: unknown): value is ExpenseCategoryId {
  return typeof value === 'string' && EXPENSE_CATEGORY_SET.has(value);
}

async function requireMembership(householdId: string, userId: string) {
  const { data, error } = await createAdminClient()
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('You are not a member of this household.');
}

async function consumeQuota(userId: string, operation: AiOperation) {
  const { error } = await createAdminClient().rpc('consume_ai_quota', {
    p_user_id: userId,
    p_operation: operation,
    p_limit: QUOTAS[operation],
  });
  if (error) throw new Error(error.message.includes('quota') ? 'Daily AI quota reached.' : 'Unable to check AI quota.');
}

const categorySchema = {
  name: 'expense_category_suggestion',
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      categoryId: { type: 'string', enum: [...EXPENSE_CATEGORY_IDS] },
      confidence: { type: 'number' },
      reason: { type: 'string' },
      normalizedTitle: { type: 'string' },
    },
    required: ['categoryId', 'confidence', 'reason', 'normalizedTitle'],
  },
};

async function suggestCategory(body: Record<string, unknown>, userId: string) {
  const householdId = cleanText(body.householdId, 'Household', 64);
  const title = cleanText(body.title, 'Expense title', 120);
  await requireMembership(householdId, userId);
  await consumeQuota(userId, 'category');
  const raw = await requestGroqStructured<Record<string, unknown>>({
    schema: categorySchema,
    system: 'Classify a household expense into exactly one supplied category. Keep the reason concise and never invent monetary values.',
    user: JSON.stringify({
      categories: EXPENSE_CATEGORY_IDS,
      expense: {
        title,
        merchantName: cleanText(body.merchantName, 'Merchant', 120, false),
        notes: cleanText(body.notes, 'Notes', 1000, false),
        lineDescriptions: Array.isArray(body.lineDescriptions) ? body.lineDescriptions.slice(0, 50) : [],
      },
    }),
    maxCompletionTokens: 600,
  });
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0;
  return {
    categoryId: isCategory(raw.categoryId) ? raw.categoryId : 'other',
    confidence,
    reason: cleanAiString(raw.reason, 'AI category suggestion', 240),
    normalizedTitle: cleanAiString(raw.normalizedTitle, title, 120),
  };
}

interface MemberAlias { alias: string; userId: string; displayName: string }
async function loadRoster(householdId: string): Promise<MemberAlias[]> {
  const admin = createAdminClient();
  const { data: members, error } = await admin.from('household_members').select('user_id').eq('household_id', householdId).order('user_id');
  if (error) throw error;
  const ids = (members ?? []).map((row) => row.user_id as string);
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await admin.from('profiles').select('id,display_name').in('id', ids);
  if (profileError) throw profileError;
  const names = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.display_name as string | null]));
  return ids.map((userId, index) => ({ alias: `member_${index + 1}`, userId, displayName: names.get(userId)?.trim() || `Household member ${index + 1}` }));
}

function billSchema(aliases: string[]) {
  return {
    name: 'household_bill_draft',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, merchantName: { type: 'string' },
        categoryId: { type: 'string', enum: [...EXPENSE_CATEGORY_IDS] },
        discountCents: { type: 'integer' }, feeCents: { type: 'integer' }, statedTotalCents: { type: 'integer' },
        lineItems: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
          description: { type: 'string' }, totalCents: { type: 'integer' }, participantAliases: { type: 'array', items: { type: 'string', enum: aliases } },
        }, required: ['description', 'totalCents', 'participantAliases'] } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'merchantName', 'categoryId', 'discountCents', 'feeCents', 'statedTotalCents', 'lineItems', 'warnings'],
    },
  };
}

async function analyzeBill(body: Record<string, unknown>, userId: string) {
  const householdId = cleanText(body.householdId, 'Household', 64);
  const billText = cleanText(body.billText, 'Bill text', 12_000);
  await requireMembership(householdId, userId);
  await consumeQuota(userId, 'bill');
  const roster = await loadRoster(householdId);
  if (!roster.length) throw new Error('This household has no members.');
  const aliasMap = new Map(roster.map((member) => [member.alias, member.userId]));
  const raw = await requestGroqStructured<Record<string, unknown>>({
    schema: billSchema(roster.map((member) => member.alias)),
    system: 'Extract a review-first household bill draft. All money is integer euro cents. Use only supplied participant aliases. Leave uncertain participant assignments empty and add a warning. Do not calculate debts or allocate discounts/fees; deterministic server code does that after review.',
    user: JSON.stringify({ roster: roster.map(({ alias, displayName }) => ({ alias, displayName })), categories: EXPENSE_CATEGORY_IDS, billText }),
    maxCompletionTokens: 3000,
  });
  const warnings = cleanStringArray(raw.warnings, 20);
  const lineItems = (Array.isArray(raw.lineItems) ? raw.lineItems : []).slice(0, 100).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const data = entry as Record<string, unknown>;
    const totalCents = cleanMoney(data.totalCents);
    if (totalCents <= 0) { warnings.push(`Line ${index + 1} has no usable amount.`); return []; }
    const participantAliases = Array.isArray(data.participantAliases)
      ? [...new Set(data.participantAliases.filter((alias): alias is string => typeof alias === 'string' && aliasMap.has(alias)))]
      : [];
    if (!participantAliases.length) warnings.push(`Review who should share line ${index + 1}.`);
    return [{ description: cleanAiString(data.description, `Bill item ${index + 1}`, 120), totalCents, participantAliases, participantIds: participantAliases.map((alias) => aliasMap.get(alias)!) }];
  });
  const discountCents = cleanMoney(raw.discountCents);
  const feeCents = cleanMoney(raw.feeCents);
  const statedTotalCents = cleanMoney(raw.statedTotalCents);
  const calculatedTotalCents = Math.max(0, lineItems.reduce((sum, line) => sum + line.totalCents, 0) - discountCents + feeCents);
  if (statedTotalCents > 0 && Math.abs(statedTotalCents - calculatedTotalCents) > 1) warnings.push('Parsed items do not reconcile with the stated bill total.');
  return {
    title: cleanAiString(raw.title, 'Household bill', 120), merchantName: cleanAiString(raw.merchantName, '', 120),
    categoryId: isCategory(raw.categoryId) ? raw.categoryId : 'other', discountCents, feeCents, statedTotalCents, calculatedTotalCents,
    lineItems, warnings: [...new Set(warnings)].slice(0, 20), requiresReview: !lineItems.length || lineItems.some((line) => !line.participantIds.length) || warnings.length > 0,
  };
}

const insightsSchema = {
  name: 'household_spending_insights',
  schema: { type: 'object', additionalProperties: false, properties: {
    summary: { type: 'string' }, observations: { type: 'array', items: { type: 'string' } }, overspendRisks: { type: 'array', items: { type: 'string' } }, savingsOpportunities: { type: 'array', items: { type: 'string' } },
    budgetSuggestions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { categoryId: { type: 'string', enum: [...EXPENSE_CATEGORY_IDS] }, recommendedLimitCents: { type: 'integer' }, reason: { type: 'string' } }, required: ['categoryId', 'recommendedLimitCents', 'reason'] } },
  }, required: ['summary', 'observations', 'overspendRisks', 'savingsOpportunities', 'budgetSuggestions'] },
};

async function generateInsights(body: Record<string, unknown>, userId: string) {
  const householdId = cleanText(body.householdId, 'Household', 64);
  await requireMembership(householdId, userId);
  await consumeQuota(userId, 'insights');
  const admin = createAdminClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 10);
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [{ data: expenses, error: expenseError }, { data: budgets, error: budgetError }] = await Promise.all([
    admin.from('expenses').select('category,total_cents,expense_date').eq('household_id', householdId).gte('expense_date', start),
    admin.from('budgets').select('period_start,category,limit_cents').eq('household_id', householdId).gte('period_start', start),
  ]);
  if (expenseError) throw expenseError;
  if (budgetError) throw budgetError;
  const aggregates: Record<string, { totalCents: number; count: number }> = {};
  for (const row of expenses ?? []) {
    const key = `${String(row.expense_date).slice(0, 7)}:${row.category}`;
    const current = aggregates[key] ?? { totalCents: 0, count: 0 };
    current.totalCents += Number(row.total_cents) || 0; current.count += 1; aggregates[key] = current;
  }
  const raw = await requestGroqStructured<Record<string, unknown>>({
    schema: insightsSchema,
    system: 'Provide concise household spending insights from aggregate category/month totals and budgets only. Do not infer individual member behavior. Recommendations are advisory.',
    user: JSON.stringify({ period, aggregates, budgets: budgets ?? [] }), maxCompletionTokens: 2200,
  });
  const result = {
    period, summary: cleanAiString(raw.summary, 'No summary available.', 1000), observations: cleanStringArray(raw.observations), overspendRisks: cleanStringArray(raw.overspendRisks), savingsOpportunities: cleanStringArray(raw.savingsOpportunities),
    budgetSuggestions: (Array.isArray(raw.budgetSuggestions) ? raw.budgetSuggestions : []).slice(0, 20).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const data = entry as Record<string, unknown>;
      if (!isCategory(data.categoryId)) return [];
      return [{ categoryId: data.categoryId, recommendedLimitCents: cleanMoney(data.recommendedLimitCents), reason: cleanAiString(data.reason, 'AI budget suggestion', 300) }];
    }), model: GROQ_TEXT_MODEL,
  };
  const { error: saveError } = await admin.from('ai_insights').insert({ household_id: householdId, period_start: `${period}-01`, insight_type: 'spending', model: GROQ_TEXT_MODEL, payload: result, generated_by: userId });
  if (saveError) throw saveError;
  return result;
}

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  try {
    const { user } = await requireUser(req);
    const body = await req.json() as Record<string, unknown>;
    const action = body.action;
    if (action === 'category') return jsonResponse(await suggestCategory(body, user.id));
    if (action === 'bill') return jsonResponse(await analyzeBill(body, user.id));
    if (action === 'insights') return jsonResponse(await generateInsights(body, user.id));
    return jsonResponse({ error: 'Unknown AI action.' }, 400);
  } catch (error) {
    console.error('household-ai failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Household AI request failed.' }, 400);
  }
});
