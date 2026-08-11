import type { PriceHistory, Purchase } from '../../types/domain';
import { timestampFromIso } from '../../types/timestamp';
import { requireSupabaseClient } from './client';

interface PurchaseRow {
  id: string;
  inventory_item_id: string | null;
  shopping_item_id: string | null;
  item_name: string | null;
  store: string;
  quantity: number | string;
  unit: string | null;
  unit_price_cents: number;
  total_cents: number;
  currency: string;
  purchased_by: string;
  purchased_at: string;
  created_at: string;
}

interface PriceRow {
  id: string;
  inventory_item_id: string | null;
  purchase_id: string | null;
  item_name: string | null;
  store: string | null;
  previous_unit_price_cents: number | null;
  unit_price_cents: number;
  difference_cents: number | null;
  percentage_change: number | string | null;
  currency: string;
  changed_by: string | null;
  recorded_at: string;
}

function mapPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    itemId: row.inventory_item_id ?? '',
    shoppingListItemId: row.shopping_item_id ?? undefined,
    itemName: row.item_name ?? 'Item',
    storeName: row.store,
    quantityPurchased: Number(row.quantity),
    unit: row.unit ?? undefined,
    unitPriceCents: row.unit_price_cents,
    totalPriceCents: row.total_cents,
    currency: row.currency,
    purchasedBy: row.purchased_by,
    purchasedAt: timestampFromIso(row.purchased_at),
    createdAt: timestampFromIso(row.created_at),
  };
}

function mapPrice(row: PriceRow): PriceHistory {
  const previous = row.previous_unit_price_cents ?? row.unit_price_cents;
  const difference = row.difference_cents ?? row.unit_price_cents - previous;
  const percentage = row.percentage_change === null ? null : Number(row.percentage_change);
  return {
    id: row.id,
    itemId: row.inventory_item_id ?? '',
    purchaseId: row.purchase_id ?? '',
    itemName: row.item_name ?? 'Item',
    storeName: row.store ?? '',
    previousPriceCents: previous,
    newPriceCents: row.unit_price_cents,
    differenceCents: difference,
    percentageChange: Number.isFinite(percentage) ? percentage : null,
    currency: row.currency,
    changedBy: row.changed_by ?? '',
    createdAt: timestampFromIso(row.recorded_at),
  };
}

export function subscribeToItemPurchases(
  householdId: string,
  itemId: string,
  onPurchases: (purchases: Purchase[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const refresh = () => {
    void supabase
      .from('purchases')
      .select(
        'id,inventory_item_id,shopping_item_id,item_name,store,quantity,unit,unit_price_cents,total_cents,currency,purchased_by,purchased_at,created_at',
      )
      .eq('household_id', householdId)
      .eq('inventory_item_id', itemId)
      .order('purchased_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        onPurchases(((data ?? []) as unknown as PurchaseRow[]).map(mapPurchase));
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const channel = supabase
    .channel(`purchases:${householdId}:${itemId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'purchases', filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export function subscribeToItemPriceHistory(
  householdId: string,
  itemId: string,
  onHistory: (history: PriceHistory[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const refresh = () => {
    void supabase
      .from('price_history')
      .select(
        'id,inventory_item_id,purchase_id,item_name,store,previous_unit_price_cents,unit_price_cents,difference_cents,percentage_change,currency,changed_by,recorded_at',
      )
      .eq('household_id', householdId)
      .eq('inventory_item_id', itemId)
      .order('recorded_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        onHistory(((data ?? []) as unknown as PriceRow[]).map(mapPrice));
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const channel = supabase
    .channel(`price-history:${householdId}:${itemId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'price_history', filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
