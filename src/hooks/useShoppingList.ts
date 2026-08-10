import { useEffect, useMemo, useState } from 'react';

import { subscribeToShoppingList } from '../services/firebase/shoppingListService';
import type { ShoppingListItem } from '../types/domain';

export function useShoppingList(householdId: string | null) {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribeToShoppingList(
      householdId,
      (nextItems) => {
        setItems(nextItems);
        setError(null);
        setLoading(false);
      },
      () => {
        setError('Unable to load the shopping list.');
        setLoading(false);
      },
    );
  }, [householdId]);

  const estimatedTotalCents = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (item.estimatedPriceCents ?? 0) * item.quantityNeeded,
        0,
      ),
    [items],
  );

  return { items, estimatedTotalCents, loading, error };
}
