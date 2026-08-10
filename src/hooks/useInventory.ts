import { useEffect, useMemo, useState } from 'react';

import type { InventoryItem, ItemStatus } from '../types/domain';
import { subscribeToInventory } from '../services/firebase/inventoryService';

export function useInventory(householdId: string | null) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribeToInventory(
      householdId,
      (nextItems) => {
        setItems(nextItems);
        setError(null);
        setLoading(false);
      },
      () => {
        setError('Unable to load inventory.');
        setLoading(false);
      },
    );
  }, [householdId]);

  const counts = useMemo<Record<ItemStatus, number>>(
    () => ({
      available: items.filter((item) => item.status === 'available').length,
      low_stock: items.filter((item) => item.status === 'low_stock').length,
      out_of_stock: items.filter((item) => item.status === 'out_of_stock').length,
    }),
    [items],
  );

  return { items, counts, loading, error };
}
