import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from './AuthContext';
import { getSupabaseClient } from '../services/supabase/client';

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

    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);

    const refresh = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('default_household_id')
        .eq('id', user.uid)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setHouseholdId(null);
        setLoading(false);
        return;
      }
      const value = data?.default_household_id;
      setHouseholdId(typeof value === 'string' && value.length > 0 ? value : null);
      setLoading(false);
    };

    void refresh();
    const channel = supabase
      .channel(`profile-household:${user.uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.uid}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
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
