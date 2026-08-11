-- HomeStock hosted Supabase foundation.
--
-- This schema is additive during the Firebase -> Supabase migration. The mobile
-- application does not switch to these tables until the corresponding feature
-- migration PR is complete and tested.

create schema if not exists private;

create type public.household_role as enum ('owner', 'admin', 'member');
create type public.inventory_status as enum ('available', 'low', 'out');
create type public.shopping_status as enum ('active', 'purchased');
create type public.debt_status as enum ('open', 'partial', 'settled');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  default_household_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id),
  deletion_started_by uuid references auth.users(id),
  deletion_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (deletion_started_by is null and deletion_started_at is null)
    or (deletion_started_by is not null and deletion_started_at is not null)
  )
);

alter table public.profiles
  add constraint profiles_default_household_fk
  foreign key (default_household_id) references public.households(id) on delete set null;

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx
  on public.household_members(user_id, household_id);

-- Invite rows are intentionally not client-readable. Join/regenerate operations
-- will be implemented through authenticated Edge Functions.
create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  code_hint text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index household_invites_household_active_idx
  on public.household_invites(household_id, revoked_at);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text,
  barcode text,
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_threshold integer not null default 1 check (low_stock_threshold >= 0),
  status public.inventory_status not null default 'available',
  current_unit_price_cents integer check (current_unit_price_cents is null or current_unit_price_cents >= 0),
  previous_unit_price_cents integer check (previous_unit_price_cents is null or previous_unit_price_cents >= 0),
  last_purchased_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_items_household_name_idx
  on public.inventory_items(household_id, lower(name));
create index inventory_items_household_barcode_idx
  on public.inventory_items(household_id, barcode)
  where barcode is not null;

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  requested_quantity integer not null default 1 check (requested_quantity > 0),
  status public.shopping_status not null default 'active',
  added_by uuid not null references auth.users(id),
  purchased_by uuid references auth.users(id),
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, inventory_item_id)
);

create index shopping_items_household_status_idx
  on public.shopping_items(household_id, status, created_at desc);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  shopping_item_id uuid references public.shopping_items(id) on delete set null,
  purchased_by uuid not null references auth.users(id),
  store text not null check (char_length(trim(store)) between 1 and 160),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  purchased_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index purchases_household_date_idx
  on public.purchases(household_id, purchased_at desc);
create index purchases_item_date_idx
  on public.purchases(inventory_item_id, purchased_at desc);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete set null,
  store text,
  previous_unit_price_cents integer check (previous_unit_price_cents is null or previous_unit_price_cents >= 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  recorded_at timestamptz not null default now()
);

create index price_history_item_date_idx
  on public.price_history(inventory_item_id, recorded_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category text not null,
  merchant text,
  currency text not null default 'EUR' check (char_length(currency) = 3),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  paid_by uuid not null references auth.users(id),
  created_by uuid not null references auth.users(id),
  expense_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents + fee_cents),
  check (discount_cents <= subtotal_cents + fee_cents)
);

create index expenses_household_date_idx
  on public.expenses(household_id, expense_date desc, created_at desc);
create index expenses_household_category_idx
  on public.expenses(household_id, category, expense_date desc);

create table public.expense_lines (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 240),
  category text,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  final_cents integer not null check (final_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (final_cents = subtotal_cents - discount_cents + fee_cents)
);

create index expense_lines_expense_idx
  on public.expense_lines(expense_id, sort_order, created_at);

create table public.expense_line_participants (
  line_id uuid not null references public.expense_lines(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  weight numeric(12, 6) not null default 1 check (weight > 0),
  share_cents integer not null check (share_cents >= 0),
  created_at timestamptz not null default now(),
  primary key (line_id, user_id)
);

create index expense_line_participants_household_user_idx
  on public.expense_line_participants(household_id, user_id);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  debtor_id uuid not null references auth.users(id),
  creditor_id uuid not null references auth.users(id),
  original_cents integer not null check (original_cents > 0),
  settled_cents integer not null default 0 check (settled_cents >= 0),
  status public.debt_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (debtor_id <> creditor_id),
  check (settled_cents <= original_cents),
  unique (expense_id, debtor_id, creditor_id)
);

create index debts_household_debtor_idx
  on public.debts(household_id, debtor_id, status);
create index debts_household_creditor_idx
  on public.debts(household_id, creditor_id, status);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  from_user_id uuid not null references auth.users(id),
  to_user_id uuid not null references auth.users(id),
  amount_cents integer not null check (amount_cents > 0),
  recorded_by uuid not null references auth.users(id),
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index settlements_household_date_idx
  on public.settlements(household_id, settled_at desc);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  period_start date not null,
  category text,
  limit_cents integer not null check (limit_cents >= 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start = date_trunc('month', period_start::timestamp)::date)
);

create unique index budgets_household_month_overall_unique
  on public.budgets(household_id, period_start)
  where category is null;
create unique index budgets_household_month_category_unique
  on public.budgets(household_id, period_start, category)
  where category is not null;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activities_household_date_idx
  on public.activities(household_id, created_at desc);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null,
  expo_push_token text,
  notifications_enabled boolean not null default true,
  disabled_reason text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create unique index devices_expo_push_token_unique
  on public.devices(expo_push_token)
  where expo_push_token is not null;

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  period_start date,
  insight_type text not null,
  model text,
  payload jsonb not null,
  generated_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index ai_insights_household_date_idx
  on public.ai_insights(household_id, created_at desc);

-- Backend-only cost/abuse accounting. No authenticated client grants or RLS policy.
create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  operation text not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, operation)
);

-- Backend-only Expo receipt queue. Edge Functions/cron will own this table.
create table public.push_receipts (
  ticket_id text primary key,
  expo_push_token text not null,
  device_ids uuid[] not null default '{}',
  sent_at timestamptz not null,
  next_check_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auth/profile bootstrap
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER avoids recursive RLS evaluation on
-- household_members while only returning boolean/role information.
-- ---------------------------------------------------------------------------

create or replace function private.is_household_member(
  target_household_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = target_user_id
  );
$$;

create or replace function private.household_role(
  target_household_id uuid,
  target_user_id uuid default auth.uid()
)
returns public.household_role
language sql
stable
security definer
set search_path = ''
as $$
  select hm.role
  from public.household_members hm
  where hm.household_id = target_household_id
    and hm.user_id = target_user_id
  limit 1;
$$;

create or replace function private.shares_household_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members me
    join public.household_members them
      on them.household_id = me.household_id
    where me.user_id = auth.uid()
      and them.user_id = target_user_id
  );
$$;

revoke all on function private.is_household_member(uuid, uuid) from public;
revoke all on function private.household_role(uuid, uuid) from public;
revoke all on function private.shares_household_with(uuid) from public;
grant execute on function private.is_household_member(uuid, uuid) to authenticated;
grant execute on function private.household_role(uuid, uuid) to authenticated;
grant execute on function private.shares_household_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger households_set_updated_at
  before update on public.households
  for each row execute function private.set_updated_at();
create trigger household_members_set_updated_at
  before update on public.household_members
  for each row execute function private.set_updated_at();
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function private.set_updated_at();
create trigger shopping_items_set_updated_at
  before update on public.shopping_items
  for each row execute function private.set_updated_at();
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function private.set_updated_at();
create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function private.set_updated_at();
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function private.set_updated_at();
create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function private.set_updated_at();
create trigger ai_usage_set_updated_at
  before update on public.ai_usage
  for each row execute function private.set_updated_at();
create trigger push_receipts_set_updated_at
  before update on public.push_receipts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.inventory_items enable row level security;
alter table public.shopping_items enable row level security;
alter table public.purchases enable row level security;
alter table public.price_history enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_lines enable row level security;
alter table public.expense_line_participants enable row level security;
alter table public.debts enable row level security;
alter table public.settlements enable row level security;
alter table public.budgets enable row level security;
alter table public.activities enable row level security;
alter table public.devices enable row level security;
alter table public.ai_insights enable row level security;
alter table public.ai_usage enable row level security;
alter table public.push_receipts enable row level security;

create policy profiles_select_household_peers
  on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_household_with(id));
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy households_select_member
  on public.households for select to authenticated
  using (private.is_household_member(id));

create policy household_members_select_member
  on public.household_members for select to authenticated
  using (private.is_household_member(household_id));

create policy inventory_items_select_member
  on public.inventory_items for select to authenticated
  using (private.is_household_member(household_id));
create policy inventory_items_insert_member
  on public.inventory_items for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );
create policy inventory_items_update_member
  on public.inventory_items for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id) and updated_by = auth.uid());
create policy inventory_items_delete_member
  on public.inventory_items for delete to authenticated
  using (private.is_household_member(household_id));

create policy shopping_items_select_member
  on public.shopping_items for select to authenticated
  using (private.is_household_member(household_id));
create policy shopping_items_insert_member
  on public.shopping_items for insert to authenticated
  with check (private.is_household_member(household_id) and added_by = auth.uid());
create policy shopping_items_update_member
  on public.shopping_items for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy shopping_items_delete_member
  on public.shopping_items for delete to authenticated
  using (private.is_household_member(household_id));

create policy purchases_select_member
  on public.purchases for select to authenticated
  using (private.is_household_member(household_id));
create policy price_history_select_member
  on public.price_history for select to authenticated
  using (private.is_household_member(household_id));

create policy expenses_select_member
  on public.expenses for select to authenticated
  using (private.is_household_member(household_id));
create policy expense_lines_select_member
  on public.expense_lines for select to authenticated
  using (private.is_household_member(household_id));
create policy expense_line_participants_select_member
  on public.expense_line_participants for select to authenticated
  using (private.is_household_member(household_id));
create policy debts_select_member
  on public.debts for select to authenticated
  using (private.is_household_member(household_id));
create policy settlements_select_member
  on public.settlements for select to authenticated
  using (private.is_household_member(household_id));
create policy budgets_select_member
  on public.budgets for select to authenticated
  using (private.is_household_member(household_id));
create policy activities_select_member
  on public.activities for select to authenticated
  using (private.is_household_member(household_id));

create policy devices_select_self
  on public.devices for select to authenticated
  using (user_id = auth.uid());
create policy devices_insert_self
  on public.devices for insert to authenticated
  with check (user_id = auth.uid());
create policy devices_update_self
  on public.devices for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy devices_delete_self
  on public.devices for delete to authenticated
  using (user_id = auth.uid());

create policy ai_insights_select_member
  on public.ai_insights for select to authenticated
  using (private.is_household_member(household_id));

-- Deliberately no authenticated policies for household_invites, ai_usage, or
-- push_receipts. They are backend-only even though they live in public so
-- hosted Edge Functions can access them through the project API.

-- ---------------------------------------------------------------------------
-- API privileges. RLS remains the authorization boundary for granted actions.
-- Server-generated financial/audit data is read-only to mobile clients.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on public.household_invites, public.ai_usage, public.push_receipts from authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.households, public.household_members to authenticated;
grant select, insert, update, delete on public.inventory_items, public.shopping_items to authenticated;
grant select on public.purchases, public.price_history to authenticated;
grant select on public.expenses, public.expense_lines, public.expense_line_participants to authenticated;
grant select on public.debts, public.settlements, public.budgets, public.activities to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select on public.ai_insights to authenticated;

-- Realtime is used for household-scoped shared state. RLS is evaluated for
-- subscribers, so clients only receive rows they are allowed to select.
alter publication supabase_realtime add table
  public.profiles,
  public.households,
  public.household_members,
  public.inventory_items,
  public.shopping_items,
  public.expenses,
  public.debts,
  public.settlements,
  public.budgets,
  public.activities,
  public.ai_insights;
