import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import type { InventoryItem, ShoppingListItem } from '../../types/domain';
import { getFirebaseServices } from './client';

function requireDb() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services.db;
}

export function subscribeToShoppingList(
  householdId: string,
  onItems: (items: ShoppingListItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireDb();
  const activeQuery = query(
    collection(db, 'households', householdId, 'shoppingList'),
    where('status', '==', 'active'),
    orderBy('addedAt', 'asc'),
  );

  return onSnapshot(
    activeQuery,
    (snapshot) => {
      onItems(
        snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...(snapshotDoc.data() as Omit<ShoppingListItem, 'id'>),
        })),
      );
    },
    (error) => onError(error),
  );
}

function activeShoppingPayload(uid: string, item: InventoryItem, quantityNeeded: number) {
  return {
    itemId: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    quantityNeeded: Math.max(1, quantityNeeded),
    unit: item.unit,
    estimatedPriceCents: item.currentPriceCents,
    priority: 'normal',
    status: 'active',
    addedBy: uid,
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as const;
}

export async function addInventoryItemToShoppingList(
  householdId: string,
  uid: string,
  item: InventoryItem,
  quantityNeeded = 1,
): Promise<void> {
  const db = requireDb();
  const listRef = doc(db, 'households', householdId, 'shoppingList', item.id);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(listRef);
    const requestedQuantity = Math.max(1, quantityNeeded);

    if (existing.exists() && existing.data().status === 'active') {
      const currentQuantity = existing.data().quantityNeeded;
      transaction.update(listRef, {
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        quantityNeeded:
          typeof currentQuantity === 'number'
            ? Math.max(currentQuantity, requestedQuantity)
            : requestedQuantity,
        unit: item.unit,
        estimatedPriceCents: item.currentPriceCents,
        priority: existing.data().priority ?? 'normal',
        updatedAt: serverTimestamp(),
      });
      return;
    }

    transaction.set(listRef, activeShoppingPayload(uid, item, requestedQuantity), { merge: true });
  });
}

export async function updateShoppingQuantity(
  householdId: string,
  itemId: string,
  quantityNeeded: number,
): Promise<void> {
  const db = requireDb();
  await updateDoc(doc(db, 'households', householdId, 'shoppingList', itemId), {
    quantityNeeded: Math.max(1, quantityNeeded),
    updatedAt: serverTimestamp(),
  });
}

export async function removeShoppingItem(householdId: string, itemId: string): Promise<void> {
  const db = requireDb();
  await deleteDoc(doc(db, 'households', householdId, 'shoppingList', itemId));
}

export async function markFinishedAndAddToShoppingList(
  householdId: string,
  uid: string,
  item: InventoryItem,
  quantityNeeded = 1,
): Promise<void> {
  const db = requireDb();
  const inventoryRef = doc(db, 'households', householdId, 'items', item.id);
  const shoppingRef = doc(db, 'households', householdId, 'shoppingList', item.id);

  await runTransaction(db, async (transaction) => {
    const existingShopping = await transaction.get(shoppingRef);
    const requestedQuantity = Math.max(1, quantityNeeded);

    transaction.update(inventoryRef, {
      quantity: 0,
      status: 'out_of_stock',
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });

    if (existingShopping.exists() && existingShopping.data().status === 'active') {
      const currentQuantity = existingShopping.data().quantityNeeded;
      transaction.update(shoppingRef, {
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        quantityNeeded:
          typeof currentQuantity === 'number'
            ? Math.max(currentQuantity, requestedQuantity)
            : requestedQuantity,
        unit: item.unit,
        estimatedPriceCents: item.currentPriceCents,
        priority: existingShopping.data().priority ?? 'normal',
        updatedAt: serverTimestamp(),
      });
      return;
    }

    transaction.set(shoppingRef, activeShoppingPayload(uid, item, requestedQuantity), {
      merge: true,
    });
  });
}
