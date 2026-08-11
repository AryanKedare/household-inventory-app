import { EXPENSE_CATEGORY_SET, type ExpenseCategoryId } from '../_shared/financeCategories.ts';
import {
  calculateExpenseSplit,
  participantSubtotalsFromLines,
  type ExpenseLineInput,
  type ParticipantSubtotalInput,
} from '../_shared/financeMath.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

interface CreateExpenseBody {
  householdId?: unknown;
  title?: unknown;
  merchantName?: unknown;
  categoryId?: unknown;
  paidBy?: unknown;
  expenseDate?: unknown;
  discountCents?: unknown;
  feeCents?: unknown;
  participantSubtotals?: unknown;
  lineItems?: unknown;
  notes?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new Error(`${field} is invalid.`);
  }
  return value.trim();
}

function cleanText(value: unknown, field: string, maxLength: number, required = true): string {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const clean = value.trim();
  if ((required && !clean) || clean.length > maxLength) throw new Error(`${field} is invalid.`);
  return clean;
}

function cleanMoney(value: unknown, field: string): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 100_000_000) {
    throw new Error(`${field} must be a non-negative integer amount in cents.`);
  }
  return value as number;
}

function cleanCategory(value: unknown): ExpenseCategoryId {
  if (typeof value !== 'string' || !EXPENSE_CATEGORY_SET.has(value)) {
    throw new Error('Expense category is invalid.');
  }
  return value as ExpenseCategoryId;
}

function cleanDate(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expense date is required.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Expense date is invalid.');
  const now = Date.now();
  if (date.getTime() < now - 5 * 365 * 24 * 60 * 60 * 1000 || date.getTime() > now + 24 * 60 * 60 * 1000) {
    throw new Error('Expense date is outside the allowed range.');
  }
  return date.toISOString().slice(0, 10);
}

function cleanParticipantSubtotals(value: unknown): ParticipantSubtotalInput[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error('Participant subtotals are invalid.');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Participant subtotal is invalid.');
    const record = entry as Record<string, unknown>;
    return {
      userId: cleanId(record.userId, 'Participant'),
      subtotalCents: cleanMoney(record.subtotalCents, 'Participant subtotal'),
    };
  });
}

function cleanLines(value: unknown): ExpenseLineInput[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error('Expense line items are invalid.');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Expense line item is invalid.');
    const record = entry as Record<string, unknown>;
    if (!Array.isArray(record.participantIds) || record.participantIds.length === 0 || record.participantIds.length > 20) {
      throw new Error('Every line item needs at least one participant.');
    }
    return {
      description: cleanText(record.description, 'Line item description', 120),
      totalCents: cleanMoney(record.totalCents, 'Line item total'),
      participantIds: record.participantIds.map((id) => cleanId(id, 'Participant')),
    };
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { user, supabase } = await requireUser(req);
    const body = (await req.json()) as CreateExpenseBody;
    const householdId = cleanId(body.householdId, 'Household');
    const title = cleanText(body.title, 'Expense title', 120);
    const merchantName = cleanText(body.merchantName, 'Merchant', 120, false);
    const categoryId = cleanCategory(body.categoryId);
    const paidBy = cleanId(body.paidBy ?? user.id, 'Payer');
    const expenseDate = cleanDate(body.expenseDate);
    const discountCents = cleanMoney(body.discountCents, 'Discount');
    const feeCents = cleanMoney(body.feeCents, 'Fees and tax');
    const notes = cleanText(body.notes, 'Notes', 1000, false);
    const directSubtotals = cleanParticipantSubtotals(body.participantSubtotals);
    const lineItems = cleanLines(body.lineItems);

    if ((directSubtotals === null) === (lineItems === null)) {
      throw new Error('Provide either participant subtotals or itemized expense lines, but not both.');
    }

    const participantSubtotals = directSubtotals ?? participantSubtotalsFromLines(lineItems ?? []);
    const split = calculateExpenseSplit({ paidBy, participantSubtotals, discountCents, feeCents });
    const requiredIds = [...new Set([user.id, paidBy, ...split.allocations.map(({ userId }) => userId)])];

    const { data: members, error: memberError } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
      .in('user_id', requiredIds);
    if (memberError) throw memberError;
    if (new Set((members ?? []).map((member) => member.user_id)).size !== requiredIds.length) {
      throw new Error('Every payer and participant must belong to the household.');
    }

    const { data: stored, error: persistError } = await createAdminClient().rpc('persist_household_expense', {
      p_actor_id: user.id,
      p_household_id: householdId,
      p_title: title,
      p_merchant: merchantName || null,
      p_category: categoryId,
      p_paid_by: paidBy,
      p_expense_date: expenseDate,
      p_discount_cents: split.discountCents,
      p_fee_cents: split.feeCents,
      p_subtotal_cents: split.subtotalCents,
      p_total_cents: split.totalPaidCents,
      p_participant_subtotals: split.allocations.map(({ userId, subtotalCents }) => ({ userId, subtotalCents })),
      p_line_items: lineItems ?? [],
      p_allocations: split.allocations,
      p_debts: split.debts,
      p_notes: notes || null,
    });
    if (persistError) throw persistError;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || typeof stored.expenseId !== 'string') {
      throw new Error('Expense persistence returned an invalid response.');
    }

    return jsonResponse({
      expenseId: stored.expenseId,
      subtotalCents: split.subtotalCents,
      discountCents: split.discountCents,
      feeCents: split.feeCents,
      totalPaidCents: split.totalPaidCents,
      allocations: split.allocations,
      debts: split.debts,
    });
  } catch (error) {
    console.error('create-expense failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to create expense.' }, 400);
  }
});
