import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();
const REGION = 'europe-west1';

interface AdjustInventoryQuantityRequest {
  householdId?: unknown;
  itemId?: unknown;
  delta?: unknown;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return auth.uid;
}

function cleanId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }
  const id = value.trim();
  if (!id || id.length > 128 || id.includes('/')) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return id;
}

function cleanDelta(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value === 0 ||
    Math.abs(value) > 100000
  ) {
    throw new HttpsError('invalid-argument', 'Quantity change is invalid.');
  }
  return value;
}

function inventoryStatus(
  quantity: number,
  lowStockThreshold: unknown,
): 'available' | 'low_stock' | 'out_of_stock' {
  if (quantity <= 0) {
    return 'out_of_stock';
  }
  if (
    typeof lowStockThreshold === 'number' &&
    Number.isFinite(lowStockThreshold) &&
    lowStockThreshold >= 0 &&
    quantity <= lowStockThreshold
  ) {
    return 'low_stock';
  }
  return 'available';
}

export const adjustInventoryQuantity = onCall<AdjustInventoryQuantityRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const itemId = cleanId(request.data.itemId, 'Item');
    const delta = cleanDelta(request.data.delta);

    const memberRef = db.doc(`households/${householdId}/members/${uid}`);
    const itemRef = db.doc(`households/${householdId}/items/${itemId}`);

    return db.runTransaction(async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      if (!memberSnapshot.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }

      const itemSnapshot = await transaction.get(itemRef);
      if (!itemSnapshot.exists) {
        throw new HttpsError('not-found', 'Inventory item no longer exists.');
      }
      const item = itemSnapshot.data();
      const currentQuantity = item?.quantity;
      if (
        typeof currentQuantity !== 'number' ||
        !Number.isFinite(currentQuantity) ||
        currentQuantity < 0
      ) {
        throw new HttpsError('data-loss', 'Inventory quantity is invalid.');
      }

      const nextQuantity = currentQuantity + delta;
      if (!Number.isFinite(nextQuantity) || nextQuantity < 0 || nextQuantity > 100000) {
        throw new HttpsError('failed-precondition', 'Quantity change is outside the allowed range.');
      }
      const status = inventoryStatus(nextQuantity, item?.lowStockThreshold);

      transaction.update(itemRef, {
        quantity: nextQuantity,
        status,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { itemId, quantity: nextQuantity, status };
    });
  },
);
