import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();
const REGION = 'europe-west1';

interface HouseholdLifecycleRequest {
  householdId?: unknown;
}

interface TransferHouseholdOwnershipRequest extends HouseholdLifecycleRequest {
  userId?: unknown;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return auth.uid;
}

function cleanId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  const id = value.trim();
  if (id.length === 0 || id.length > 128 || id.includes('/')) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return id;
}

function memberDisplayName(member: DocumentData): string {
  if (typeof member.displayName === 'string' && member.displayName.trim().length > 0) {
    return member.displayName.trim();
  }
  if (typeof member.email === 'string' && member.email.trim().length > 0) {
    return member.email.trim();
  }
  return 'Household member';
}

export const transferHouseholdOwnership = onCall<TransferHouseholdOwnershipRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');
    const targetUid = cleanId(request.data.userId, 'Member');

    if (uid === targetUid) {
      throw new HttpsError('invalid-argument', 'Choose another household member as the new owner.');
    }

    const actorRef = db.doc(`households/${householdId}/members/${uid}`);
    const targetRef = db.doc(`households/${householdId}/members/${targetUid}`);
    const activityRef = db.collection(`households/${householdId}/activities`).doc();

    await db.runTransaction(async (transaction) => {
      const actorSnapshot = await transaction.get(actorRef);
      const targetSnapshot = await transaction.get(targetRef);

      if (!actorSnapshot.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this household.');
      }
      if (!targetSnapshot.exists) {
        throw new HttpsError('not-found', 'The selected household member no longer exists.');
      }

      const actor = actorSnapshot.data();
      const target = targetSnapshot.data();
      if (!actor || !target) {
        throw new HttpsError('data-loss', 'Household member data is unavailable.');
      }
      if (actor.role !== 'owner') {
        throw new HttpsError('permission-denied', 'Only the current household owner can transfer ownership.');
      }
      if (target.role === 'owner') {
        throw new HttpsError('failed-precondition', 'The selected member is already the household owner.');
      }
      if (target.role !== 'admin' && target.role !== 'member') {
        throw new HttpsError('failed-precondition', 'The selected member has an invalid household role.');
      }

      const changedAt = FieldValue.serverTimestamp();
      transaction.update(actorRef, {
        role: 'admin',
        updatedAt: changedAt,
      });
      transaction.update(targetRef, {
        role: 'owner',
        updatedAt: changedAt,
      });
      transaction.create(activityRef, {
        type: 'ownership_transferred',
        actorId: uid,
        entityId: targetUid,
        metadata: {
          previousOwnerId: uid,
          previousOwnerName: memberDisplayName(actor),
          newOwnerId: targetUid,
          newOwnerName: memberDisplayName(target),
        },
        createdAt: changedAt,
      });
    });

    return { success: true, ownerId: targetUid };
  },
);

export const leaveHousehold = onCall<HouseholdLifecycleRequest>(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = requireUid(request.auth);
    const householdId = cleanId(request.data.householdId, 'Household');

    const memberRef = db.doc(`households/${householdId}/members/${uid}`);
    const userRef = db.doc(`users/${uid}`);
    const activityRef = db.collection(`households/${householdId}/activities`).doc();

    await db.runTransaction(async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      const userSnapshot = await transaction.get(userRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError('not-found', 'You are no longer a member of this household.');
      }

      const member = memberSnapshot.data();
      if (!member) {
        throw new HttpsError('data-loss', 'Household member data is unavailable.');
      }
      if (member.role === 'owner') {
        throw new HttpsError(
          'failed-precondition',
          'Transfer household ownership to another member before leaving.',
        );
      }

      const changedAt = FieldValue.serverTimestamp();
      transaction.delete(memberRef);

      if (userSnapshot.exists && userSnapshot.data()?.defaultHouseholdId === householdId) {
        transaction.update(userRef, {
          defaultHouseholdId: FieldValue.delete(),
          updatedAt: changedAt,
        });
      }

      transaction.create(activityRef, {
        type: 'member_left',
        actorId: uid,
        entityId: uid,
        metadata: {
          displayName: memberDisplayName(member),
        },
        createdAt: changedAt,
      });
    });

    return { success: true };
  },
);

export { deleteHousehold } from './householdDeletion';
