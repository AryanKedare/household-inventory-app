import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();
const REGION = 'europe-west1';

interface DeleteHouseholdRequest {
  householdId?: unknown;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return auth.uid;
}

function cleanId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Household is required.');
  }
  const id = value.trim();
  if (!id || id.length > 128 || id.includes('/')) {
    throw new HttpsError('invalid-argument', 'Household is invalid.');
  }
  return id;
}

export const deleteHousehold = onCall<DeleteHouseholdRequest>(
  { region: REGION, enforceAppCheck: false, timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId);
    const householdRef = db.doc(`households/${householdId}`);
    const ownerRef = db.doc(`households/${householdId}/members/${uid}`);
    const userRef = db.doc(`users/${uid}`);
    const membersQuery = db.collection(`households/${householdId}/members`).limit(2);

    const lockResult = await db.runTransaction(async (transaction) => {
      const householdSnapshot = await transaction.get(householdRef);
      if (!householdSnapshot.exists) {
        return { alreadyDeleted: true };
      }

      const household = householdSnapshot.data() ?? {};
      const inviteCode =
        typeof household.inviteCode === 'string' && household.inviteCode.length > 0
          ? household.inviteCode
          : null;
      const inviteRef = inviteCode ? db.doc(`inviteCodes/${inviteCode}`) : null;

      // A recursive delete can remove child documents before the household root.
      // Once deletion is locked, only the user who acquired that lock may resume it;
      // requiring the owner membership again would make a legitimate retry impossible
      // if that membership was one of the children already removed.
      if (household.deleting === true) {
        if (household.deletionStartedBy !== uid) {
          throw new HttpsError(
            'permission-denied',
            'Household deletion is already in progress by another user.',
          );
        }

        const inviteSnapshot = inviteRef ? await transaction.get(inviteRef) : null;
        const userSnapshot = await transaction.get(userRef);

        if (inviteRef && inviteSnapshot?.exists) {
          transaction.delete(inviteRef);
        }
        if (userSnapshot.exists && userSnapshot.data()?.defaultHouseholdId === householdId) {
          transaction.update(userRef, {
            defaultHouseholdId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        transaction.set(
          householdRef,
          {
            deletionRetryAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        return { alreadyDeleted: false };
      }

      const ownerSnapshot = await transaction.get(ownerRef);
      if (!ownerSnapshot.exists || ownerSnapshot.data()?.role !== 'owner') {
        throw new HttpsError('permission-denied', 'Only the household owner can delete the household.');
      }

      const membersSnapshot = await transaction.get(membersQuery);
      if (membersSnapshot.size !== 1 || membersSnapshot.docs[0]?.id !== uid) {
        throw new HttpsError(
          'failed-precondition',
          'Remove or transfer all other household members before deleting the household.',
        );
      }

      const inviteSnapshot = inviteRef ? await transaction.get(inviteRef) : null;
      const userSnapshot = await transaction.get(userRef);

      if (inviteRef && inviteSnapshot?.exists) {
        transaction.delete(inviteRef);
      }
      if (userSnapshot.exists && userSnapshot.data()?.defaultHouseholdId === householdId) {
        transaction.update(userRef, {
          defaultHouseholdId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(
        householdRef,
        {
          deleting: true,
          deletionStartedBy: uid,
          deletionStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return { alreadyDeleted: false };
    });

    if (lockResult.alreadyDeleted) {
      return { success: true, alreadyDeleted: true };
    }

    try {
      await db.recursiveDelete(householdRef);
    } catch (error) {
      console.error('Recursive household deletion failed', householdId, error);
      throw new HttpsError(
        'unavailable',
        'Household deletion could not finish. You can safely retry the deletion.',
      );
    }

    return { success: true, alreadyDeleted: false };
  },
);
