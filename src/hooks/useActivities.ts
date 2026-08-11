import { useEffect, useState } from 'react';

import { subscribeToActivities } from '../services/supabase/activityService';
import type { Activity } from '../types/domain';

export function useActivities(householdId: string | null) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) {
      setActivities([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribeToActivities(
      householdId,
      (nextActivities) => {
        setActivities(nextActivities);
        setError(null);
        setLoading(false);
      },
      () => {
        setError('Unable to load recent activity.');
        setLoading(false);
      },
    );
  }, [householdId]);

  return { activities, loading, error };
}
