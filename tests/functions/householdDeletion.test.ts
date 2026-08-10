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
import { deleteDoc, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
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

async function seedHousehold(owner: User, withSecondMember?: User) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'users', owner.uid), {
      displayName: 'Owner',
      email: owner.email ?? '',
      defaultHouseholdId: 'delete-home',
      preferences: { currency: 'EUR', notificationsEnabled: false, theme: 'system' },
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'delete-home'), {
      name: 'Delete Home',
      createdBy: owner.uid,
      inviteCode: 'DEL234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'delete-home', 'members', owner.uid), {
      userId: owner.uid,
      displayName: 'Owner',
      email: owner.email ?? '',
      role: 'owner',
      joinedAt: createdAt,
    });
    if (withSecondMember) {
      await setDoc(doc(db, 'households', 'delete-home', 'members', withSecondMember.uid), {
        userId: withSecondMember.uid,
        displayName: 'Member',
        email: withSecondMember.email ?? '',
        role: 'member',
        joinedAt: createdAt,
      });
    }
    await setDoc(doc(db, 'inviteCodes', 'DEL234'), {
      householdId: 'delete-home',
      active: true,
      createdAt,
    });
    await setDoc(doc(db, 'households', 'delete-home', 'items', 'milk'), {
      name: 'Milk',
      quantity: 1,
      currentPriceCents: 200,
    });
    await setDoc(doc(db, 'households', 'delete-home', 'expenses', 'dinner'), {
      title: 'Dinner',
      totalPaidCents: 5000,
    });
    await setDoc(doc(db, 'households', 'delete-home', 'settlements', 'repayment'), {
      expenseId: 'dinner',
      amountCents: 1000,
    });
    await setDoc(doc(db, 'households', 'delete-home', 'aiInsights', '2026-08'), {
      summary: 'Insight',
    });
  });
}

test('sole owner can delete household and all nested household data', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('delete-owner', 'delete-owner@example.test');
  await seedHousehold(owner.user);

  const deleteHousehold = httpsCallable<
    { householdId: string },
    { success: boolean; alreadyDeleted: boolean }
  >(owner.functions, 'deleteHousehold');
  const result = await deleteHousehold({ householdId: 'delete-home' });
  assert.equal(result.data.success, true);
  assert.equal(result.data.alreadyDeleted, false);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'households', 'delete-home'))).exists(), false);
    assert.equal((await getDoc(doc(db, 'households', 'delete-home', 'items', 'milk'))).exists(), false);
    assert.equal((await getDoc(doc(db, 'households', 'delete-home', 'expenses', 'dinner'))).exists(), false);
    assert.equal((await getDoc(doc(db, 'households', 'delete-home', 'settlements', 'repayment'))).exists(), false);
    assert.equal((await getDoc(doc(db, 'households', 'delete-home', 'aiInsights', '2026-08'))).exists(), false);
    assert.equal((await getDoc(doc(db, 'inviteCodes', 'DEL234'))).exists(), false);
    const ownerProfile = await getDoc(doc(db, 'users', owner.user.uid));
    assert.equal(ownerProfile.data()?.defaultHouseholdId, undefined);
  });
});

test('owner cannot delete household while another member remains', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('delete-owner-2', 'delete-owner-2@example.test');
  const member = await createAuthedUser('delete-member-2', 'delete-member-2@example.test');
  await seedHousehold(owner.user, member.user);

  const deleteHousehold = httpsCallable<{ householdId: string }, unknown>(
    owner.functions,
    'deleteHousehold',
  );
  await assert.rejects(
    () => deleteHousehold({ householdId: 'delete-home' }),
    (error: unknown) => callableErrorCode(error) === 'functions/failed-precondition',
  );
});

test('deletion starter can safely retry after child documents were partially removed', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('delete-retry-owner', 'delete-retry-owner@example.test');
  await seedHousehold(owner.user);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(db, 'households', 'delete-home'),
      {
        deleting: true,
        deletionStartedBy: owner.user.uid,
        deletionStartedAt: Timestamp.fromMillis(2),
        updatedAt: Timestamp.fromMillis(2),
      },
      { merge: true },
    );
    await deleteDoc(doc(db, 'households', 'delete-home', 'members', owner.user.uid));
    await deleteDoc(doc(db, 'inviteCodes', 'DEL234'));
  });

  const deleteHousehold = httpsCallable<
    { householdId: string },
    { success: boolean; alreadyDeleted: boolean }
  >(owner.functions, 'deleteHousehold');
  const result = await deleteHousehold({ householdId: 'delete-home' });
  assert.equal(result.data.success, true);
  assert.equal(result.data.alreadyDeleted, false);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'households', 'delete-home'))).exists(), false);
    const ownerProfile = await getDoc(doc(db, 'users', owner.user.uid));
    assert.equal(ownerProfile.data()?.defaultHouseholdId, undefined);
  });
});

test('another user cannot take over an interrupted household deletion', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('delete-lock-owner', 'delete-lock-owner@example.test');
  const attacker = await createAuthedUser('delete-lock-attacker', 'delete-lock-attacker@example.test');
  await seedHousehold(owner.user);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(db, 'households', 'delete-home'),
      {
        deleting: true,
        deletionStartedBy: owner.user.uid,
        deletionStartedAt: Timestamp.fromMillis(2),
        updatedAt: Timestamp.fromMillis(2),
      },
      { merge: true },
    );
    await deleteDoc(doc(db, 'households', 'delete-home', 'members', owner.user.uid));
  });

  const deleteHousehold = httpsCallable<{ householdId: string }, unknown>(
    attacker.functions,
    'deleteHousehold',
  );
  await assert.rejects(
    () => deleteHousehold({ householdId: 'delete-home' }),
    (error: unknown) => callableErrorCode(error) === 'functions/permission-denied',
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'households', 'delete-home'))).exists(), true);
  });
});
