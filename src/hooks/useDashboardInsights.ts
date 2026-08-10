import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { getFirebaseServices } from '../services/firebase/client';
import type { PriceHistory, Purchase } from '../types/domain';

function monthStart(): Timestamp {
  const now = new Date();
  return Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function useDashboardInsights(householdId: string | null) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(!householdId);
  const [pricesLoaded, setPricesLoaded] = useState(!householdId);

  useEffect(() => {
    if (!householdId) {
      setPurchases([]);
      setPriceHistory([]);
      setPurchasesLoaded(true);
      setPricesLoaded(true);
      return undefined;
    }

    const services = getFirebaseServices();
    if (!services) {
      setPurchasesLoaded(true);
      setPricesLoaded(true);
      return undefined;
    }

    setPurchasesLoaded(false);
    setPricesLoaded(false);
    const start = monthStart();

    const stopPurchases = onSnapshot(
      query(
        collection(services.db, 'households', householdId, 'purchases'),
        where('purchasedAt', '>=', start),
        orderBy('purchasedAt', 'desc'),
        limit(200),
      ),
      (snapshot) => {
        setPurchases(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Purchase, 'id'>),
          })),
        );
        setPurchasesLoaded(true);
      },
      () => setPurchasesLoaded(true),
    );

    const stopPrices = onSnapshot(
      query(
        collection(services.db, 'households', householdId, 'priceHistory'),
        where('createdAt', '>=', start),
        orderBy('createdAt', 'desc'),
        limit(200),
      ),
      (snapshot) => {
        setPriceHistory(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<PriceHistory, 'id'>),
          })),
        );
        setPricesLoaded(true);
      },
      () => setPricesLoaded(true),
    );

    return () => {
      stopPurchases();
      stopPrices();
    };
  }, [householdId]);

  const insights = useMemo(() => {
    const monthlySpendCents = purchases.reduce((sum, purchase) => sum + purchase.totalPriceCents, 0);
    const stores = new Map<string, number>();
    for (const purchase of purchases) {
      stores.set(purchase.storeName, (stores.get(purchase.storeName) ?? 0) + 1);
    }
    const mostUsedStore = [...stores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const biggestIncrease = priceHistory
      .filter((entry) => entry.differenceCents > 0)
      .sort((a, b) => (b.percentageChange ?? 0) - (a.percentageChange ?? 0))[0] ?? null;

    return { monthlySpendCents, mostUsedStore, biggestIncrease };
  }, [priceHistory, purchases]);

  return { ...insights, loading: !purchasesLoaded || !pricesLoaded };
}
