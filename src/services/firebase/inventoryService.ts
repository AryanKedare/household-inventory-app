import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import type { InventoryItem } from '../../types/domain';
import { getItemStatus } from '../../utils/inventoryStatus';
import { getFirebaseServices } from './client';
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

function requireServices() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services;
}

function requireDb() {
  return requireServices().db;
}

function itemCollection(householdId: string) {
  return collection(requireDb(), 'households', householdId, 'items');
}

export function subscribeToInventory(
  householdId: string,
  onItems: (items: InventoryItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const itemsQuery = query(itemCollection(householdId), orderBy('normalizedName', 'asc'));

  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      onItems(
        snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...(snapshotDoc.data() as Omit<InventoryItem, 'id'>),
        })),
      );
    },
    (error) => onError(error),
  );
}

export async function findInventoryItemByBarcode(
  householdId: string,
  barcode: string,
): Promise<InventoryItem | null> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) {
    return null;
  }

  const snapshot = await getDocs(
    query(itemCollection(householdId), where('barcode', '==', cleanBarcode), limit(1)),
  );
  const match = snapshot.docs[0];
  if (!match) {
    return null;
  }

  return {
    id: match.id,
    ...(match.data() as Omit<InventoryItem, 'id'>),
  };
}

export async function addItem(
  householdId: string,
  uid: string,
  input: InventoryItemInput,
): Promise<string> {
  const cleanedName = input.name.trim();
  const cleanedCategory = input.categoryName.trim();
  const payload = {
    name: cleanedName,
    normalizedName: cleanedName.toLocaleLowerCase('en-IE'),
    categoryId: cleanedCategory.toLocaleLowerCase('en-IE').replace(/[^a-z0-9]+/g, '-'),
    categoryName: cleanedCategory,
    quantity: input.quantity,
    unit: input.unit,
    lowStockThreshold: input.lowStockThreshold ?? null,
    status: getItemStatus(input.quantity, input.lowStockThreshold),
    currentPriceCents: input.currentPriceCents,
    currency: input.currency ?? 'EUR',
    barcode: input.barcode?.trim() || null,
    addedBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const created = await addDoc(itemCollection(householdId), payload);
  return created.id;
}

export async function updateItem(
  householdId: string,
  uid: string,
  itemId: string,
  input: InventoryItemInput,
): Promise<void> {
  const db = requireDb();
  const cleanedName = input.name.trim();
  const cleanedCategory = input.categoryName.trim();

  await updateDoc(doc(db, 'households', householdId, 'items', itemId), {
    name: cleanedName,
    normalizedName: cleanedName.toLocaleLowerCase('en-IE'),
    categoryId: cleanedCategory.toLocaleLowerCase('en-IE').replace(/[^a-z0-9]+/g, '-'),
    categoryName: cleanedCategory,
    quantity: input.quantity,
    unit: input.unit,
    lowStockThreshold: input.lowStockThreshold ?? null,
    status: getItemStatus(input.quantity, input.lowStockThreshold),
    currentPriceCents: input.currentPriceCents,
    currency: input.currency ?? 'EUR',
    barcode: input.barcode?.trim() || null,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function setQuantity(
  householdId: string,
  item: InventoryItem,
  quantity: number,
): Promise<void> {
  const nextQuantity = Math.max(0, quantity);
  const delta = nextQuantity - item.quantity;
  if (delta === 0) {
    return;
  }

  await adjustInventoryQuantity(householdId, item.id, delta);
}

export async function deleteItem(householdId: string, itemId: string): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'households', householdId, 'items', itemId));
  batch.delete(doc(db, 'households', householdId, 'shoppingList', itemId));
  await batch.commit();
}
