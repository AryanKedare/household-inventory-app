import { requireSupabaseClient } from './client';

export interface PurchaseShoppingListItemInput {
  householdId: string;
  shoppingListItemId: string;
  quantityPurchased: number;
  unitPriceCents: number;
  storeName: string;
  purchasedAt?: string;
}

export interface PurchaseShoppingListItemResult {
  purchaseId: string;
  itemId: string;
  quantity: number;
  unitPriceCents: number;
  priceChangeCents: number | null;
  priceChangePercentage: number | null;
}

export async function purchaseShoppingListItem(
  input: PurchaseShoppingListItemInput,
): Promise<PurchaseShoppingListItemResult> {
  const { data, error } = await requireSupabaseClient().rpc('purchase_shopping_item', {
    p_household_id: input.householdId,
    p_shopping_item_id: input.shoppingListItemId,
    p_quantity_purchased: input.quantityPurchased,
    p_unit_price_cents: input.unitPriceCents,
    p_store_name: input.storeName,
    ...(input.purchasedAt ? { p_purchased_at: input.purchasedAt } : {}),
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid purchase response.');
  }

  const result = data as Record<string, unknown>;
  const quantity = Number(result.quantity);
  const priceChangePercentage =
    result.priceChangePercentage === null || result.priceChangePercentage === undefined
      ? null
      : Number(result.priceChangePercentage);

  if (
    typeof result.purchaseId !== 'string' ||
    typeof result.itemId !== 'string' ||
    !Number.isFinite(quantity)
  ) {
    throw new Error('Supabase returned an invalid purchase response.');
  }

  return {
    purchaseId: result.purchaseId,
    itemId: result.itemId,
    quantity,
    unitPriceCents: input.unitPriceCents,
    priceChangeCents:
      typeof result.priceChangeCents === 'number' ? result.priceChangeCents : null,
    priceChangePercentage: Number.isFinite(priceChangePercentage) ? priceChangePercentage : null,
  };
}
