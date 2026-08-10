import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { useAuth } from './AuthContext';
import { getFirebaseServices } from '../services/firebase/client';

interface HouseholdContextValue {
  householdId: string | null;
  loading: boolean;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: PropsWithChildren) {
  const { user, configured } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!configured || !user) {
      setHouseholdId(null);
      setLoading(false);
      return undefined;
    }

    const services = getFirebaseServices();
    if (!services) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return onSnapshot(
      doc(services.db, 'users', user.uid),
      (snapshot) => {
        const value = snapshot.data()?.defaultHouseholdId;
        setHouseholdId(typeof value === 'string' && value.length > 0 ? value : null);
        setLoading(false);
      },
      () => {
        setHouseholdId(null);
        setLoading(false);
      },
    );
  }, [configured, user]);

  const value = useMemo(() => ({ householdId, loading }), [householdId, loading]);
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold must be used inside HouseholdProvider.');
  }
  return context;
}
