import {
  cleanAiString,
  cleanId,
  cleanText,
  requireAiAccess,
} from '../_shared/aiSupport.ts';
import {
  EXPENSE_CATEGORY_IDS,
  EXPENSE_CATEGORY_SET,
  type ExpenseCategoryId,
} from '../_shared/financeCategories.ts';
import { requestGroqStructured } from '../_shared/groq.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';

interface SuggestExpenseCategoryBody {
  householdId?: unknown;
  title?: unknown;
  merchantName?: unknown;
  notes?: unknown;
  lineDescriptions?: unknown;
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

function cleanLineDescriptions(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error('Line descriptions are invalid.');
  }
  return value.map((entry) => cleanText(entry, 'Line description', 120));
}

function isExpenseCategory(value: unknown): value is ExpenseCategoryId {
  return typeof value === 'string' && EXPENSE_CATEGORY_SET.has(value);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as SuggestExpenseCategoryBody;
    const householdId = cleanId(body.householdId, 'Household');
    const title = cleanText(body.title, 'Expense title', 120);
    const merchantName = cleanText(body.merchantName, 'Merchant', 120, false);
    const notes = cleanText(body.notes, 'Notes', 1000, false);
    const lineDescriptions = cleanLineDescriptions(body.lineDescriptions);

    await requireAiAccess(req, householdId, 'category');

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

    const confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0;

    return jsonResponse({
      categoryId: isExpenseCategory(raw.categoryId) ? raw.categoryId : 'other',
      confidence,
      reason: cleanAiString(raw.reason, 'AI category suggestion', 240),
      normalizedTitle: cleanAiString(raw.normalizedTitle, title, 120),
    });
  } catch (error) {
    console.error('suggest-expense-category failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to suggest a category.' }, 400);
  }
});
