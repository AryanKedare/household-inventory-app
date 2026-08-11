-- Trusted household lifecycle operations for the hosted Supabase backend.

create extension if not exists pgcrypto with schema extensions;

alter type public.inventory_status rename value 'low' to 'low_stock';
alter type public.inventory_status rename value 'out' to 'out_of_stock';
alter type public.shopping_status add value if not exists 'purchasing';
alter type public.shopping_status add value if not exists 'removed';

alter table public.households
  add column currency text not null default 'EUR' check (char_length(currency) = 3),
  add column invite_code text;

create or replace function private.sync_inventory_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity = 0 then
    new.status = 'out_of_stock'::public.inventory_status;
  elsif new.quantity <= new.low_stock_threshold then
    new.status = 'low_stock'::public.inventory_status;
  else
    new.status = 'available'::public.inventory_status;
  end if;
  return new;
end;
$$;

create or replace function private.hash_invite_code(invite_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(upper(trim(invite_code)), 'sha256'), 'hex');
$$;

create or replace function private.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  candidate text;
  i integer;
begin
  for attempt in 1..20 loop
    bytes := extensions.gen_random_bytes(6);
    candidate := '';
    for i in 0..5 loop
      candidate := candidate || substr(
        alphabet,
        (get_byte(bytes, i) % char_length(alphabet)) + 1,
        1
      );
    end loop;

    if not exists (
      select 1
      from public.household_invites
      where code_hash = private.hash_invite_code(candidate)
        and revoked_at is null
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a unique invite code.';
end;
$$;

create or replace function public.create_household(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_name text := trim(coalesce(p_name, ''));
  new_household_id uuid;
  invite_code text;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'Household name must be 2 to 80 characters.';
  end if;

  invite_code := private.generate_invite_code();

  insert into public.households (name, owner_id, invite_code, currency)
  values (clean_name, actor_id, invite_code, 'EUR')
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, actor_id, 'owner');

  insert into public.household_invites (
    household_id,
    code_hash,
    code_hint,
    created_by
  ) values (
    new_household_id,
    private.hash_invite_code(invite_code),
    right(invite_code, 2),
    actor_id
  );

  update public.profiles
  set default_household_id = new_household_id
  where id = actor_id;

  insert into public.activities (
    household_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    new_household_id,
    actor_id,
    'household_created',
    'household',
    new_household_id,
    jsonb_build_object('name', clean_name)
  );

  return jsonb_build_object(
    'householdId', new_household_id,
    'inviteCode', invite_code
  );
end;
$$;

create or replace function public.join_household(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_code text := upper(trim(coalesce(p_invite_code, '')));
  target_household_id uuid;
  was_member boolean;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if clean_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'Invite code must be 6 characters.';
  end if;

  select hi.household_id
  into target_household_id
  from public.household_invites hi
  join public.households h on h.id = hi.household_id
  where hi.code_hash = private.hash_invite_code(clean_code)
    and hi.revoked_at is null
    and (hi.expires_at is null or hi.expires_at > now())
    and h.deletion_started_at is null
  order by hi.created_at desc
  limit 1
  for update of hi;

  if target_household_id is null then
    raise exception 'Invite code is invalid or no longer active.';
  end if;

  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = actor_id
  ) into was_member;

  if not was_member then
    insert into public.household_members (household_id, user_id, role)
    values (target_household_id, actor_id, 'member');

    insert into public.activities (
      household_id,
      actor_id,
      activity_type,
      entity_type,
      entity_id,
      metadata
    ) values (
      target_household_id,
      actor_id,
      'member_joined',
      'member',
      actor_id,
      '{}'::jsonb
    );
  end if;

  update public.profiles
  set default_household_id = target_household_id
  where id = actor_id;

  return jsonb_build_object(
    'householdId', target_household_id,
    'alreadyMember', was_member
  );
end;
$$;

create or replace function public.regenerate_household_invite(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.household_role;
  invite_code text;
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

  invite_code := private.generate_invite_code();

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
    private.hash_invite_code(invite_code),
    right(invite_code, 2),
    actor_id
  );

  update public.households
  set invite_code = invite_code
  where id = p_household_id;

  return jsonb_build_object('inviteCode', invite_code);
end;
$$;

create or replace function public.change_household_member_role(
  p_household_id uuid,
  p_user_id uuid,
  p_role public.household_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_role public.household_role;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if private.household_role(p_household_id, actor_id) <> 'owner' then
    raise exception 'Only the household owner can change roles.';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member.';
  end if;

  select role into target_role
  from public.household_members
  where household_id = p_household_id and user_id = p_user_id
  for update;

  if target_role is null then
    raise exception 'Household member no longer exists.';
  end if;
  if target_role = 'owner' then
    raise exception 'The household owner role cannot be changed here.';
  end if;

  update public.household_members
  set role = p_role
  where household_id = p_household_id and user_id = p_user_id;

  return jsonb_build_object('success', true, 'role', p_role);
end;
$$;

create or replace function public.remove_household_member(
  p_household_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.household_role;
  target_role public.household_role;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if p_user_id = actor_id then
    raise exception 'Use leave household to remove yourself.';
  end if;

  actor_role := private.household_role(p_household_id, actor_id);
  select role into target_role
  from public.household_members
  where household_id = p_household_id and user_id = p_user_id
  for update;

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Only household admins can remove members.';
  end if;
  if target_role is null then
    raise exception 'Household member no longer exists.';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before removing the owner.';
  end if;
  if actor_role = 'admin' and target_role <> 'member' then
    raise exception 'Admins can only remove regular members.';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id;

  update public.profiles
  set default_household_id = null
  where id = p_user_id and default_household_id = p_household_id;

  insert into public.activities (
    household_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_household_id,
    actor_id,
    'member_removed',
    'member',
    p_user_id,
    jsonb_build_object('memberId', p_user_id)
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.transfer_household_ownership(
  p_household_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_role public.household_role;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if private.household_role(p_household_id, actor_id) <> 'owner' then
    raise exception 'Only the household owner can transfer ownership.';
  end if;
  if p_target_user_id = actor_id then
    raise exception 'You already own this household.';
  end if;

  select role into target_role
  from public.household_members
  where household_id = p_household_id and user_id = p_target_user_id
  for update;

  if target_role is null then
    raise exception 'Target user must be a household member.';
  end if;

  update public.households
  set owner_id = p_target_user_id
  where id = p_household_id and owner_id = actor_id;

  update public.household_members
  set role = case
    when user_id = actor_id then 'admin'::public.household_role
    when user_id = p_target_user_id then 'owner'::public.household_role
    else role
  end
  where household_id = p_household_id
    and user_id in (actor_id, p_target_user_id);

  insert into public.activities (
    household_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_household_id,
    actor_id,
    'ownership_transferred',
    'member',
    p_target_user_id,
    jsonb_build_object(
      'previousOwnerId', actor_id,
      'newOwnerId', p_target_user_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'previousOwnerId', actor_id,
    'newOwnerId', p_target_user_id
  );
end;
$$;

create or replace function public.leave_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.household_role;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;

  select role into actor_role
  from public.household_members
  where household_id = p_household_id and user_id = actor_id
  for update;

  if actor_role is null then
    raise exception 'You are not a member of this household.';
  end if;
  if actor_role = 'owner' then
    raise exception 'Transfer ownership or delete the household before leaving.';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = actor_id;

  update public.profiles
  set default_household_id = null
  where id = actor_id and default_household_id = p_household_id;

  insert into public.activities (
    household_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_household_id,
    actor_id,
    'member_left',
    'member',
    actor_id,
    '{}'::jsonb
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.delete_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  member_count integer;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.households
    where id = p_household_id and owner_id = actor_id
    for update
  ) then
    raise exception 'Only the household owner can delete this household.';
  end if;

  select count(*)::integer into member_count
  from public.household_members
  where household_id = p_household_id;

  if member_count <> 1 then
    raise exception 'Remove other members or transfer ownership before deleting the household.';
  end if;

  delete from public.households where id = p_household_id;

  return jsonb_build_object('success', true, 'alreadyDeleted', false);
end;
$$;

revoke all on function public.create_household(text) from public;
revoke all on function public.join_household(text) from public;
revoke all on function public.regenerate_household_invite(uuid) from public;
revoke all on function public.change_household_member_role(uuid, uuid, public.household_role) from public;
revoke all on function public.remove_household_member(uuid, uuid) from public;
revoke all on function public.transfer_household_ownership(uuid, uuid) from public;
revoke all on function public.leave_household(uuid) from public;
revoke all on function public.delete_household(uuid) from public;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.regenerate_household_invite(uuid) to authenticated;
grant execute on function public.change_household_member_role(uuid, uuid, public.household_role) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;
