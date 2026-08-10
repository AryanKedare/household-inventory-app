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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';

const PROJECT_ID = 'demo-homestock';
const PASSWORD = 'TestPassword123!';

let testEnv: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await testEnv.cleanup();
});

async function createAuthedUser(
  appName: string,
  email: string,
  displayName: string,
): Promise<{ app: FirebaseApp; user: User; functions: Functions }> {
  const app = initializeApp(
    {
      apiKey: 'demo-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    appName,
  );
  apps.push(app);

  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(context.firestore(), 'users', credential.user.uid), {
      displayName,
      email,
      preferences: {
        currency: 'EUR',
        notificationsEnabled: false,
        theme: 'system',
      },
      createdAt,
      updatedAt: createdAt,
    });
  });

  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { app, user: credential.user, functions };
}

function callableErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

test('create, join, and purchase callables preserve the core household flow', async () => {
  await testEnv.clearFirestore();

  const owner = await createAuthedUser(
    'core-owner-flow',
    'core-owner-flow@example.test',
    'Core Owner',
  );
  const member = await createAuthedUser(
    'core-member-flow',
    'core-member-flow@example.test',
    'Core Member',
  );
  const outsider = await createAuthedUser(
    'core-outsider-flow',
    'core-outsider-flow@example.test',
    'Core Outsider',
  );

  const createHousehold = httpsCallable<
    { name: string },
    { householdId: string; inviteCode: string }
  >(owner.functions, 'createHousehold');
  const joinHousehold = httpsCallable<
    { inviteCode: string },
    { householdId: string; alreadyMember: boolean }
  >(member.functions, 'joinHousehold');

  await assert.rejects(
    () => joinHousehold({ inviteCode: 'ZZZZZZ' }),
    (error: unknown) => callableErrorCode(error) === 'functions/not-found',
  );

  const created = await createHousehold({ name: 'Core Flow Home' });
  const { householdId, inviteCode } = created.data;
  assert.match(inviteCode, /^[A-Z2-9]{6}$/);

  const joined = await joinHousehold({ inviteCode });
  assert.equal(joined.data.householdId, householdId);
  assert.equal(joined.data.alreadyMember, false);

  const joinedAgain = await joinHousehold({ inviteCode });
  assert.equal(joinedAgain.data.householdId, householdId);
  assert.equal(joinedAgain.data.alreadyMember, true);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const household = await getDoc(doc(db, 'households', householdId));
    const ownerMember = await getDoc(doc(db, 'households', householdId, 'members', owner.user.uid));
    const joinedMember = await getDoc(doc(db, 'households', householdId, 'members', member.user.uid));
    const ownerProfile = await getDoc(doc(db, 'users', owner.user.uid));
    const memberProfile = await getDoc(doc(db, 'users', member.user.uid));
    const invite = await getDoc(doc(db, 'inviteCodes', inviteCode));
    const activities = await getDocs(collection(db, 'households', householdId, 'activities'));
    const joinActivities = activities.docs.filter((activity) => activity.data().type === 'member_joined');

    assert.equal(household.data()?.name, 'Core Flow Home');
    assert.equal(ownerMember.data()?.role, 'owner');
    assert.equal(joinedMember.data()?.role, 'member');
    assert.equal(ownerProfile.data()?.defaultHouseholdId, householdId);
    assert.equal(memberProfile.data()?.defaultHouseholdId, householdId);
    assert.equal(invite.data()?.householdId, householdId);
    assert.equal(invite.data()?.active, true);
    assert.equal(joinActivities.length, 1);

    const createdAt = Timestamp.fromMillis(2);
    await setDoc(doc(db, 'households', householdId, 'items', 'milk'), {
      name: 'Milk',
      normalizedName: 'milk',
      categoryId: 'dairy',
      categoryName: 'Dairy',
      barcode: null,
      quantity: 0,
      unit: 'l',
      lowStockThreshold: 1,
      status: 'out_of_stock',
      currentPriceCents: 200,
      currency: 'EUR',
      addedBy: owner.user.uid,
      updatedBy: owner.user.uid,
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', householdId, 'shoppingList', 'milk'), {
      itemId: 'milk',
      name: 'Milk',
      categoryId: 'dairy',
      categoryName: 'Dairy',
      quantityNeeded: 2,
      unit: 'l',
      estimatedPriceCents: 200,
      priority: 'normal',
      status: 'active',
      addedBy: owner.user.uid,
      addedAt: createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', householdId, 'items', 'bread'), {
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
      addedBy: owner.user.uid,
      updatedBy: owner.user.uid,
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', householdId, 'shoppingList', 'bread'), {
      itemId: 'bread',
      name: 'Bread',
      categoryId: 'bakery',
      categoryName: 'Bakery',
      quantityNeeded: 1,
      unit: 'piece',
      estimatedPriceCents: 150,
      priority: 'normal',
      status: 'active',
      addedBy: owner.user.uid,
      addedAt: createdAt,
      updatedAt: createdAt,
    });
  });

  const purchase = httpsCallable<
    {
      householdId: string;
      shoppingListItemId: string;
      quantityPurchased: number;
      unitPriceCents: number;
      storeName: string;
      purchasedAt: string;
    },
    {
      purchaseId: string;
      itemId: string;
      quantity: number;
      unitPriceCents: number;
      priceChangeCents: number | null;
      priceChangePercentage: number | null;
    }
  >(member.functions, 'purchaseShoppingListItem');

  const purchased = await purchase({
    householdId,
    shoppingListItemId: 'milk',
    quantityPurchased: 2,
    unitPriceCents: 250,
    storeName: 'Lidl',
    purchasedAt: new Date().toISOString(),
  });

  assert.equal(purchased.data.itemId, 'milk');
  assert.equal(purchased.data.quantity, 2);
  assert.equal(purchased.data.unitPriceCents, 250);
  assert.equal(purchased.data.priceChangeCents, 50);
  assert.equal(purchased.data.priceChangePercentage, 25);

  await assert.rejects(
    () =>
      purchase({
        householdId,
        shoppingListItemId: 'milk',
        quantityPurchased: 1,
        unitPriceCents: 250,
        storeName: 'Lidl',
        purchasedAt: new Date().toISOString(),
      }),
    (error: unknown) => callableErrorCode(error) === 'functions/failed-precondition',
  );

  const outsiderPurchase = httpsCallable<
    {
      householdId: string;
      shoppingListItemId: string;
      quantityPurchased: number;
      unitPriceCents: number;
      storeName: string;
      purchasedAt: string;
    },
    unknown
  >(outsider.functions, 'purchaseShoppingListItem');

  await assert.rejects(
    () =>
      outsiderPurchase({
        householdId,
        shoppingListItemId: 'bread',
        quantityPurchased: 1,
        unitPriceCents: 175,
        storeName: 'Aldi',
        purchasedAt: new Date().toISOString(),
      }),
    (error: unknown) => callableErrorCode(error) === 'functions/permission-denied',
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const inventory = await getDoc(doc(db, 'households', householdId, 'items', 'milk'));
    const shoppingItem = await getDoc(doc(db, 'households', householdId, 'shoppingList', 'milk'));
    const purchases = await getDocs(collection(db, 'households', householdId, 'purchases'));
    const priceHistory = await getDocs(collection(db, 'households', householdId, 'priceHistory'));
    const activities = await getDocs(collection(db, 'households', householdId, 'activities'));

    assert.equal(inventory.data()?.quantity, 2);
    assert.equal(inventory.data()?.status, 'available');
    assert.equal(inventory.data()?.currentPriceCents, 250);
    assert.equal(inventory.data()?.previousPriceCents, 200);
    assert.equal(inventory.data()?.priceChangeCents, 50);
    assert.equal(inventory.data()?.priceChangePercentage, 25);
    assert.equal(inventory.data()?.lastPurchase?.storeName, 'Lidl');
    assert.equal(shoppingItem.data()?.status, 'purchased');
    assert.equal(shoppingItem.data()?.purchasedBy, member.user.uid);

    assert.equal(purchases.size, 1);
    assert.equal(purchases.docs[0]?.data().purchasedBy, member.user.uid);
    assert.equal(purchases.docs[0]?.data().totalPriceCents, 500);

    assert.equal(priceHistory.size, 1);
    assert.equal(priceHistory.docs[0]?.data().previousPriceCents, 200);
    assert.equal(priceHistory.docs[0]?.data().newPriceCents, 250);
    assert.equal(priceHistory.docs[0]?.data().differenceCents, 50);
    assert.equal(priceHistory.docs[0]?.data().percentageChange, 25);

    assert.ok(activities.docs.some((activity) => activity.data().type === 'item_purchased'));
  });
});
