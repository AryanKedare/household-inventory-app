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
    projectId: 'household-ai-rules-dev',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

async function seedAiState() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'households', 'home-ai'), {
      name: 'AI Home',
      createdBy: 'member-ai',
      inviteCode: 'AI2345',
      currency: 'EUR',
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-ai', 'members', 'member-ai'), {
      userId: 'member-ai',
      displayName: 'Member AI',
      email: 'member-ai@example.test',
      role: 'owner',
      joinedAt: createdAt,
    });
    await setDoc(doc(db, 'households', 'home-ai', 'aiInsights', '2026-08'), {
      period: '2026-08',
      summary: 'Household summary',
      model: 'openai/gpt-oss-20b',
      generatedAt: createdAt,
    });
    await setDoc(doc(db, 'aiUsage', 'member-ai_2026-08-10'), {
      uid: 'member-ai',
      day: '2026-08-10',
      insights: 1,
    });
  });
}

test('household AI insights are member-readable but backend-write-only', async () => {
  await testEnv.clearFirestore();
  await seedAiState();

  const memberDb = testEnv.authenticatedContext('member-ai').firestore();
  const outsiderDb = testEnv.authenticatedContext('outsider-ai').firestore();
  const insightRef = doc(memberDb, 'households', 'home-ai', 'aiInsights', '2026-08');

  await assertSucceeds(getDoc(insightRef));
  await assertFails(
    setDoc(doc(memberDb, 'households', 'home-ai', 'aiInsights', '2026-09'), {
      period: '2026-09',
      summary: 'Forged insight',
    }),
  );
  await assertFails(getDoc(doc(outsiderDb, 'households', 'home-ai', 'aiInsights', '2026-08')));
});

test('AI quota state is inaccessible to clients', async () => {
  await testEnv.clearFirestore();
  await seedAiState();

  const db = testEnv.authenticatedContext('member-ai').firestore();
  await assertFails(getDoc(doc(db, 'aiUsage', 'member-ai_2026-08-10')));
  await assertFails(
    setDoc(doc(db, 'aiUsage', 'member-ai_2026-08-11'), {
      uid: 'member-ai',
      day: '2026-08-11',
      insights: 0,
    }),
  );
});
