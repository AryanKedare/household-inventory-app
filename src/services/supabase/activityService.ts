import type { Activity, ActivityType } from '../../types/domain';
import { timestampFromIso } from '../../types/timestamp';
import { requireSupabaseClient } from './client';

interface ActivityRow {
  id: string;
  actor_id: string | null;
  activity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    type: row.activity_type as ActivityType,
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
    actorId: row.actor_id ?? '',
    metadata: row.metadata ?? {},
    createdAt: timestampFromIso(row.created_at),
  };
}

export function subscribeToActivities(
  householdId: string,
  onActivities: (activities: Activity[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;

  const refresh = async () => {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('id,actor_id,activity_type,entity_id,metadata,created_at')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (active) onActivities(((data ?? []) as ActivityRow[]).map(mapActivity));
    } catch (error) {
      if (active) onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void refresh();
  const channel = supabase
    .channel(`activities:${householdId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activities', filter: `household_id=eq.${householdId}` },
      () => void refresh(),
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
