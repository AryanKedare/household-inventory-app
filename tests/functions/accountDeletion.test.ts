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
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
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

async function createAuthedUser(prefix: string): Promise<{
  user: User;
  auth: Auth;
  functions: Functions;
  email: string;
}> {
  sequence += 1;
  const name = `${prefix}-${sequence}`;
  const email = `${name}@example.test`;
  const app = initializeApp(
    { apiKey: 'demo-key', authDomain: `${PROJECT_ID}.firebaseapp.com`, projectId: PROJECT_ID },
    name,
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { user: credential.user, auth, functions, email };
}

function callableErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

test('non-owner can delete account while shared household history remains', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('delete-account-owner');
  const member = await createAuthedUser('delete-account-member');

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'households', 'account-home'), {
      name: 'Account Home',
      createdBy: owner.user.uid,
      inviteCode: 'ACC234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    for (const [user, role] of [[owner.user, 'owner'], [member.user, 'member']] as const) {
      await setDoc(doc(db, 'households', 'account-home', 'members', user.uid), {
        userId: user.uid,
        displayName: role === 'owner' ? 'Owner' : 'Member',
        email: user.email ?? '',
        role,
        joinedAt: createdAt,
      });
    }
    await setDoc(doc(db, 'users', member.user.uid), {
      displayName: 'Member',
      email: member.email,
      defaultHouseholdId: 'account-home',
      preferences: { currency: 'EUR', notificationsEnabled: true, theme: 'system' },
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'users', member.user.uid, 'devices', 'device-a'), {
      expoPushToken: 'ExpoPushToken[test]',
      enabled: true,
    });
    await setDoc(doc(db, 'aiUsage', `${member.user.uid}_2026-08-10`), {
      uid: member.user.uid,
      day: '2026-08-10',
      category: 2,
    });
    await setDoc(doc(db, 'households', 'account-home', 'expenses', 'history'), {
      title: 'Shared dinner',
      paidBy: owner.user.uid,
      participantIds: [owner.user.uid, member.user.uid],
      totalPaidCents: 2000,
      debts: [{ fromUserId: member.user.uid, toUserId: owner.user.uid, amountCents: 1000 }],
    });
  });

  const deleteAccount = httpsCallable<Record<string, never>, { success: boolean }>(
    member.functions,
    'deleteAccount',
  );
  const result = await deleteAccount({});
  assert.equal(result.data.success, true);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'users', member.user.uid))).exists(), false);
    assert.equal(
      (await getDoc(doc(db, 'users', member.user.uid, 'devices', 'device-a'))).exists(),
      false,
    );
    assert.equal(
      (await getDoc(doc(db, 'households', 'account-home', 'members', member.user.uid))).exists(),
      false,
    );
    assert.equal((await getDoc(doc(db, 'aiUsage', `${member.user.uid}_2026-08-10`))).exists(), false);
    assert.equal((await getDoc(doc(db, 'households', 'account-home', 'expenses', 'history'))).exists(), true);
  });

  await signOut(member.auth);
  await assert.rejects(() => signInWithEmailAndPassword(member.auth, member.email, PASSWORD));
});

test('household owner must transfer or delete owned household before deleting account', async () => {
  await testEnv.clearFirestore();
  const owner = await createAuthedUser('delete-account-blocked-owner');

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'users', owner.user.uid), {
      displayName: 'Owner',
      email: owner.email,
      preferences: { currency: 'EUR', notificationsEnabled: false, theme: 'system' },
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'owned-home'), {
      name: 'Owned Home',
      createdBy: owner.user.uid,
      inviteCode: 'OWN234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'owned-home', 'members', owner.user.uid), {
      userId: owner.user.uid,
      displayName: 'Owner',
      email: owner.email,
      role: 'owner',
      joinedAt: createdAt,
    });
  });

  const deleteAccount = httpsCallable<Record<string, never>, unknown>(
    owner.functions,
    'deleteAccount',
  );
  await assert.rejects(
    () => deleteAccount({}),
    (error: unknown) => callableErrorCode(error) === 'functions/failed-precondition',
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    assert.equal((await getDoc(doc(context.firestore(), 'users', owner.user.uid))).exists(), true);
  });
});
