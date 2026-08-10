import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

import type { Activity } from '../../types/domain';
import { getFirebaseServices } from './client';

export function subscribeToActivities(
  householdId: string,
  onActivities: (activities: Activity[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const activitiesQuery = query(
    collection(services.db, 'households', householdId, 'activities'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );

  return onSnapshot(
    activitiesQuery,
    (snapshot) => {
      onActivities(
        snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...(snapshotDoc.data() as Omit<Activity, 'id'>),
        })),
      );
    },
    onError,
  );
}
