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

async function createAuthedUser(appName: string, email: string): Promise<{ user: User; functions: Functions }> {
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

function callableErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

async function seedExpense(owner: User, member: User) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'households', 'settlement-home'), {
      name: 'Settlement Home',
      createdBy: owner.uid,
      inviteCode: 'SET234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    for (const [user, role] of [[owner, 'owner'], [member, 'member']] as const) {
      await setDoc(doc(db, 'households', 'settlement-home', 'members', user.uid), {
        userId: user.uid,
        displayName: role === 'owner' ? 'Owner' : 'Member',
        email: user.email ?? '',
        role,
        joinedAt: createdAt,
      });
    }
    await setDoc(doc(db, 'households', 'settlement-home', 'expenses', 'dinner'), {
      title: 'Dinner',
      categoryId: 'dining_out',
      categorySource: 'manual',
      paidBy: owner.uid,
      paidByName: 'Owner',
      participantIds: [owner.uid, member.uid],
      participantSubtotals: [
        { userId: owner.uid, subtotalCents: 1000 },
        { userId: member.uid, subtotalCents: 1000 },
      ],
      lineItems: [],
      subtotalCents: 2000,
      discountCents: 0,
      feeCents: 0,
      totalPaidCents: 2000,
      allocations: [
        { userId: owner.uid, subtotalCents: 1000, discountShareCents: 0, feeShareCents: 0, owedCents: 1000 },
        { userId: member.uid, subtotalCents: 1000, discountShareCents: 0, feeShareCents: 0, owedCents: 1000 },
      ],
      debts: [{ fromUserId: member.uid, toUserId: owner.uid, amountCents: 1000, settledCents: 0 }],
      settlementStatus: 'open',
      currency: 'EUR',
      expenseDate: createdAt,
      createdBy: owner.uid,
      createdAt,
      updatedAt: createdAt,
    });
  });
}

test('debtor and payee can record partial then full settlement', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('settlement-owner', 'settlement-owner@example.test');
  const member = await createAuthedUser('settlement-member', 'settlement-member@example.test');
  await seedExpense(owner.user, member.user);

  const memberSettle = httpsCallable<Record<string, unknown>, {
    remainingCents: number;
    settlementStatus: string;
  }>(member.functions, 'recordExpenseSettlement');
  const ownerSettle = httpsCallable<Record<string, unknown>, {
    remainingCents: number;
    settlementStatus: string;
  }>(owner.functions, 'recordExpenseSettlement');

  const partial = await memberSettle({
    householdId: 'settlement-home',
    expenseId: 'dinner',
    fromUserId: member.user.uid,
    amountCents: 400,
    note: 'Bank transfer part 1',
  });
  assert.equal(partial.data.remainingCents, 600);
  assert.equal(partial.data.settlementStatus, 'partial');

  const full = await ownerSettle({
    householdId: 'settlement-home',
    expenseId: 'dinner',
    fromUserId: member.user.uid,
    amountCents: 600,
    note: 'Received balance',
  });
  assert.equal(full.data.remainingCents, 0);
  assert.equal(full.data.settlementStatus, 'settled');

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const expense = await getDoc(doc(db, 'households', 'settlement-home', 'expenses', 'dinner'));
    assert.equal(expense.data()?.debts?.[0]?.settledCents, 1000);
    assert.equal(expense.data()?.settlementStatus, 'settled');
    const settlements = await getDocs(collection(db, 'households', 'settlement-home', 'settlements'));
    assert.equal(settlements.size, 2);
  });

  await assert.rejects(
    () => memberSettle({
      householdId: 'settlement-home',
      expenseId: 'dinner',
      fromUserId: member.user.uid,
      amountCents: 1,
    }),
    (error: unknown) => callableErrorCode(error) === 'functions/failed-precondition',
  );
});

test('outsider cannot record a repayment and overpayment is rejected', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('settlement-owner-2', 'settlement-owner-2@example.test');
  const member = await createAuthedUser('settlement-member-2', 'settlement-member-2@example.test');
  const outsider = await createAuthedUser('settlement-outsider', 'settlement-outsider@example.test');
  await seedExpense(owner.user, member.user);

  const outsiderSettle = httpsCallable<Record<string, unknown>, unknown>(
    outsider.functions,
    'recordExpenseSettlement',
  );
  await assert.rejects(
    () => outsiderSettle({
      householdId: 'settlement-home',
      expenseId: 'dinner',
      fromUserId: member.user.uid,
      amountCents: 100,
    }),
    (error: unknown) => callableErrorCode(error) === 'functions/permission-denied',
  );

  const memberSettle = httpsCallable<Record<string, unknown>, unknown>(
    member.functions,
    'recordExpenseSettlement',
  );
  await assert.rejects(
    () => memberSettle({
      householdId: 'settlement-home',
      expenseId: 'dinner',
      fromUserId: member.user.uid,
      amountCents: 1001,
    }),
    (error: unknown) => callableErrorCode(error) === 'functions/invalid-argument',
  );
});
