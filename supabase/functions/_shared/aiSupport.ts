import { createAdminClient, requireUser } from './supabase.ts';

export type AiQuotaKind = 'category' | 'bill' | 'insights';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_AI_MONEY_CENTS = 100_000_000;

export function cleanId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return value.trim();
}

export function cleanText(
  value: unknown,
  fieldName: string,
  maxLength: number,
  required = true,
): string {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${fieldName} is invalid.`);
  const text = value.trim();
  if ((required && text.length === 0) || text.length > maxLength) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return text;
}

export function cleanAiString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : fallback;
}

export function cleanAiMoney(value: unknown): number {
  return Number.isSafeInteger(value) &&
      (value as number) >= 0 &&
      (value as number) <= MAX_AI_MONEY_CENTS
    ? (value as number)
    : 0;
}

export async function requireAiAccess(
  req: Request,
  householdId: string,
  operation: AiQuotaKind,
) {
  const { user, supabase } = await requireUser(req);
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new Error('You are not a member of this household.');

  const admin = createAdminClient();
  const { error: quotaError } = await admin.rpc('consume_ai_quota', {
    p_user_id: user.id,
    p_operation: operation,
  });
  if (quotaError) {
    if (quotaError.message.includes('AI_QUOTA_EXCEEDED')) {
      throw new Error(
        operation === 'insights'
          ? 'Daily household AI insight limit reached. Try again tomorrow.'
          : 'Daily household AI limit reached. Try again tomorrow.',
      );
    }
    throw quotaError;
  }

  return { user, supabase, admin };
}

export interface MemberAlias {
  alias: string;
  userId: string;
  displayName: string;
}

export async function loadHouseholdMemberAliases(
  householdId: string,
): Promise<MemberAlias[]> {
  const admin = createAdminClient();
  const { data: memberships, error: membershipError } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .order('user_id', { ascending: true });
  if (membershipError) throw membershipError;

  const userIds = (memberships ?? []).map((member) => member.user_id as string);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id,display_name')
    .in('id', userIds);
  if (profileError) throw profileError;

  const profileNames = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.display_name] as const),
  );

  return userIds.map((userId, index) => {
    const displayName = profileNames.get(userId);
    return {
      alias: `member_${index + 1}`,
      userId,
      displayName:
        typeof displayName === 'string' && displayName.trim().length > 0
          ? displayName.trim().slice(0, 80)
          : `Household member ${index + 1}`,
    };
  });
}
