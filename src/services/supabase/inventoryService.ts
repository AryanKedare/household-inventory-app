import type { InventoryItem } from '../../types/domain';
import { timestampFromIso } from '../../types/timestamp';
import { requireSupabaseClient } from './client';
import { adjustInventoryQuantity } from './inventoryQuantityService';

export interface InventoryItemInput {
  name: string;
  categoryName: string;
  quantity: number;
  unit: InventoryItem['unit'];
  lowStockThreshold?: number | null;
  currentPriceCents: number;
  currency?: string;
  barcode?: string;
}

interface InventoryRow {
  id: string;
  name: string;
  normalized_name: string;
  category_id: string | null;
  category_name: string | null;
  barcode: string | null;
  quantity: number | string;
  unit: InventoryItem['unit'];
  low_stock_threshold: number | string | null;
  status: InventoryItem['status'];
  current_unit_price_cents: number | null;
  previous_unit_price_cents: number | null;
  price_change_cents: number | null;
  price_change_percentage: number | string | null;
  currency: string;
  last_store_name: string | null;
  last_purchase_quantity: number | string | null;
  last_purchased_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

const selectColumns = [
  'id',
  'name',
  'normalized_name',
  'category_id',
  'category_name',
  'barcode',
  'quantity',
  'unit',
  'low_stock_threshold',
  'status',
  'current_unit_price_cents',
  'previous_unit_price_cents',
  'price_change_cents',
  'price_change_percentage',
  'currency',
  'last_store_name',
  'last_purchase_quantity',
  'last_purchased_at',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
].join(',');

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapInventory(row: InventoryRow): InventoryItem {
  const quantity = Number(row.quantity);
  const lowStockThreshold = numberOrNull(row.low_stock_threshold);
  const currentPriceCents = row.current_unit_price_cents ?? 0;
  const lastQuantity = numberOrNull(row.last_purchase_quantity);

  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    categoryId: row.category_id ?? 'other',
    categoryName: row.category_name ?? 'Other',
    barcode: row.barcode,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: row.unit,
    lowStockThreshold,
    status: row.status,
    currentPriceCents,
    currency: row.currency,
    previousPriceCents: row.previous_unit_price_cents,
    priceChangeCents: row.price_change_cents,
    priceChangePercentage: numberOrNull(row.price_change_percentage),
    ...(row.last_store_name && row.last_purchased_at && lastQuantity !== null
      ? {
          lastPurchase: {
            storeName: row.last_store_name,
            priceCents: currentPriceCents,
            quantity: lastQuantity,
            purchasedAt: timestampFromIso(row.last_purchased_at),
          },
        }
      : {}),
    addedBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: timestampFromIso(row.created_at),
    updatedAt: timestampFromIso(row.updated_at),
  };
}

async function loadInventory(householdId: string): Promise<InventoryItem[]> {
  const { data, error } = await requireSupabaseClient()
    .from('inventory_items')
    .select(selectColumns)
    .eq('household_id', householdId)
    .order('normalized_name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as InventoryRow[]).map(mapInventory);
}

export function subscribeToInventory(
  householdId: string,
  onItems: (items: InventoryItem[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const refresh = () => {
    void loadInventory(householdId)
      .then((items) => {
        if (active) onItems(items);
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const channel = supabase
    .channel(`inventory:${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_items', filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function findInventoryItemByBarcode(
  householdId: string,
  barcode: string,
): Promise<InventoryItem | null> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  const { data, error } = await requireSupabaseClient()
    .from('inventory_items')
    .select(selectColumns)
    .eq('household_id', householdId)
    .eq('barcode', cleanBarcode)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapInventory(data as unknown as InventoryRow) : null;
}

export async function addItem(
  householdId: string,
  _uid: string,
  input: InventoryItemInput,
): Promise<string> {
  const { data, error } = await requireSupabaseClient().rpc('create_inventory_item', {
    p_household_id: householdId,
    p_name: input.name,
    p_category_name: input.categoryName,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_low_stock_threshold: input.lowStockThreshold ?? null,
    p_current_price_cents: input.currentPriceCents,
    p_currency: input.currency ?? 'EUR',
    p_barcode: input.barcode?.trim() || null,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid inventory response.');
  }
  const itemId = (data as Record<string, unknown>).itemId;
  if (typeof itemId !== 'string') throw new Error('Supabase response is missing itemId.');
  return itemId;
}

export async function updateItem(
  householdId: string,
  _uid: string,
  itemId: string,
  input: InventoryItemInput,
): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('update_inventory_item', {
    p_household_id: householdId,
    p_item_id: itemId,
    p_name: input.name,
    p_category_name: input.categoryName,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_low_stock_threshold: input.lowStockThreshold ?? null,
    p_current_price_cents: input.currentPriceCents,
    p_currency: input.currency ?? 'EUR',
    p_barcode: input.barcode?.trim() || null,
  });
  if (error) throw error;
}

export async function setQuantity(
  householdId: string,
  item: InventoryItem,
  quantity: number,
): Promise<void> {
  const nextQuantity = Math.max(0, quantity);
  const delta = nextQuantity - item.quantity;
  if (delta !== 0) await adjustInventoryQuantity(householdId, item.id, delta);
}

export async function deleteItem(householdId: string, itemId: string): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('delete_inventory_item', {
    p_household_id: householdId,
    p_item_id: itemId,
  });
  if (error) throw error;
}
