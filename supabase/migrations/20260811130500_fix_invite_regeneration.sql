create or replace function public.regenerate_household_invite(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.household_role;
  new_invite_code text;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;

  actor_role := private.household_role(p_household_id, actor_id);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Only household admins can regenerate invite codes.';
  end if;

  if not exists (
    select 1 from public.households
    where id = p_household_id and deletion_started_at is null
  ) then
    raise exception 'Household no longer exists.';
  end if;

  new_invite_code := private.generate_invite_code();

  update public.household_invites
  set revoked_at = now()
  where household_id = p_household_id and revoked_at is null;

  insert into public.household_invites (
    household_id,
    code_hash,
    code_hint,
    created_by
  ) values (
    p_household_id,
    private.hash_invite_code(new_invite_code),
    right(new_invite_code, 2),
    actor_id
  );

  update public.households
  set invite_code = new_invite_code
  where id = p_household_id;

  return jsonb_build_object('inviteCode', new_invite_code);
end;
$$;
