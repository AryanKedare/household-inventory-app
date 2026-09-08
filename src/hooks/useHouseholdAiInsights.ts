import { useEffect, useState } from 'react';

import {
  subscribeToHouseholdAiInsights,
  type HouseholdAiInsights,
} from '../services/supabase/aiService';

export function useHouseholdAiInsights(householdId: string | null, period: string) {
  const [insights, setInsights] = useState<HouseholdAiInsights | null>(null);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) {
      setInsights(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribeToHouseholdAiInsights(
      householdId,
      period,
      (value) => {
        setInsights(value);
        setError(null);
        setLoading(false);
      },
      () => {
        setError('Unable to load household AI insights.');
        setLoading(false);
      },
    );
  }, [householdId, period]);

  return { insights, loading, error };
}
