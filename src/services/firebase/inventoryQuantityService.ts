import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './client';
import type { ItemStatus } from '../../types/domain';

interface AdjustInventoryQuantityResult {
  itemId: string;
  quantity: number;
  status: ItemStatus;
}

function requireFunctions() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services.functions;
}

export async function adjustInventoryQuantity(
  householdId: string,
  itemId: string,
  delta: number,
): Promise<AdjustInventoryQuantityResult> {
  const call = httpsCallable<
    { householdId: string; itemId: string; delta: number },
    AdjustInventoryQuantityResult
  >(requireFunctions(), 'adjustInventoryQuantity');
  return (await call({ householdId, itemId, delta })).data;
}
