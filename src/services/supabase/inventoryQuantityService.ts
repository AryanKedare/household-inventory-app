import type { ItemStatus } from '../../types/domain';
import { requireSupabaseClient } from './client';

export interface AdjustInventoryQuantityResult {
  itemId: string;
  quantity: number;
  status: ItemStatus;
}

export async function adjustInventoryQuantity(
  householdId: string,
  itemId: string,
  delta: number,
): Promise<AdjustInventoryQuantityResult> {
  const { data, error } = await requireSupabaseClient().rpc('adjust_inventory_quantity', {
    p_household_id: householdId,
    p_item_id: itemId,
    p_delta: delta,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid quantity response.');
  }

  const result = data as Record<string, unknown>;
  const quantity = Number(result.quantity);
  const status = result.status;
  if (
    typeof result.itemId !== 'string' ||
    !Number.isFinite(quantity) ||
    (status !== 'available' && status !== 'low_stock' && status !== 'out_of_stock')
  ) {
    throw new Error('Supabase returned an invalid quantity response.');
  }

  return { itemId: result.itemId, quantity, status };
}
