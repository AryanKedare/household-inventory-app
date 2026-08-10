import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './client';

export interface PurchaseShoppingListItemInput {
  householdId: string;
  shoppingListItemId: string;
  quantityPurchased: number;
  unitPriceCents: number;
  storeName: string;
  purchasedAt?: string;
}

export interface PurchaseShoppingListItemResult {
  purchaseId: string;
  itemId: string;
  quantity: number;
  unitPriceCents: number;
  priceChangeCents: number | null;
  priceChangePercentage: number | null;
}

export async function purchaseShoppingListItem(
  input: PurchaseShoppingListItemInput,
): Promise<PurchaseShoppingListItemResult> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const callable = httpsCallable<
    PurchaseShoppingListItemInput,
    PurchaseShoppingListItemResult
  >(services.functions, 'purchaseShoppingListItem');

  const response = await callable(input);
  return response.data;
}
