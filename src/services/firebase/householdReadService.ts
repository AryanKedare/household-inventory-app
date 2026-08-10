import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import type { Household, HouseholdMember } from '../../types/domain';
import { getFirebaseServices } from './client';

function requireDb() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services.db;
}

export function subscribeToHousehold(
  householdId: string,
  onHousehold: (household: Household | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(requireDb(), 'households', householdId),
    (snapshot) => {
      onHousehold(
        snapshot.exists()
          ? { id: snapshot.id, ...(snapshot.data() as Omit<Household, 'id'>) }
          : null,
      );
    },
    onError,
  );
}

export function subscribeToHouseholdMembers(
  householdId: string,
  onMembers: (members: HouseholdMember[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(requireDb(), 'households', householdId, 'members'),
    (snapshot) => {
      const members = snapshot.docs
        .map((member) => member.data() as HouseholdMember)
        .sort((left, right) => {
          const rank = { owner: 0, admin: 1, member: 2 } as const;
          return rank[left.role] - rank[right.role] || left.displayName.localeCompare(right.displayName);
        });
      onMembers(members);
    },
    onError,
  );
}
