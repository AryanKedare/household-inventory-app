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
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';

const PROJECT_ID = 'demo-homestock';
const PASSWORD = 'TestPassword123!';

let testEnv: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

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

async function createAuthedUser(
  appName: string,
  email: string,
): Promise<{ user: User; functions: Functions }> {
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
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { user: credential.user, functions };
}

function callableErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

async function seedFinanceHousehold(users: Array<{ user: User; role: 'owner' | 'admin' | 'member'; name: string }>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'households', 'finance-home'), {
      name: 'Finance Home',
      createdBy: users[0]?.user.uid ?? '',
      inviteCode: 'FIN234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });

    for (const entry of users) {
      await setDoc(doc(db, 'households', 'finance-home', 'members', entry.user.uid), {
        userId: entry.user.uid,
        displayName: entry.name,
        email: entry.user.email ?? '',
        role: entry.role,
        joinedAt: createdAt,
      });
      await setDoc(doc(db, 'users', entry.user.uid), {
        displayName: entry.name,
        email: entry.user.email ?? '',
        defaultHouseholdId: 'finance-home',
        preferences: { currency: 'EUR', notificationsEnabled: false, theme: 'system' },
        createdAt,
        updatedAt: createdAt,
      });
    }
  });
}

test('discounted itemized household expense creates exact debts', async () => {
  await testEnv.clearFirestore();
  const person1 = await createAuthedUser('finance-p1', 'finance-p1@example.test');
  const person2 = await createAuthedUser('finance-p2', 'finance-p2@example.test');
  const person3 = await createAuthedUser('finance-p3', 'finance-p3@example.test');
  const person4 = await createAuthedUser('finance-p4', 'finance-p4@example.test');
  const person5 = await createAuthedUser('finance-p5', 'finance-p5@example.test');
  await seedFinanceHousehold([
    { user: person1.user, role: 'owner', name: 'Person 1' },
    { user: person2.user, role: 'member', name: 'Person 2' },
    { user: person3.user, role: 'member', name: 'Person 3' },
    { user: person4.user, role: 'member', name: 'Person 4' },
    { user: person5.user, role: 'member', name: 'Person 5' },
  ]);

  const createExpense = httpsCallable<
    {
      householdId: string;
      title: string;
      merchantName: string;
      categoryId: string;
      paidBy: string;
      expenseDate: string;
      discountCents: number;
      feeCents: number;
      participantSubtotals: Array<{ userId: string; subtotalCents: number }>;
    },
    {
      expenseId: string;
      totalPaidCents: number;
      allocations: Array<{
        userId: string;
        discountShareCents: number;
        owedCents: number;
      }>;
      debts: Array<{ fromUserId: string; toUserId: string; amountCents: number }>;
    }
  >(person1.functions, 'createHouseholdExpense');

  const result = await createExpense({
    householdId: 'finance-home',
    title: 'Dinner together',
    merchantName: 'Example Restaurant',
    categoryId: 'dining_out',
    paidBy: person1.user.uid,
    expenseDate: new Date().toISOString(),
    discountCents: 2000,
    feeCents: 0,
    participantSubtotals: [
      { userId: person1.user.uid, subtotalCents: 1500 },
      { userId: person2.user.uid, subtotalCents: 1000 },
      { userId: person3.user.uid, subtotalCents: 2100 },
      { userId: person4.user.uid, subtotalCents: 5300 },
      { userId: person5.user.uid, subtotalCents: 6700 },
    ],
  });

  assert.equal(result.data.totalPaidCents, 14600);
  const owedByUser = new Map(result.data.allocations.map((allocation) => [allocation.userId, allocation.owedCents]));
  assert.equal(owedByUser.get(person1.user.uid), 1319);
  assert.equal(owedByUser.get(person2.user.uid), 880);
  assert.equal(owedByUser.get(person3.user.uid), 1847);
  assert.equal(owedByUser.get(person4.user.uid), 4661);
  assert.equal(owedByUser.get(person5.user.uid), 5893);
  assert.equal(result.data.debts.length, 4);
  assert.equal(result.data.debts.reduce((sum, debt) => sum + debt.amountCents, 0), 13281);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(
      doc(context.firestore(), 'households', 'finance-home', 'expenses', result.data.expenseId),
    );
    assert.equal(snapshot.data()?.categoryId, 'dining_out');
    assert.equal(snapshot.data()?.subtotalCents, 16600);
    assert.equal(snapshot.data()?.discountCents, 2000);
    assert.equal(snapshot.data()?.totalPaidCents, 14600);
    assert.equal(snapshot.data()?.debts?.length, 4);
  });
});

test('itemized lines split shared purchases and reject outsider participants', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('finance-lines-owner', 'finance-lines-owner@example.test');
  const member = await createAuthedUser('finance-lines-member', 'finance-lines-member@example.test');
  const outsider = await createAuthedUser('finance-lines-outsider', 'finance-lines-outsider@example.test');
  await seedFinanceHousehold([
    { user: owner.user, role: 'owner', name: 'Owner' },
    { user: member.user, role: 'member', name: 'Member' },
  ]);

  const createExpense = httpsCallable<Record<string, unknown>, { totalPaidCents: number; allocations: Array<{ userId: string; owedCents: number }> }>(
    owner.functions,
    'createHouseholdExpense',
  );

  const result = await createExpense({
    householdId: 'finance-home',
    title: 'House supplies',
    merchantName: 'Home Shop',
    categoryId: 'household_supplies',
    paidBy: owner.user.uid,
    expenseDate: new Date().toISOString(),
    discountCents: 100,
    feeCents: 0,
    lineItems: [
      { description: 'Shared detergent', totalCents: 1001, participantIds: [owner.user.uid, member.user.uid] },
      { description: 'Owner item', totalCents: 1500, participantIds: [owner.user.uid] },
    ],
  });
  assert.equal(result.data.totalPaidCents, 2401);
  assert.equal(result.data.allocations.reduce((sum, allocation) => sum + allocation.owedCents, 0), 2401);

  await assert.rejects(
    () =>
      createExpense({
        householdId: 'finance-home',
        title: 'Invalid split',
        categoryId: 'other',
        paidBy: owner.user.uid,
        expenseDate: new Date().toISOString(),
        lineItems: [
          { description: 'Outsider item', totalCents: 1000, participantIds: [outsider.user.uid] },
        ],
      }),
    (error: unknown) => callableErrorCode(error) === 'functions/failed-precondition',
  );
});

test('only household admins can update the monthly budget', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('finance-budget-owner', 'finance-budget-owner@example.test');
  const member = await createAuthedUser('finance-budget-member', 'finance-budget-member@example.test');
  await seedFinanceHousehold([
    { user: owner.user, role: 'owner', name: 'Owner' },
    { user: member.user, role: 'member', name: 'Member' },
  ]);

  const ownerBudget = httpsCallable<Record<string, unknown>, { success: boolean }>(
    owner.functions,
    'upsertMonthlyBudget',
  );
  const memberBudget = httpsCallable<Record<string, unknown>, { success: boolean }>(
    member.functions,
    'upsertMonthlyBudget',
  );

  const result = await ownerBudget({
    householdId: 'finance-home',
    period: '2026-08',
    totalLimitCents: 250000,
    categoryLimits: [
      { categoryId: 'groceries', limitCents: 50000 },
      { categoryId: 'dining_out', limitCents: 30000 },
      { categoryId: 'transport_commute', limitCents: 20000 },
    ],
  });
  assert.equal(result.data.success, true);

  await assert.rejects(
    () =>
      memberBudget({
        householdId: 'finance-home',
        period: '2026-08',
        totalLimitCents: 1,
        categoryLimits: [],
      }),
    (error: unknown) => callableErrorCode(error) === 'functions/permission-denied',
  );
});
