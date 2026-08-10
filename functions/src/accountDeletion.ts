import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();
const adminAuth = getAuth();
const REGION = 'europe-west1';
const RECENT_AUTH_SECONDS = 10 * 60;

function requireUid(auth: { uid: string; token?: Record<string, unknown> } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const authTime = auth.token?.auth_time;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof authTime !== 'number' ||
    !Number.isFinite(authTime) ||
    nowSeconds - authTime > RECENT_AUTH_SECONDS
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Please sign in again before permanently deleting your account.',
    );
  }
  return auth.uid;
}

export const deleteAccount = onCall(
  { region: REGION, enforceAppCheck: false, timeoutSeconds: 120, memory: '256MiB' },
  async (request) => {
    const uid = requireUid(request.auth);
    const membershipQuery = db.collectionGroup('members').where('userId', '==', uid);
    const membershipSnapshot = await membershipQuery.get();

    await db.runTransaction(async (transaction) => {
      const freshMemberships = await Promise.all(
        membershipSnapshot.docs.map((membership) => transaction.get(membership.ref)),
      );

      for (const membership of freshMemberships) {
        if (membership.exists && membership.data()?.role === 'owner') {
          throw new HttpsError(
            'failed-precondition',
            'Transfer ownership or delete every household you own before deleting your account.',
          );
        }
      }

      for (const membership of freshMemberships) {
        if (!membership.exists) {
          continue;
        }
        const householdRef = membership.ref.parent.parent;
        if (!householdRef) {
          continue;
        }
        const displayName =
          typeof membership.data()?.displayName === 'string'
            ? membership.data()?.displayName
            : 'Household member';
        const activityRef = householdRef.collection('activities').doc();
        transaction.delete(membership.ref);
        transaction.create(activityRef, {
          type: 'member_left',
          actorId: uid,
          entityId: uid,
          metadata: { displayName, reason: 'account_deleted' },
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    // Re-check after the transaction so a membership created concurrently is not silently left behind.
    const remainingMemberships = await membershipQuery.limit(1).get();
    if (!remainingMemberships.empty) {
      throw new HttpsError(
        'aborted',
        'Household membership changed during account deletion. Please try again.',
      );
    }

    const usageSnapshot = await db.collection('aiUsage').where('uid', '==', uid).get();
    const writer = db.bulkWriter();
    for (const usage of usageSnapshot.docs) {
      writer.delete(usage.ref);
    }
    await writer.close();

    const userRef = db.doc(`users/${uid}`);
    await db.recursiveDelete(userRef);

    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code !== 'auth/user-not-found') {
        console.error('Unable to delete Firebase Auth user after data cleanup', uid, error);
        throw new HttpsError(
          'unavailable',
          'Account data was cleaned up but authentication deletion did not finish. Please try again.',
        );
      }
    }

    return { success: true };
  },
);
