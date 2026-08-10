import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import type { PriceHistory, Purchase } from '../../types/domain';
import { getFirebaseServices } from './client';

function requireDb() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services.db;
}

export function subscribeToItemPurchases(
  householdId: string,
  itemId: string,
  onPurchases: (purchases: Purchase[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const purchasesQuery = query(
    collection(requireDb(), 'households', householdId, 'purchases'),
    where('itemId', '==', itemId),
    orderBy('purchasedAt', 'desc'),
    limit(30),
  );

  return onSnapshot(
    purchasesQuery,
    (snapshot) => {
      onPurchases(
        snapshot.docs.map((purchase) => ({
          id: purchase.id,
          ...(purchase.data() as Omit<Purchase, 'id'>),
        })),
      );
    },
    onError,
  );
}

export function subscribeToItemPriceHistory(
  householdId: string,
  itemId: string,
  onHistory: (history: PriceHistory[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const priceQuery = query(
    collection(requireDb(), 'households', householdId, 'priceHistory'),
    where('itemId', '==', itemId),
    orderBy('createdAt', 'desc'),
    limit(30),
  );

  return onSnapshot(
    priceQuery,
    (snapshot) => {
      onHistory(
        snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<PriceHistory, 'id'>),
        })),
      );
    },
    onError,
  );
}
