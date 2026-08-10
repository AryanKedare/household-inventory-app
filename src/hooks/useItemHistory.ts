import { useEffect, useState } from 'react';

import {
  subscribeToItemPriceHistory,
  subscribeToItemPurchases,
} from '../services/firebase/historyService';
import type { PriceHistory, Purchase } from '../types/domain';

export function useItemHistory(householdId: string | null, itemId: string | null) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(!householdId || !itemId);
  const [pricesLoaded, setPricesLoaded] = useState(!householdId || !itemId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId || !itemId) {
      setPurchases([]);
      setPriceHistory([]);
      setPurchasesLoaded(true);
      setPricesLoaded(true);
      return undefined;
    }

    setPurchasesLoaded(false);
    setPricesLoaded(false);
    const onError = () => setError('Unable to load item history.');

    const stopPurchases = subscribeToItemPurchases(
      householdId,
      itemId,
      (nextPurchases) => {
        setPurchases(nextPurchases);
        setPurchasesLoaded(true);
        setError(null);
      },
      onError,
    );
    const stopPrices = subscribeToItemPriceHistory(
      householdId,
      itemId,
      (nextPrices) => {
        setPriceHistory(nextPrices);
        setPricesLoaded(true);
        setError(null);
      },
      onError,
    );

    return () => {
      stopPurchases();
      stopPrices();
    };
  }, [householdId, itemId]);

  return {
    purchases,
    priceHistory,
    loading: !purchasesLoaded || !pricesLoaded,
    error,
  };
}
