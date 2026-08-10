import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './client';

interface CreateHouseholdResult {
  householdId: string;
  inviteCode: string;
}

interface JoinHouseholdResult {
  householdId: string;
  alreadyMember: boolean;
}

function requireFunctions() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services.functions;
}

export async function createHousehold(name: string): Promise<CreateHouseholdResult> {
  const call = httpsCallable<{ name: string }, CreateHouseholdResult>(
    requireFunctions(),
    'createHousehold',
  );
  const result = await call({ name: name.trim() });
  return result.data;
}

export async function joinHousehold(inviteCode: string): Promise<JoinHouseholdResult> {
  const call = httpsCallable<{ inviteCode: string }, JoinHouseholdResult>(
    requireFunctions(),
    'joinHousehold',
  );
  const result = await call({ inviteCode: inviteCode.trim().toUpperCase() });
  return result.data;
}

export interface RegenerateInviteResult {
  inviteCode: string;
}

export async function regenerateInviteCode(householdId: string): Promise<RegenerateInviteResult> {
  const call = httpsCallable<{ householdId: string }, RegenerateInviteResult>(
    requireFunctions(),
    'regenerateInviteCode',
  );
  const result = await call({ householdId });
  return result.data;
}

export async function removeHouseholdMember(householdId: string, userId: string): Promise<void> {
  const call = httpsCallable<{ householdId: string; userId: string }, { success: boolean }>(
    requireFunctions(),
    'removeHouseholdMember',
  );
  await call({ householdId, userId });
}

export async function changeHouseholdMemberRole(
  householdId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const call = httpsCallable<
    { householdId: string; userId: string; role: 'admin' | 'member' },
    { success: boolean; role: 'admin' | 'member' }
  >(requireFunctions(), 'changeHouseholdMemberRole');
  await call({ householdId, userId, role });
}

export async function transferHouseholdOwnership(
  householdId: string,
  userId: string,
): Promise<{ ownerId: string }> {
  const call = httpsCallable<
    { householdId: string; userId: string },
    { success: boolean; ownerId: string }
  >(requireFunctions(), 'transferHouseholdOwnership');
  const result = await call({ householdId, userId });
  return { ownerId: result.data.ownerId };
}

export async function leaveHousehold(householdId: string): Promise<void> {
  const call = httpsCallable<{ householdId: string }, { success: boolean }>(
    requireFunctions(),
    'leaveHousehold',
  );
  await call({ householdId });
}
