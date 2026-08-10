import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  type User,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';

const PROJECT_ID = 'demo-homestock';
const PASSWORD = 'TestPassword123!';
let testEnv: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
let sequence = 0;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await testEnv.cleanup();
});

async function createAuthedUser(prefix: string): Promise<{ user: User; functions: Functions }> {
  sequence += 1;
  const appName = `${prefix}-${sequence}`;
  const email = `${appName}@example.test`;
  const app = initializeApp(
    { apiKey: 'demo-key', authDomain: `${PROJECT_ID}.firebaseapp.com`, projectId: PROJECT_ID },
    appName,
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { user: credential.user, functions };
}

async function seedMembers(householdId: string, users: User[]) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'households', householdId), {
      name: 'Concurrency Home',
      createdBy: users[0]?.uid ?? 'system',
      inviteCode: 'CON234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    for (const [index, user] of users.entries()) {
      await setDoc(doc(db, 'households', householdId, 'members', user.uid), {
        userId: user.uid,
        displayName: `Member ${index + 1}`,
        email: user.email ?? '',
        role: index === 0 ? 'owner' : 'member',
        joinedAt: createdAt,
      });
    }
  });
}

function successful<T>(results: PromiseSettledResult<T>[]): PromiseFulfilledResult<T>[] {
  return results.filter((result): result is PromiseFulfilledResult<T> => result.status === 'fulfilled');
}

function failed<T>(results: PromiseSettledResult<T>[]): PromiseRejectedResult[] {
  return results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
}

test('simultaneous inventory increments preserve both user changes', async () => {
  await testEnv.clearFirestore();
  const first = await createAuthedUser('qty-first');
  const second = await createAuthedUser('qty-second');
  await seedMembers('qty-home', [first.user, second.user]);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const createdAt = Timestamp.fromMillis(2);
    await setDoc(doc(context.firestore(), 'households', 'qty-home', 'items', 'milk'), {
      name: 'Milk',
      normalizedName: 'milk',
      categoryId: 'dairy',
      categoryName: 'Dairy',
      barcode: null,
      quantity: 1,
      unit: 'l',
      lowStockThreshold: 1,
      status: 'low_stock',
      currentPriceCents: 200,
      currency: 'EUR',
      addedBy: first.user.uid,
      updatedBy: first.user.uid,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const firstAdjust = httpsCallable<Record<string, unknown>, { quantity: number }>(
    first.functions,
    'adjustInventoryQuantity',
  );
  const secondAdjust = httpsCallable<Record<string, unknown>, { quantity: number }>(
    second.functions,
    'adjustInventoryQuantity',
  );

  const results = await Promise.allSettled([
    firstAdjust({ householdId: 'qty-home', itemId: 'milk', delta: 1 }),
    secondAdjust({ householdId: 'qty-home', itemId: 'milk', delta: 1 }),
  ]);
  assert.equal(successful(results).length, 2);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const item = await getDoc(doc(context.firestore(), 'households', 'qty-home', 'items', 'milk'));
    assert.equal(item.data()?.quantity, 3);
    assert.equal(item.data()?.status, 'available');
  });
});

test('simultaneous purchases create exactly one purchase and replenish stock once', async () => {
  await testEnv.clearFirestore();
  const first = await createAuthedUser('purchase-first');
  const second = await createAuthedUser('purchase-second');
  await seedMembers('purchase-home', [first.user, second.user]);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(2);
    await setDoc(doc(db, 'households', 'purchase-home', 'items', 'bread'), {
      name: 'Bread',
      normalizedName: 'bread',
      categoryId: 'bakery',
      categoryName: 'Bakery',
      barcode: null,
      quantity: 0,
      unit: 'piece',
      lowStockThreshold: 1,
      status: 'out_of_stock',
      currentPriceCents: 150,
      currency: 'EUR',
      addedBy: first.user.uid,
      updatedBy: first.user.uid,
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'purchase-home', 'shoppingList', 'bread'), {
      itemId: 'bread',
      name: 'Bread',
      categoryId: 'bakery',
      categoryName: 'Bakery',
      quantityNeeded: 1,
      unit: 'piece',
      estimatedPriceCents: 150,
      priority: 'normal',
      status: 'active',
      addedBy: first.user.uid,
      addedAt: createdAt,
      updatedAt: createdAt,
    });
  });

  const purchaseInput = {
    householdId: 'purchase-home',
    shoppingListItemId: 'bread',
    quantityPurchased: 1,
    unitPriceCents: 175,
    storeName: 'Aldi',
    purchasedAt: new Date().toISOString(),
  };
  const firstPurchase = httpsCallable<typeof purchaseInput, unknown>(
    first.functions,
    'purchaseShoppingListItem',
  );
  const secondPurchase = httpsCallable<typeof purchaseInput, unknown>(
    second.functions,
    'purchaseShoppingListItem',
  );

  const results = await Promise.allSettled([
    firstPurchase(purchaseInput),
    secondPurchase(purchaseInput),
  ]);
  assert.equal(successful(results).length, 1);
  assert.equal(failed(results).length, 1);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const item = await getDoc(doc(db, 'households', 'purchase-home', 'items', 'bread'));
    const shopping = await getDoc(doc(db, 'households', 'purchase-home', 'shoppingList', 'bread'));
    const purchases = await getDocs(collection(db, 'households', 'purchase-home', 'purchases'));
    assert.equal(item.data()?.quantity, 1);
    assert.equal(shopping.data()?.status, 'purchased');
    assert.equal(purchases.size, 1);
  });
});

test('simultaneous repayments cannot over-settle a debt', async () => {
  await testEnv.clearFirestore();
  const payer = await createAuthedUser('settle-payer');
  const debtor = await createAuthedUser('settle-debtor');
  await seedMembers('settle-home', [payer.user, debtor.user]);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const createdAt = Timestamp.fromMillis(2);
    await setDoc(doc(context.firestore(), 'households', 'settle-home', 'expenses', 'dinner'), {
      title: 'Dinner',
      categoryId: 'dining_out',
      categorySource: 'manual',
      paidBy: payer.user.uid,
      paidByName: 'Payer',
      participantIds: [payer.user.uid, debtor.user.uid],
      participantSubtotals: [],
      lineItems: [],
      subtotalCents: 1000,
      discountCents: 0,
      feeCents: 0,
      totalPaidCents: 1000,
      allocations: [],
      debts: [{
        fromUserId: debtor.user.uid,
        toUserId: payer.user.uid,
        amountCents: 1000,
        settledCents: 0,
      }],
      settlementStatus: 'open',
      currency: 'EUR',
      expenseDate: createdAt,
      createdBy: payer.user.uid,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const input = {
    householdId: 'settle-home',
    expenseId: 'dinner',
    fromUserId: debtor.user.uid,
    amountCents: 600,
  };
  const payerSettle = httpsCallable<typeof input, unknown>(payer.functions, 'recordExpenseSettlement');
  const debtorSettle = httpsCallable<typeof input, unknown>(debtor.functions, 'recordExpenseSettlement');

  const results = await Promise.allSettled([payerSettle(input), debtorSettle(input)]);
  assert.equal(successful(results).length, 1);
  assert.equal(failed(results).length, 1);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const expense = await getDoc(doc(db, 'households', 'settle-home', 'expenses', 'dinner'));
    const settlements = await getDocs(collection(db, 'households', 'settle-home', 'settlements'));
    assert.equal(expense.data()?.debts?.[0]?.settledCents, 600);
    assert.equal(expense.data()?.settlementStatus, 'partial');
    assert.equal(settlements.size, 1);
  });
});
