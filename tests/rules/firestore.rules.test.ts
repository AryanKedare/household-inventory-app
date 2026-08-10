import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'household-app-dev',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

async function seedHousehold() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);

    await setDoc(doc(db, 'households', 'home-a'), {
      name: 'Home A',
      createdBy: 'owner-a',
      inviteCode: 'ABC234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-a', 'members', 'member-a'), {
      userId: 'member-a',
      displayName: 'Member A',
      email: 'member@example.test',
      role: 'member',
      joinedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-a', 'members', 'owner-a'), {
      userId: 'owner-a',
      displayName: 'Owner A',
      email: 'owner@example.test',
      role: 'owner',
      joinedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-a', 'items', 'milk'), {
      name: 'Milk',
      normalizedName: 'milk',
      categoryId: 'dairy',
      categoryName: 'Dairy',
      barcode: null,
      quantity: 1,
      unit: 'l',
      lowStockThreshold: null,
      status: 'available',
      currentPriceCents: 275,
      currency: 'EUR',
      addedBy: 'member-a',
      updatedBy: 'member-a',
      createdAt,
      updatedAt: createdAt,
    });
  });
}

test('household member can read household inventory', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('member-a').firestore();
  await assertSucceeds(getDoc(doc(db, 'households', 'home-a', 'items', 'milk')));
});

test('outsider cannot read another household inventory', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('outsider').firestore();
  await assertFails(getDoc(doc(db, 'households', 'home-a', 'items', 'milk')));
});

test('client cannot add or change household membership directly', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();
  await assertFails(
    setDoc(doc(outsiderDb, 'households', 'home-a', 'members', 'outsider'), {
      userId: 'outsider',
      role: 'member',
    }),
  );

  const memberDb = testEnv.authenticatedContext('member-a').firestore();
  await assertFails(
    updateDoc(doc(memberDb, 'households', 'home-a', 'members', 'member-a'), {
      role: 'owner',
    }),
  );
});

test('member can update valid inventory but cannot set negative quantity', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('member-a').firestore();
  const itemRef = doc(db, 'households', 'home-a', 'items', 'milk');

  await assertSucceeds(
    updateDoc(itemRef, {
      quantity: 2,
      status: 'available',
      updatedBy: 'member-a',
      updatedAt: Timestamp.fromMillis(2),
    }),
  );
  await assertFails(
    updateDoc(itemRef, {
      quantity: -1,
      status: 'out_of_stock',
      updatedBy: 'member-a',
      updatedAt: Timestamp.fromMillis(3),
    }),
  );
});

test('inventory status must match quantity and low-stock threshold', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('member-a').firestore();
  const itemRef = doc(db, 'households', 'home-a', 'items', 'milk');

  await assertFails(
    updateDoc(itemRef, {
      quantity: 0,
      status: 'available',
      updatedBy: 'member-a',
      updatedAt: Timestamp.fromMillis(2),
    }),
  );
  await assertSucceeds(
    updateDoc(itemRef, {
      quantity: 0,
      status: 'out_of_stock',
      updatedBy: 'member-a',
      updatedAt: Timestamp.fromMillis(3),
    }),
  );
});

test('member cannot spoof inventory audit ownership', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('member-a').firestore();
  await assertFails(
    updateDoc(doc(db, 'households', 'home-a', 'items', 'milk'), {
      addedBy: 'owner-a',
      updatedBy: 'member-a',
      updatedAt: Timestamp.fromMillis(2),
    }),
  );
});

test('member can create an active shopping item for itself but cannot forge addedBy', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('member-a').firestore();
  const listRef = doc(db, 'households', 'home-a', 'shoppingList', 'milk');
  const base = {
    itemId: 'milk',
    name: 'Milk',
    categoryId: 'dairy',
    categoryName: 'Dairy',
    quantityNeeded: 1,
    unit: 'l',
    estimatedPriceCents: 275,
    priority: 'normal',
    status: 'active',
    addedAt: Timestamp.fromMillis(2),
    updatedAt: Timestamp.fromMillis(2),
  };

  await assertSucceeds(setDoc(listRef, { ...base, addedBy: 'member-a' }));
  await assertFails(setDoc(listRef, { ...base, addedBy: 'owner-a' }));
});

test('client cannot create purchase history directly', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  const db = testEnv.authenticatedContext('member-a').firestore();
  await assertFails(
    setDoc(doc(db, 'households', 'home-a', 'purchases', 'purchase-1'), {
      itemId: 'milk',
      totalPriceCents: 275,
    }),
  );
});

test('finance records are member-readable but backend-write-only', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'households', 'home-a', 'expenses', 'expense-1'), {
      title: 'Dinner',
      totalPaidCents: 5000,
      categoryId: 'dining_out',
    });
    await setDoc(doc(db, 'households', 'home-a', 'budgets', '2026-08'), {
      period: '2026-08',
      totalLimitCents: 100000,
    });
  });

  const memberDb = testEnv.authenticatedContext('member-a').firestore();
  await assertSucceeds(getDoc(doc(memberDb, 'households', 'home-a', 'expenses', 'expense-1')));
  await assertSucceeds(getDoc(doc(memberDb, 'households', 'home-a', 'budgets', '2026-08')));
  await assertFails(
    setDoc(doc(memberDb, 'households', 'home-a', 'expenses', 'forged'), {
      title: 'Forged expense',
      totalPaidCents: 1,
    }),
  );
  await assertFails(
    setDoc(doc(memberDb, 'households', 'home-a', 'budgets', '2026-09'), {
      period: '2026-09',
      totalLimitCents: 1,
    }),
  );

  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();
  await assertFails(getDoc(doc(outsiderDb, 'households', 'home-a', 'expenses', 'expense-1')));
  await assertFails(getDoc(doc(outsiderDb, 'households', 'home-a', 'budgets', '2026-08')));
});

test('push receipt queue is inaccessible to signed-in clients', async () => {
  await testEnv.clearFirestore();
  await seedHousehold();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pushReceipts', 'receipt-1'), {
      expoPushToken: 'ExpoPushToken[test]',
      devicePaths: ['users/member-a/devices/test'],
      sentAt: Timestamp.fromMillis(1),
    });
  });

  const db = testEnv.authenticatedContext('member-a').firestore();
  const receiptRef = doc(db, 'pushReceipts', 'receipt-1');

  await assertFails(getDoc(receiptRef));
  await assertFails(
    setDoc(doc(db, 'pushReceipts', 'receipt-2'), {
      expoPushToken: 'ExpoPushToken[forged]',
      devicePaths: ['users/member-a/devices/forged'],
      sentAt: Timestamp.fromMillis(2),
    }),
  );
});
