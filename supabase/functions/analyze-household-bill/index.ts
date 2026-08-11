import {
  cleanAiMoney,
  cleanAiString,
  cleanId,
  cleanText,
  loadHouseholdMemberAliases,
  requireAiAccess,
} from '../_shared/aiSupport.ts';
import {
  EXPENSE_CATEGORY_IDS,
  EXPENSE_CATEGORY_SET,
  type ExpenseCategoryId,
} from '../_shared/financeCategories.ts';
import { requestGroqStructured } from '../_shared/groq.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';

interface AnalyzeBillBody {
  householdId?: unknown;
  billText?: unknown;
}

interface BillDraftLine {
  description: string;
  totalCents: number;
  participantIds: string[];
  participantAliases: string[];
}

function isExpenseCategory(value: unknown): value is ExpenseCategoryId {
  return typeof value === 'string' && EXPENSE_CATEGORY_SET.has(value);
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as AnalyzeBillBody;
    const householdId = cleanId(body.householdId, 'Household');
    const billText = cleanText(body.billText, 'Bill text', 12_000);

    await requireAiAccess(req, householdId, 'bill');
    const roster = await loadHouseholdMemberAliases(householdId);
    if (roster.length === 0) throw new Error('This household has no members.');
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
        ? [
            ...new Set(
              data.participantAliases.filter(
                (alias): alias is string => typeof alias === 'string' && aliasMap.has(alias),
              ),
            ),
          ]
        : [];
      if (participantAliases.length === 0) {
        warnings.push(`Review who should share line ${index + 1}.`);
      }

      return [
        {
          description: cleanAiString(data.description, `Bill item ${index + 1}`, 120),
          totalCents,
          participantAliases,
          participantIds: participantAliases
            .map((alias) => aliasMap.get(alias))
            .filter((id): id is string => typeof id === 'string'),
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

    return jsonResponse({
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
    });
  } catch (error) {
    console.error('analyze-household-bill failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to analyze the bill.' }, 400);
  }
});
