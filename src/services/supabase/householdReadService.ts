import type { Household, HouseholdMember, HouseholdRole } from '../../types/domain';
import { timestampFromIso } from '../../types/timestamp';
import { requireSupabaseClient } from './client';

interface HouseholdRow {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string | null;
}

function mapHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.owner_id,
    inviteCode: row.invite_code ?? '',
    currency: row.currency,
    createdAt: timestampFromIso(row.created_at),
    updatedAt: timestampFromIso(row.updated_at),
  };
}

async function loadHousehold(householdId: string): Promise<Household | null> {
  const { data, error } = await requireSupabaseClient()
    .from('households')
    .select('id,name,owner_id,invite_code,currency,created_at,updated_at')
    .eq('id', householdId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapHousehold(data as HouseholdRow) : null;
}

async function loadMembers(householdId: string): Promise<HouseholdMember[]> {
  const supabase = requireSupabaseClient();
  const { data: membershipData, error: membershipError } = await supabase
    .from('household_members')
    .select('user_id,role,joined_at')
    .eq('household_id', householdId);

  if (membershipError) {
    throw membershipError;
  }

  const memberships = (membershipData ?? []) as MemberRow[];
  if (memberships.length === 0) {
    return [];
  }

  const userIds = memberships.map((member) => member.user_id);
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id,display_name,email')
    .in('id', userIds);

  if (profileError) {
    throw profileError;
  }

  const profiles = new Map(
    ((profileData ?? []) as ProfileRow[]).map((profile) => [profile.id, profile] as const),
  );
  const rank = { owner: 0, admin: 1, member: 2 } as const;

  return memberships
    .map((membership) => {
      const profile = profiles.get(membership.user_id);
      return {
        userId: membership.user_id,
        displayName: profile?.display_name?.trim() || 'Household member',
        email: profile?.email ?? '',
        role: membership.role,
        joinedAt: timestampFromIso(membership.joined_at),
      } satisfies HouseholdMember;
    })
    .sort(
      (left, right) =>
        rank[left.role] - rank[right.role] || left.displayName.localeCompare(right.displayName),
    );
}

export function subscribeToHousehold(
  householdId: string,
  onHousehold: (household: Household | null) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;

  const refresh = () => {
    void loadHousehold(householdId)
      .then((household) => {
        if (active) onHousehold(household);
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const channel = supabase
    .channel(`household:${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
      refresh,
    )
    .subscribe((status) => {
      if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        onError(new Error(`Supabase household realtime channel ${status.toLowerCase()}.`));
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export function subscribeToHouseholdMembers(
  householdId: string,
  onMembers: (members: HouseholdMember[]) => void,
  onError: (error: Error) => void,
): () => void {
  const supabase = requireSupabaseClient();
  let active = true;

  const refresh = () => {
    void loadMembers(householdId)
      .then((members) => {
        if (active) onMembers(members);
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error : new Error(String(error)));
      });
  };

  refresh();
  const membershipChannel = supabase
    .channel(`household-members:${householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'household_members',
        filter: `household_id=eq.${householdId}`,
      },
      refresh,
    )
    .subscribe((status) => {
      if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        onError(new Error(`Supabase member realtime channel ${status.toLowerCase()}.`));
      }
    });

  const profileChannel = supabase
    .channel(`household-member-profiles:${householdId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, refresh)
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(membershipChannel);
    void supabase.removeChannel(profileChannel);
  };
}
