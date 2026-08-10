import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'household-settlement-rules-dev',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

async function seedSettlement() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'households', 'home-settle'), {
      name: 'Settlement Home',
      createdBy: 'owner-settle',
      inviteCode: 'STL234',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-settle', 'members', 'member-settle'), {
      userId: 'member-settle',
      displayName: 'Member',
      email: 'member@example.test',
      role: 'member',
      joinedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-settle', 'settlements', 'settlement-1'), {
      expenseId: 'expense-1',
      fromUserId: 'member-settle',
      toUserId: 'owner-settle',
      amountCents: 500,
      currency: 'EUR',
      recordedBy: 'member-settle',
      createdAt,
    });
  });
}

test('household member can read settlements but cannot write them', async () => {
  await testEnv.clearFirestore();
  await seedSettlement();
  const db = testEnv.authenticatedContext('member-settle').firestore();

  await assertSucceeds(getDoc(doc(db, 'households', 'home-settle', 'settlements', 'settlement-1')));
  await assertFails(
    setDoc(doc(db, 'households', 'home-settle', 'settlements', 'forged'), {
      expenseId: 'expense-1',
      fromUserId: 'member-settle',
      toUserId: 'owner-settle',
      amountCents: 1,
    }),
  );
});

test('outsider cannot read household settlements', async () => {
  await testEnv.clearFirestore();
  await seedSettlement();
  const db = testEnv.authenticatedContext('outsider-settle').firestore();
  await assertFails(getDoc(doc(db, 'households', 'home-settle', 'settlements', 'settlement-1')));
});
