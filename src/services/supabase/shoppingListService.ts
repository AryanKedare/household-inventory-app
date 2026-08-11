import type { InventoryItem, ShoppingListItem } from '../../types/domain';
import { timestampFromIso } from '../../types/timestamp';
import { requireSupabaseClient } from './client';

interface ShoppingRow {
  id: string;
  inventory_item_id: string;
  name: string | null;
  category_id: string | null;
  category_name: string | null;
  requested_quantity: number | string;
  unit: string | null;
  estimated_price_cents: number | null;
  priority: ShoppingListItem['priority'];
  status: ShoppingListItem['status'];
  added_by: string;
  purchased_by: string | null;
  purchased_at: string | null;
  created_at: string;
}

function mapShopping(row: ShoppingRow): ShoppingListItem {
  const quantity = Number(row.requested_quantity);
  return {
    id: row.id,
    itemId: row.inventory_item_id,
    name: row.name ?? 'Item',
    categoryId: row.category_id ?? undefined,
    categoryName: row.category_name ?? undefined,
    quantityNeeded: Number.isFinite(quantity) ? quantity : 1,
    unit: row.unit ?? undefined,
    estimatedPriceCents: row.estimated_price_cents ?? undefined,
    priority: row.priority,
    status: row.status,
    addedBy: row.added_by,
    addedAt: timestampFromIso(row.created_at),
    purchasedBy: row.purchased_by ?? undefined,
    purchasedAt: row.purchased_at ? timestampFromIso(row.purchased_at) : undefined,
  };
}

async function loadShopping(householdId: string): Promise<ShoppingListItem[]> {
  const { data, error } = await requireSupabaseClient()
    .from('shopping_items')
    .select(
      'id,inventory_item_id,name,category_id,category_name,requested_quantity,unit,estimated_price_cents,priority,status,added_by,purchased_by,purchased_at,created_at',
    )
    .eq('household_id', householdId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as ShoppingRow[]).map(mapShopping);
}

export function subscribeToShoppingList(
  householdId: string,
  onItems: (items: ShoppingListItem[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;
  const refresh = () => {
    void loadShopping(householdId)
      .then((items) => {
        if (active) onItems(items);
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const channel = supabase
    .channel(`shopping:${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function addInventoryItemToShoppingList(
  householdId: string,
  _uid: string,
  item: InventoryItem,
  quantityNeeded = 1,
): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('add_inventory_to_shopping', {
    p_household_id: householdId,
    p_item_id: item.id,
    p_quantity_needed: quantityNeeded,
  });
  if (error) throw error;
}

export async function updateShoppingQuantity(
  householdId: string,
  itemId: string,
  quantityNeeded: number,
): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('update_shopping_quantity', {
    p_household_id: householdId,
    p_shopping_item_id: itemId,
    p_quantity_needed: quantityNeeded,
  });
  if (error) throw error;
}

export async function removeShoppingItem(householdId: string, itemId: string): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('remove_shopping_item', {
    p_household_id: householdId,
    p_shopping_item_id: itemId,
  });
  if (error) throw error;
}

export async function markFinishedAndAddToShoppingList(
  householdId: string,
  _uid: string,
  item: InventoryItem,
  quantityNeeded = 1,
): Promise<void> {
  const { error } = await requireSupabaseClient().rpc('mark_inventory_finished', {
    p_household_id: householdId,
    p_item_id: item.id,
    p_quantity_needed: quantityNeeded,
  });
  if (error) throw error;
}
