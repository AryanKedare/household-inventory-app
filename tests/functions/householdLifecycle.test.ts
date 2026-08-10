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
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'demo-homestock';
const HOUSEHOLD_ID = 'home-lifecycle';
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

async function createAuthedUser(name: string, email: string): Promise<{ app: FirebaseApp; user: User }> {
  const app = initializeApp(
    {
      apiKey: 'demo-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    name,
  );
  apps.push(app);

  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  return { app, user: credential.user };
}

async function seedHousehold(owner: User, member: User) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);

    await setDoc(doc(db, 'households', HOUSEHOLD_ID), {
      name: 'Lifecycle Home',
      createdBy: owner.uid,
      inviteCode: 'ABC234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', HOUSEHOLD_ID, 'members', owner.uid), {
      userId: owner.uid,
      displayName: 'Owner User',
      email: owner.email,
      role: 'owner',
      joinedAt: createdAt,
    });
    await setDoc(doc(db, 'households', HOUSEHOLD_ID, 'members', member.uid), {
      userId: member.uid,
      displayName: 'Member User',
      email: member.email,
      role: 'member',
      joinedAt: createdAt,
    });
    await setDoc(doc(db, 'users', owner.uid), {
      displayName: 'Owner User',
      email: owner.email,
      defaultHouseholdId: HOUSEHOLD_ID,
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'users', member.uid), {
      displayName: 'Member User',
      email: member.email,
      defaultHouseholdId: HOUSEHOLD_ID,
      createdAt,
      updatedAt: createdAt,
    });
  });
}

test('owner must transfer ownership before leaving, then can leave as admin', async () => {
  await testEnv.clearFirestore();

  const ownerClient = await createAuthedUser('owner-lifecycle', 'owner-lifecycle@example.test');
  const memberClient = await createAuthedUser('member-lifecycle', 'member-lifecycle@example.test');
  await seedHousehold(ownerClient.user, memberClient.user);

  const functions = getFunctions(ownerClient.app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);

  const leave = httpsCallable<{ householdId: string }, { success: boolean }>(
    functions,
    'leaveHousehold',
  );
  const transfer = httpsCallable<
    { householdId: string; userId: string },
    { success: boolean; ownerId: string }
  >(functions, 'transferHouseholdOwnership');

  await assert.rejects(
    () => leave({ householdId: HOUSEHOLD_ID }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'functions/failed-precondition',
  );

  const transferResult = await transfer({
    householdId: HOUSEHOLD_ID,
    userId: memberClient.user.uid,
  });
  assert.equal(transferResult.data.ownerId, memberClient.user.uid);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const previousOwner = await getDoc(
      doc(db, 'households', HOUSEHOLD_ID, 'members', ownerClient.user.uid),
    );
    const nextOwner = await getDoc(
      doc(db, 'households', HOUSEHOLD_ID, 'members', memberClient.user.uid),
    );
    assert.equal(previousOwner.data()?.role, 'admin');
    assert.equal(nextOwner.data()?.role, 'owner');
  });

  const leaveResult = await leave({ householdId: HOUSEHOLD_ID });
  assert.equal(leaveResult.data.success, true);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const previousOwner = await getDoc(
      doc(db, 'households', HOUSEHOLD_ID, 'members', ownerClient.user.uid),
    );
    const nextOwner = await getDoc(
      doc(db, 'households', HOUSEHOLD_ID, 'members', memberClient.user.uid),
    );
    const previousOwnerProfile = await getDoc(doc(db, 'users', ownerClient.user.uid));
    const activities = await getDocs(collection(db, 'households', HOUSEHOLD_ID, 'activities'));
    const activityTypes = activities.docs.map((activity) => activity.data().type);

    assert.equal(previousOwner.exists(), false);
    assert.equal(nextOwner.data()?.role, 'owner');
    assert.equal(previousOwnerProfile.data()?.defaultHouseholdId, undefined);
    assert.ok(activityTypes.includes('ownership_transferred'));
    assert.ok(activityTypes.includes('member_left'));
  });
});
