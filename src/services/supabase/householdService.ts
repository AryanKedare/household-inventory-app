import type { HouseholdRole } from '../../types/domain';
import { requireSupabaseClient } from './client';

export interface CreateHouseholdResult {
  householdId: string;
  inviteCode: string;
}

export interface JoinHouseholdResult {
  householdId: string;
  alreadyMember: boolean;
}

export interface RegenerateInviteResult {
  inviteCode: string;
}

function requireRecord(value: unknown, operation: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Supabase returned an invalid ${operation} response.`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Supabase response is missing ${key}.`);
  }
  return value;
}

async function callRpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await requireSupabaseClient().rpc(name, args);
  if (error) {
    throw error;
  }
  return requireRecord(data, name);
}

export async function createHousehold(name: string): Promise<CreateHouseholdResult> {
  const data = await callRpc('create_household', { p_name: name.trim() });
  return {
    householdId: requireString(data, 'householdId'),
    inviteCode: requireString(data, 'inviteCode'),
  };
}

export async function joinHousehold(inviteCode: string): Promise<JoinHouseholdResult> {
  const data = await callRpc('join_household', {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });
  return {
    householdId: requireString(data, 'householdId'),
    alreadyMember: data.alreadyMember === true,
  };
}

export async function regenerateInviteCode(householdId: string): Promise<RegenerateInviteResult> {
  const data = await callRpc('regenerate_household_invite', { p_household_id: householdId });
  return { inviteCode: requireString(data, 'inviteCode') };
}

export async function removeHouseholdMember(householdId: string, userId: string): Promise<void> {
  await callRpc('remove_household_member', {
    p_household_id: householdId,
    p_user_id: userId,
  });
}

export async function changeHouseholdMemberRole(
  householdId: string,
  userId: string,
  role: Extract<HouseholdRole, 'admin' | 'member'>,
): Promise<void> {
  await callRpc('change_household_member_role', {
    p_household_id: householdId,
    p_user_id: userId,
    p_role: role,
  });
}

export async function transferHouseholdOwnership(
  householdId: string,
  targetUserId: string,
): Promise<void> {
  await callRpc('transfer_household_ownership', {
    p_household_id: householdId,
    p_target_user_id: targetUserId,
  });
}

export async function leaveHousehold(householdId: string): Promise<void> {
  await callRpc('leave_household', { p_household_id: householdId });
}

export async function deleteHousehold(householdId: string): Promise<void> {
  await callRpc('delete_household', { p_household_id: householdId });
}
