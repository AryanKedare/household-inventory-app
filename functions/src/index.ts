import { randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const REGION = 'europe-west1';
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ITEM_STATUSES = new Set(['available', 'low_stock', 'out_of_stock']);

interface CreateHouseholdRequest {
  name?: unknown;
}

interface JoinHouseholdRequest {
  inviteCode?: unknown;
}

interface PurchaseShoppingListItemRequest {
  householdId?: unknown;
  shoppingListItemId?: unknown;
  quantityPurchased?: unknown;
  unitPriceCents?: unknown;
  storeName?: unknown;
  purchasedAt?: unknown;
}

interface AuthTokenLike {
  name?: unknown;
  email?: unknown;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return auth.uid;
}

function cleanHouseholdName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Household name is required.');
  }

  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw new HttpsError('invalid-argument', 'Household name must be 2 to 80 characters.');
  }
  return name;
}

function cleanInviteCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Invite code is required.');
  }

  const inviteCode = value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(inviteCode)) {
    throw new HttpsError('invalid-argument', 'Invite code must be 6 characters.');
  }
  return inviteCode;
}

function cleanId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  const id = value.trim();
  if (id.length === 0 || id.length > 128 || id.includes('/')) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return id;
}

function cleanPositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100000) {
    throw new HttpsError('invalid-argument', `${fieldName} must be greater than zero.`);
  }
  return value;
}

function cleanMoneyCents(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100000000) {
    throw new HttpsError('invalid-argument', `${fieldName} must be a valid non-negative amount.`);
  }
  return value;
}

function cleanStoreName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Store name is required.');
  }

  const storeName = value.trim();
  if (storeName.length < 1 || storeName.length > 100) {
    throw new HttpsError('invalid-argument', 'Store name must be 1 to 100 characters.');
  }
  return storeName;
}

function cleanPurchaseDate(value: unknown): Timestamp {
  if (value === undefined || value === null || value === '') {
    return Timestamp.now();
  }
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Purchase date is invalid.');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Purchase date is invalid.');
  }

  const now = Date.now();
  const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
  const oneDayAhead = now + 24 * 60 * 60 * 1000;
  if (date.getTime() < fiveYearsAgo || date.getTime() > oneDayAhead) {
    throw new HttpsError('invalid-argument', 'Purchase date is outside the allowed range.');
  }

  return Timestamp.fromDate(date);
}

function generateInviteCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes as Uint8Array, (byte: number) =>
    INVITE_ALPHABET.charAt(byte % INVITE_ALPHABET.length),
  ).join('');
}

function getInventoryStatus(quantity: number, lowStockThreshold: unknown): 'available' | 'low_stock' | 'out_of_stock' {
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

async function getUserIdentity(uid: string, token: AuthTokenLike) {
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const user = userSnapshot.data();

  const displayName =
    typeof user?.displayName === 'string'
      ? user.displayName
      : typeof token.name === 'string'
        ? token.name
        : 'Household member';

  const email =
    typeof user?.email === 'string'
      ? user.email
      : typeof token.email === 'string'
        ? token.email
        : '';

  return { displayName, email };
}

export const createHousehold = onCall<CreateHouseholdRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const name = cleanHouseholdName(request.data.name);
    const identity = await getUserIdentity(uid, request.auth?.token ?? {});

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const inviteCode = generateInviteCode();
      const householdRef = db.collection('households').doc();
      const memberRef = householdRef.collection('members').doc(uid);
      const inviteRef = db.doc(`inviteCodes/${inviteCode}`);
      const userRef = db.doc(`users/${uid}`);

      try {
        await db.runTransaction(async (transaction) => {
          const existingInvite = await transaction.get(inviteRef);
          if (existingInvite.exists) {
            throw new Error('INVITE_COLLISION');
          }

          transaction.create(householdRef, {
            name,
            createdBy: uid,
            inviteCode,
            currency: 'EUR',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          transaction.create(memberRef, {
            userId: uid,
            displayName: identity.displayName,
            email: identity.email,
            role: 'owner',
            joinedAt: FieldValue.serverTimestamp(),
          });

          transaction.create(inviteRef, {
            householdId: householdRef.id,
            active: true,
            createdAt: FieldValue.serverTimestamp(),
          });

          transaction.set(
            userRef,
            {
              defaultHouseholdId: householdRef.id,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });

        return { householdId: householdRef.id, inviteCode };
      } catch (error) {
        if (error instanceof Error && error.message === 'INVITE_COLLISION') {
          continue;
        }
        throw error;
      }
    }

    throw new HttpsError('resource-exhausted', 'Could not generate a unique invite code.');
  },
);

export const joinHousehold = onCall<JoinHouseholdRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const inviteCode = cleanInviteCode(request.data.inviteCode);
    const identity = await getUserIdentity(uid, request.auth?.token ?? {});
    const inviteRef = db.doc(`inviteCodes/${inviteCode}`);

    const result = await db.runTransaction(async (transaction) => {
      const inviteSnapshot = await transaction.get(inviteRef);
      if (!inviteSnapshot.exists || inviteSnapshot.data()?.active !== true) {
        throw new HttpsError('not-found', 'Invite code is invalid or no longer active.');
      }

      const householdId = inviteSnapshot.data()?.householdId;
      if (typeof householdId !== 'string' || householdId.length === 0) {
        throw new HttpsError('data-loss', 'Invite code is not linked to a valid household.');
      }

      const householdRef = db.doc(`households/${householdId}`);
      const memberRef = db.doc(`households/${householdId}/members/${uid}`);
      const userRef = db.doc(`users/${uid}`);

      const householdSnapshot = await transaction.get(householdRef);
      const memberSnapshot = await transaction.get(memberRef);

      if (!householdSnapshot.exists) {
        throw new HttpsError('not-found', 'Household no longer exists.');
      }

      if (!memberSnapshot.exists) {
        transaction.create(memberRef, {
          userId: uid,
          displayName: identity.displayName,
          email: identity.email,
          role: 'member',
          joinedAt: FieldValue.serverTimestamp(),
        });

        const activityRef = householdRef.collection('activities').doc();
        transaction.create(activityRef, {
          type: 'member_joined',
          actorId: uid,
          metadata: {
            memberId: uid,
            displayName: identity.displayName,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.set(
        userRef,
        { defaultHouseholdId: householdId, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );

      return { householdId, alreadyMember: memberSnapshot.exists };
    });

    return result;
  },
);

export const purchaseShoppingListItem = onCall<PurchaseShoppingListItemRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const shoppingListItemId = cleanId(request.data.shoppingListItemId, 'Shopping list item');
    const quantityPurchased = cleanPositiveNumber(request.data.quantityPurchased, 'Quantity');
    const unitPriceCents = cleanMoneyCents(request.data.unitPriceCents, 'Unit price');
    const storeName = cleanStoreName(request.data.storeName);
    const purchasedAt = cleanPurchaseDate(request.data.purchasedAt);

    const memberRef = db.doc(`households/${householdId}/members/${uid}`);
    const shoppingRef = db.doc(`households/${householdId}/shoppingList/${shoppingListItemId}`);

    const result = await db.runTransaction(async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      if (!memberSnapshot.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }

      const shoppingSnapshot = await transaction.get(shoppingRef);
      if (!shoppingSnapshot.exists) {
        throw new HttpsError('not-found', 'Shopping list item no longer exists.');
      }

      const shoppingItem = shoppingSnapshot.data();
      if (shoppingItem.status !== 'active') {
        throw new HttpsError('failed-precondition', 'This shopping list item is no longer active.');
      }

      const itemId = shoppingItem.itemId;
      if (typeof itemId !== 'string' || itemId.length === 0) {
        throw new HttpsError('failed-precondition', 'This shopping item is not linked to inventory yet.');
      }

      const inventoryRef = db.doc(`households/${householdId}/items/${itemId}`);
      const inventorySnapshot = await transaction.get(inventoryRef);
      if (!inventorySnapshot.exists) {
        throw new HttpsError('not-found', 'Inventory item no longer exists.');
      }

      const inventory = inventorySnapshot.data();
      const currentQuantity =
        typeof inventory.quantity === 'number' && Number.isFinite(inventory.quantity)
          ? inventory.quantity
          : 0;
      const previousPriceCents =
        typeof inventory.currentPriceCents === 'number' && Number.isInteger(inventory.currentPriceCents)
          ? inventory.currentPriceCents
          : null;
      const currency = typeof inventory.currency === 'string' ? inventory.currency : 'EUR';
      const itemName =
        typeof inventory.name === 'string'
          ? inventory.name
          : typeof shoppingItem.name === 'string'
            ? shoppingItem.name
            : 'Item';
      const unit = typeof inventory.unit === 'string' ? inventory.unit : 'piece';
      const newQuantity = currentQuantity + quantityPurchased;
      const status = getInventoryStatus(newQuantity, inventory.lowStockThreshold);
      if (!ITEM_STATUSES.has(status)) {
        throw new HttpsError('internal', 'Could not determine inventory status.');
      }

      const priceChangeCents =
        previousPriceCents === null ? null : unitPriceCents - previousPriceCents;
      const priceChangePercentage =
        previousPriceCents && previousPriceCents > 0 && priceChangeCents !== null
          ? Math.round((priceChangeCents / previousPriceCents) * 10000) / 100
          : null;
      const totalPriceCents = Math.round(unitPriceCents * quantityPurchased);

      const purchaseRef = db.collection(`households/${householdId}/purchases`).doc();
      const activityRef = db.collection(`households/${householdId}/activities`).doc();
      const priceHistoryRef =
        previousPriceCents !== null && previousPriceCents !== unitPriceCents
          ? db.collection(`households/${householdId}/priceHistory`).doc()
          : null;

      transaction.create(purchaseRef, {
        itemId,
        shoppingListItemId,
        itemName,
        storeName,
        quantityPurchased,
        unit,
        unitPriceCents,
        totalPriceCents,
        currency,
        purchasedBy: uid,
        purchasedAt,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (priceHistoryRef) {
        transaction.create(priceHistoryRef, {
          itemId,
          purchaseId: purchaseRef.id,
          itemName,
          storeName,
          previousPriceCents,
          newPriceCents: unitPriceCents,
          differenceCents: priceChangeCents,
          percentageChange: priceChangePercentage,
          currency,
          changedBy: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.update(inventoryRef, {
        quantity: newQuantity,
        status,
        currentPriceCents: unitPriceCents,
        previousPriceCents,
        priceChangeCents,
        priceChangePercentage,
        lastPurchase: {
          storeName,
          priceCents: unitPriceCents,
          quantity: quantityPurchased,
          purchasedAt,
        },
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(shoppingRef, {
        status: 'purchased',
        purchasedBy: uid,
        purchasedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.create(activityRef, {
        type: 'item_purchased',
        entityId: itemId,
        actorId: uid,
        metadata: {
          itemName,
          storeName,
          quantityPurchased,
          unitPriceCents,
          totalPriceCents,
          currency,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        purchaseId: purchaseRef.id,
        itemId,
        quantity: newQuantity,
        unitPriceCents,
        priceChangeCents,
        priceChangePercentage,
      };
    });

    return result;
  },
);


async function writeActivity(
  householdId: string,
  type: string,
  actorId: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.collection(`households/${householdId}/activities`).add({
    type,
    actorId,
    entityId,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const inventoryItemCreatedActivity = onDocumentCreated(
  { region: REGION, document: 'households/{householdId}/items/{itemId}' },
  async (event) => {
    const item = event.data?.data();
    if (!item) {
      return;
    }

    const actorId = typeof item.addedBy === 'string' ? item.addedBy : 'system';
    await writeActivity(event.params.householdId, 'item_created', actorId, event.params.itemId, {
      itemName: typeof item.name === 'string' ? item.name : 'Item',
      quantity: typeof item.quantity === 'number' ? item.quantity : 0,
    });
  },
);

export const inventoryItemUpdatedActivity = onDocumentUpdated(
  { region: REGION, document: 'households/{householdId}/items/{itemId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) {
      return;
    }

    const actorId = typeof after.updatedBy === 'string' ? after.updatedBy : 'system';
    const itemName = typeof after.name === 'string' ? after.name : 'Item';
    const beforeQuantity = typeof before.quantity === 'number' ? before.quantity : null;
    const afterQuantity = typeof after.quantity === 'number' ? after.quantity : null;

    if (beforeQuantity !== afterQuantity && afterQuantity !== null) {
      await writeActivity(
        event.params.householdId,
        afterQuantity <= 0 ? 'item_finished' : 'quantity_changed',
        actorId,
        event.params.itemId,
        { itemName, from: beforeQuantity, to: afterQuantity },
      );
      return;
    }

    if (before.name !== after.name || before.categoryName !== after.categoryName) {
      await writeActivity(event.params.householdId, 'item_updated', actorId, event.params.itemId, {
        itemName,
      });
    }
  },
);

export const shoppingItemCreatedActivity = onDocumentCreated(
  { region: REGION, document: 'households/{householdId}/shoppingList/{shoppingItemId}' },
  async (event) => {
    const item = event.data?.data();
    if (!item || item.status !== 'active') {
      return;
    }

    const actorId = typeof item.addedBy === 'string' ? item.addedBy : 'system';
    await writeActivity(
      event.params.householdId,
      'shopping_item_added',
      actorId,
      event.params.shoppingItemId,
      { itemName: typeof item.name === 'string' ? item.name : 'Item' },
    );
  },
);

export const shoppingItemReactivatedActivity = onDocumentUpdated(
  { region: REGION, document: 'households/{householdId}/shoppingList/{shoppingItemId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === 'active' || after.status !== 'active') {
      return;
    }

    const actorId = typeof after.addedBy === 'string' ? after.addedBy : 'system';
    await writeActivity(
      event.params.householdId,
      'shopping_item_added',
      actorId,
      event.params.shoppingItemId,
      { itemName: typeof after.name === 'string' ? after.name : 'Item' },
    );
  },
);

export const shoppingItemDeletedActivity = onDocumentDeleted(
  { region: REGION, document: 'households/{householdId}/shoppingList/{shoppingItemId}' },
  async (event) => {
    const item = event.data?.data();
    if (!item || item.status !== 'active') {
      return;
    }

    // Deletes are client-authorized household actions; audit actor is not present in the deleted data.
    // Keep the event useful without pretending to know the actor.
    await writeActivity(
      event.params.householdId,
      'shopping_item_removed',
      'system',
      event.params.shoppingItemId,
      { itemName: typeof item.name === 'string' ? item.name : 'Item' },
    );
  },
);

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, string>;
}

function notificationCopy(activity: Record<string, unknown>): { title: string; body: string } | null {
  const type = activity.type;
  const metadata =
    activity.metadata && typeof activity.metadata === 'object'
      ? (activity.metadata as Record<string, unknown>)
      : {};
  const itemName = typeof metadata.itemName === 'string' ? metadata.itemName : 'An item';

  if (type === 'item_finished') {
    return {
      title: 'Item finished',
      body: `${itemName} is finished at home and needs to be bought.`,
    };
  }
  if (type === 'shopping_item_added') {
    return {
      title: 'Shopping list updated',
      body: `${itemName} was added to the shopping list.`,
    };
  }
  if (type === 'item_purchased') {
    const storeName = typeof metadata.storeName === 'string' ? metadata.storeName : null;
    return {
      title: 'Item purchased',
      body: storeName ? `${itemName} was purchased from ${storeName}.` : `${itemName} was purchased.`,
    };
  }
  return null;
}

async function collectHouseholdPushTokens(householdId: string, actorId: unknown): Promise<string[]> {
  const members = await db.collection(`households/${householdId}/members`).get();
  const tokens = new Set<string>();

  await Promise.all(
    members.docs.map(async (member) => {
      if (typeof actorId === 'string' && member.id === actorId) {
        return;
      }

      const devices = await db
        .collection(`users/${member.id}/devices`)
        .where('enabled', '==', true)
        .get();

      for (const device of devices.docs) {
        const token = device.data().expoPushToken;
        if (
          typeof token === 'string' &&
          (token.startsWith('ExpoPushToken[') || token.startsWith('ExponentPushToken['))
        ) {
          tokens.add(token);
        }
      }
    }),
  );

  return [...tokens];
}

async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  for (let start = 0; start < messages.length; start += 100) {
    const chunk = messages.slice(start, start + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      console.error('Expo push request failed', response.status, responseBody.slice(0, 500));
    }
  }
}

export const householdActivityNotification = onDocumentCreated(
  { region: REGION, document: 'households/{householdId}/activities/{activityId}' },
  async (event) => {
    const activity = event.data?.data();
    if (!activity) {
      return;
    }

    const copy = notificationCopy(activity);
    if (!copy) {
      return;
    }

    try {
      const tokens = await collectHouseholdPushTokens(event.params.householdId, activity.actorId);
      const messages: ExpoPushMessage[] = tokens.map((token) => ({
        to: token,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        data: {
          householdId: event.params.householdId,
          activityId: event.params.activityId,
          type: typeof activity.type === 'string' ? activity.type : 'household_update',
          entityId: typeof activity.entityId === 'string' ? activity.entityId : '',
        },
      }));
      await sendExpoPushMessages(messages);
    } catch (error) {
      // Notification delivery should not make the underlying household action fail or retry forever.
      console.error('Unable to send household push notifications', error);
    }
  },
);

interface HouseholdAdminRequest {
  householdId?: unknown;
}

interface RemoveHouseholdMemberRequest extends HouseholdAdminRequest {
  userId?: unknown;
}

interface ChangeHouseholdMemberRoleRequest extends RemoveHouseholdMemberRequest {
  role?: unknown;
}

function cleanMemberRole(value: unknown): 'admin' | 'member' {
  if (value !== 'admin' && value !== 'member') {
    throw new HttpsError('invalid-argument', 'Role must be admin or member.');
  }
  return value;
}

export const regenerateInviteCode = onCall<HouseholdAdminRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nextInviteCode = generateInviteCode();
      const householdRef = db.doc(`households/${householdId}`);
      const memberRef = db.doc(`households/${householdId}/members/${uid}`);
      const nextInviteRef = db.doc(`inviteCodes/${nextInviteCode}`);

      try {
        await db.runTransaction(async (transaction) => {
          const memberSnapshot = await transaction.get(memberRef);
          const householdSnapshot = await transaction.get(householdRef);
          const nextInviteSnapshot = await transaction.get(nextInviteRef);

          if (!memberSnapshot.exists) {
            throw new HttpsError('permission-denied', 'You are not a member of this household.');
          }
          const role = memberSnapshot.data()?.role;
          if (role !== 'owner' && role !== 'admin') {
            throw new HttpsError('permission-denied', 'Only household admins can regenerate invite codes.');
          }
          if (!householdSnapshot.exists) {
            throw new HttpsError('not-found', 'Household no longer exists.');
          }
          if (nextInviteSnapshot.exists) {
            throw new Error('INVITE_COLLISION');
          }

          const currentInviteCode = householdSnapshot.data()?.inviteCode;
          const currentInviteRef =
            typeof currentInviteCode === 'string' && currentInviteCode.length > 0
              ? db.doc(`inviteCodes/${currentInviteCode}`)
              : null;
          const currentInviteSnapshot = currentInviteRef
            ? await transaction.get(currentInviteRef)
            : null;

          if (currentInviteRef && currentInviteSnapshot?.exists) {
            transaction.update(currentInviteRef, {
              active: false,
              deactivatedAt: FieldValue.serverTimestamp(),
              deactivatedBy: uid,
            });
          }

          transaction.create(nextInviteRef, {
            householdId,
            active: true,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
          });
          transaction.update(householdRef, {
            inviteCode: nextInviteCode,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });

        return { inviteCode: nextInviteCode };
      } catch (error) {
        if (error instanceof Error && error.message === 'INVITE_COLLISION') {
          continue;
        }
        throw error;
      }
    }

    throw new HttpsError('resource-exhausted', 'Could not generate a unique invite code.');
  },
);

export const removeHouseholdMember = onCall<RemoveHouseholdMemberRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const targetUid = cleanId(request.data.userId, 'Member');

    if (uid === targetUid) {
      throw new HttpsError('invalid-argument', 'Use the leave-household flow to remove yourself.');
    }

    const actorRef = db.doc(`households/${householdId}/members/${uid}`);
    const targetRef = db.doc(`households/${householdId}/members/${targetUid}`);
    const targetUserRef = db.doc(`users/${targetUid}`);
    const activityRef = db.collection(`households/${householdId}/activities`).doc();

    await db.runTransaction(async (transaction) => {
      const actorSnapshot = await transaction.get(actorRef);
      const targetSnapshot = await transaction.get(targetRef);
      const targetUserSnapshot = await transaction.get(targetUserRef);

      if (!actorSnapshot.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }
      if (!targetSnapshot.exists) {
        throw new HttpsError('not-found', 'Household member no longer exists.');
      }

      const actorRole = actorSnapshot.data()?.role;
      const targetRole = targetSnapshot.data()?.role;
      if (actorRole !== 'owner' && actorRole !== 'admin') {
        throw new HttpsError('permission-denied', 'Only household admins can remove members.');
      }
      if (targetRole === 'owner') {
        throw new HttpsError('failed-precondition', 'The household owner cannot be removed.');
      }
      if (actorRole === 'admin' && targetRole === 'admin') {
        throw new HttpsError('permission-denied', 'Only the owner can remove another admin.');
      }

      transaction.delete(targetRef);
      if (targetUserSnapshot.data()?.defaultHouseholdId === householdId) {
        transaction.update(targetUserRef, {
          defaultHouseholdId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(activityRef, {
        type: 'member_removed',
        actorId: uid,
        entityId: targetUid,
        metadata: {
          displayName:
            typeof targetSnapshot.data()?.displayName === 'string'
              ? targetSnapshot.data()?.displayName
              : 'Household member',
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  },
);

export const changeHouseholdMemberRole = onCall<ChangeHouseholdMemberRoleRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const targetUid = cleanId(request.data.userId, 'Member');
    const role = cleanMemberRole(request.data.role);

    if (uid === targetUid) {
      throw new HttpsError('invalid-argument', 'You cannot change your own household role.');
    }

    const actorRef = db.doc(`households/${householdId}/members/${uid}`);
    const targetRef = db.doc(`households/${householdId}/members/${targetUid}`);

    await db.runTransaction(async (transaction) => {
      const actorSnapshot = await transaction.get(actorRef);
      const targetSnapshot = await transaction.get(targetRef);

      if (!actorSnapshot.exists || actorSnapshot.data()?.role !== 'owner') {
        throw new HttpsError('permission-denied', 'Only the household owner can change roles.');
      }
      if (!targetSnapshot.exists) {
        throw new HttpsError('not-found', 'Household member no longer exists.');
      }
      if (targetSnapshot.data()?.role === 'owner') {
        throw new HttpsError('failed-precondition', 'The owner role cannot be reassigned here.');
      }

      transaction.update(targetRef, { role, updatedAt: FieldValue.serverTimestamp() });
    });

    return { success: true, role };
  },
);
