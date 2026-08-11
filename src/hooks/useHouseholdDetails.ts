import { useEffect, useMemo, useState } from 'react';

import {
  subscribeToHousehold,
  subscribeToHouseholdMembers,
} from '../services/supabase/householdReadService';
import type { Household, HouseholdMember, HouseholdRole } from '../types/domain';

export function useHouseholdDetails(householdId: string | null, uid?: string) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [householdLoaded, setHouseholdLoaded] = useState(!householdId);
  const [membersLoaded, setMembersLoaded] = useState(!householdId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) {
      setHousehold(null);
      setMembers([]);
      setHouseholdLoaded(true);
      setMembersLoaded(true);
      return undefined;
    }

    setHouseholdLoaded(false);
    setMembersLoaded(false);

    const onReadError = () => setError('Unable to load household settings.');
    const stopHousehold = subscribeToHousehold(
      householdId,
      (value) => {
        setHousehold(value);
        setHouseholdLoaded(true);
        setError(null);
      },
      onReadError,
    );
    const stopMembers = subscribeToHouseholdMembers(
      householdId,
      (value) => {
        setMembers(value);
        setMembersLoaded(true);
        setError(null);
      },
      onReadError,
    );

    return () => {
      stopHousehold();
      stopMembers();
    };
  }, [householdId]);

  const currentRole = useMemo<HouseholdRole | null>(
    () => members.find((member) => member.userId === uid)?.role ?? null,
    [members, uid],
  );

  return {
    household,
    members,
    currentRole,
    loading: !householdLoaded || !membersLoaded,
    error,
  };
}
