-- Inventory, shopping and purchase migration for the hosted Supabase backend.

alter table public.inventory_items
  alter column quantity type numeric(12,3) using quantity::numeric,
  alter column low_stock_threshold type numeric(12,3) using low_stock_threshold::numeric,
  alter column low_stock_threshold drop not null,
  alter column low_stock_threshold drop default;

alter table public.inventory_items
  add column normalized_name text,
  add column category_id text,
  add column category_name text,
  add column unit text not null default 'piece',
  add column currency text not null default 'EUR' check (char_length(currency) = 3),
  add column price_change_cents integer,
  add column price_change_percentage numeric(12,2),
  add column last_store_name text,
  add column last_purchase_quantity numeric(12,3);

update public.inventory_items
set normalized_name = lower(name),
    category_id = coalesce(category_id, nullif(category, '')),
    category_name = coalesce(category_name, nullif(category, ''));

alter table public.inventory_items
  alter column normalized_name set not null,
  add constraint inventory_items_quantity_range check (quantity <= 100000),
  add constraint inventory_items_threshold_range check (
    low_stock_threshold is null or (low_stock_threshold >= 0 and low_stock_threshold <= 100000)
  ),
  add constraint inventory_items_price_range check (
    current_unit_price_cents is null or current_unit_price_cents <= 100000000
  ),
  add constraint inventory_items_unit_check check (
    unit in ('piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'other')
  );

create index if not exists inventory_items_household_normalized_name_idx
  on public.inventory_items(household_id, normalized_name);

alter table public.shopping_items
  alter column requested_quantity type numeric(12,3) using requested_quantity::numeric;

alter table public.shopping_items
  add column name text,
  add column category_id text,
  add column category_name text,
  add column unit text,
  add column estimated_price_cents integer,
  add column priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  add constraint shopping_items_quantity_range check (requested_quantity <= 100000),
  add constraint shopping_items_estimated_price_range check (
    estimated_price_cents is null or (estimated_price_cents >= 0 and estimated_price_cents <= 100000000)
  );

alter table public.purchases
  drop constraint purchases_inventory_item_id_fkey,
  alter column inventory_item_id drop not null,
  alter column quantity type numeric(12,3) using quantity::numeric,
  add column item_name text,
  add column unit text,
  add column currency text not null default 'EUR' check (char_length(currency) = 3),
  add constraint purchases_inventory_item_id_fkey
    foreign key (inventory_item_id) references public.inventory_items(id) on delete set null,
  add constraint purchases_quantity_range check (quantity <= 100000),
  add constraint purchases_unit_price_range check (unit_price_cents <= 100000000),
  add constraint purchases_total_range check (total_cents <= 1000000000);

alter table public.price_history
  drop constraint price_history_inventory_item_id_fkey,
  alter column inventory_item_id drop not null,
  add column item_name text,
  add column difference_cents integer,
  add column percentage_change numeric(12,2),
  add column currency text not null default 'EUR' check (char_length(currency) = 3),
  add column changed_by uuid references auth.users(id),
  add constraint price_history_inventory_item_id_fkey
    foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;

-- All inventory/shopping writes now use trusted RPCs. Mobile clients retain
-- household-scoped reads through RLS, but cannot forge audit fields directly.
drop policy if exists inventory_items_insert_member on public.inventory_items;
drop policy if exists inventory_items_update_member on public.inventory_items;
drop policy if exists inventory_items_delete_member on public.inventory_items;
revoke insert, update, delete on public.inventory_items from authenticated;

create or replace function private.require_household_member(p_household_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if not private.is_household_member(p_household_id, actor_id) then
    raise exception 'You are not a member of this household.';
  end if;
  return actor_id;
end;
$$;

create or replace function private.clean_category_id(p_category_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(trim(coalesce(p_category_name, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function private.validate_inventory_values(
  p_name text,
  p_category_name text,
  p_quantity numeric,
  p_unit text,
  p_low_stock_threshold numeric,
  p_current_price_cents integer,
  p_currency text,
  p_barcode text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(trim(p_name)) > 160 then
    raise exception 'Item name must be 1 to 160 characters.';
  end if;
  if char_length(trim(coalesce(p_category_name, ''))) < 1 or char_length(trim(p_category_name)) > 100 then
    raise exception 'Category must be 1 to 100 characters.';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000 then
    raise exception 'Quantity must be between 0 and 100000.';
  end if;
  if p_unit not in ('piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'other') then
    raise exception 'Unit is invalid.';
  end if;
  if p_low_stock_threshold is not null and (p_low_stock_threshold < 0 or p_low_stock_threshold > 100000) then
    raise exception 'Low stock threshold is invalid.';
  end if;
  if p_current_price_cents is null or p_current_price_cents < 0 or p_current_price_cents > 100000000 then
    raise exception 'Current price is invalid.';
  end if;
  if upper(trim(coalesce(p_currency, ''))) !~ '^[A-Z]{3}$' then
    raise exception 'Currency is invalid.';
  end if;
  if p_barcode is not null and char_length(trim(p_barcode)) > 128 then
    raise exception 'Barcode is invalid.';
  end if;
end;
$$;

create or replace function public.create_inventory_item(
  p_household_id uuid,
  p_name text,
  p_category_name text,
  p_quantity numeric,
  p_unit text,
  p_low_stock_threshold numeric,
  p_current_price_cents integer,
  p_currency text default 'EUR',
  p_barcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  new_id uuid;
  clean_name text := trim(p_name);
  clean_category text := trim(p_category_name);
begin
  perform private.validate_inventory_values(
    p_name, p_category_name, p_quantity, p_unit, p_low_stock_threshold,
    p_current_price_cents, p_currency, p_barcode
  );

  insert into public.inventory_items (
    household_id, name, normalized_name, category, category_id, category_name,
    barcode, quantity, low_stock_threshold, unit, current_unit_price_cents,
    currency, created_by, updated_by
  ) values (
    p_household_id,
    clean_name,
    lower(clean_name),
    clean_category,
    private.clean_category_id(clean_category),
    clean_category,
    nullif(trim(coalesce(p_barcode, '')), ''),
    p_quantity,
    p_low_stock_threshold,
    p_unit,
    p_current_price_cents,
    upper(trim(p_currency)),
    actor_id,
    actor_id
  ) returning id into new_id;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'item_created', 'inventory_item', new_id,
    jsonb_build_object('itemName', clean_name)
  );

  return jsonb_build_object('itemId', new_id);
end;
$$;

create or replace function public.update_inventory_item(
  p_household_id uuid,
  p_item_id uuid,
  p_name text,
  p_category_name text,
  p_quantity numeric,
  p_unit text,
  p_low_stock_threshold numeric,
  p_current_price_cents integer,
  p_currency text default 'EUR',
  p_barcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  clean_name text := trim(p_name);
  clean_category text := trim(p_category_name);
begin
  perform private.validate_inventory_values(
    p_name, p_category_name, p_quantity, p_unit, p_low_stock_threshold,
    p_current_price_cents, p_currency, p_barcode
  );

  perform 1 from public.inventory_items
  where id = p_item_id and household_id = p_household_id
  for update;
  if not found then
    raise exception 'Inventory item no longer exists.';
  end if;

  update public.inventory_items
  set name = clean_name,
      normalized_name = lower(clean_name),
      category = clean_category,
      category_id = private.clean_category_id(clean_category),
      category_name = clean_category,
      barcode = nullif(trim(coalesce(p_barcode, '')), ''),
      quantity = p_quantity,
      low_stock_threshold = p_low_stock_threshold,
      unit = p_unit,
      current_unit_price_cents = p_current_price_cents,
      currency = upper(trim(p_currency)),
      updated_by = actor_id
  where id = p_item_id;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'item_updated', 'inventory_item', p_item_id,
    jsonb_build_object('itemName', clean_name)
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.adjust_inventory_quantity(
  p_household_id uuid,
  p_item_id uuid,
  p_delta numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  current_quantity numeric;
  next_quantity numeric;
  next_status public.inventory_status;
begin
  if p_delta is null or p_delta = 0 or abs(p_delta) > 100000 then
    raise exception 'Quantity change is invalid.';
  end if;

  select quantity into current_quantity
  from public.inventory_items
  where id = p_item_id and household_id = p_household_id
  for update;
  if current_quantity is null then
    raise exception 'Inventory item no longer exists.';
  end if;

  next_quantity := greatest(0::numeric, current_quantity + p_delta);
  if next_quantity > 100000 then
    raise exception 'Quantity would exceed the supported maximum.';
  end if;

  update public.inventory_items
  set quantity = next_quantity, updated_by = actor_id
  where id = p_item_id
  returning status into next_status;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'quantity_changed', 'inventory_item', p_item_id,
    jsonb_build_object('delta', p_delta, 'quantity', next_quantity)
  );

  return jsonb_build_object(
    'itemId', p_item_id,
    'quantity', next_quantity,
    'status', next_status
  );
end;
$$;

create or replace function public.delete_inventory_item(
  p_household_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  item_name text;
begin
  select name into item_name
  from public.inventory_items
  where id = p_item_id and household_id = p_household_id
  for update;
  if item_name is null then
    raise exception 'Inventory item no longer exists.';
  end if;

  delete from public.inventory_items where id = p_item_id;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'item_removed', 'inventory_item', p_item_id,
    jsonb_build_object('itemName', item_name)
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.add_inventory_to_shopping(
  p_household_id uuid,
  p_item_id uuid,
  p_quantity_needed numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  inventory_row public.inventory_items%rowtype;
  existing_row public.shopping_items%rowtype;
  list_id uuid;
  requested numeric := greatest(1::numeric, coalesce(p_quantity_needed, 1));
  should_log boolean := false;
begin
  if requested > 100000 then
    raise exception 'Requested quantity is invalid.';
  end if;

  select * into inventory_row
  from public.inventory_items
  where id = p_item_id and household_id = p_household_id;
  if not found then
    raise exception 'Inventory item no longer exists.';
  end if;

  select * into existing_row
  from public.shopping_items
  where household_id = p_household_id and inventory_item_id = p_item_id
  for update;

  if found then
    list_id := existing_row.id;
    should_log := existing_row.status <> 'active';
    update public.shopping_items
    set requested_quantity = case
          when existing_row.status = 'active' then greatest(existing_row.requested_quantity, requested)
          else requested
        end,
        status = 'active',
        name = inventory_row.name,
        category_id = inventory_row.category_id,
        category_name = inventory_row.category_name,
        unit = inventory_row.unit,
        estimated_price_cents = inventory_row.current_unit_price_cents,
        added_by = case when existing_row.status = 'active' then existing_row.added_by else actor_id end,
        purchased_by = null,
        purchased_at = null
    where id = existing_row.id;
  else
    should_log := true;
    insert into public.shopping_items (
      household_id, inventory_item_id, requested_quantity, status, added_by,
      name, category_id, category_name, unit, estimated_price_cents, priority
    ) values (
      p_household_id, p_item_id, requested, 'active', actor_id,
      inventory_row.name, inventory_row.category_id, inventory_row.category_name,
      inventory_row.unit, inventory_row.current_unit_price_cents, 'normal'
    ) returning id into list_id;
  end if;

  if should_log then
    insert into public.activities (
      household_id, actor_id, activity_type, entity_type, entity_id, metadata
    ) values (
      p_household_id, actor_id, 'shopping_item_added', 'shopping_item', list_id,
      jsonb_build_object('itemId', p_item_id, 'itemName', inventory_row.name)
    );
  end if;

  return jsonb_build_object('shoppingItemId', list_id);
end;
$$;

create or replace function public.update_shopping_quantity(
  p_household_id uuid,
  p_shopping_item_id uuid,
  p_quantity_needed numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_household_member(p_household_id);
  if p_quantity_needed is null or p_quantity_needed <= 0 or p_quantity_needed > 100000 then
    raise exception 'Requested quantity is invalid.';
  end if;

  update public.shopping_items
  set requested_quantity = p_quantity_needed
  where id = p_shopping_item_id
    and household_id = p_household_id
    and status = 'active';
  if not found then
    raise exception 'Active shopping item no longer exists.';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.remove_shopping_item(
  p_household_id uuid,
  p_shopping_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  item_id uuid;
  item_name text;
begin
  select inventory_item_id, name into item_id, item_name
  from public.shopping_items
  where id = p_shopping_item_id and household_id = p_household_id and status = 'active'
  for update;
  if not found then
    raise exception 'Active shopping item no longer exists.';
  end if;

  update public.shopping_items
  set status = 'removed', purchased_by = null, purchased_at = null
  where id = p_shopping_item_id;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'shopping_item_removed', 'shopping_item', p_shopping_item_id,
    jsonb_build_object('itemId', item_id, 'itemName', item_name)
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.mark_inventory_finished(
  p_household_id uuid,
  p_item_id uuid,
  p_quantity_needed numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  item_name text;
  shopping_result jsonb;
begin
  select name into item_name
  from public.inventory_items
  where id = p_item_id and household_id = p_household_id
  for update;
  if item_name is null then
    raise exception 'Inventory item no longer exists.';
  end if;

  update public.inventory_items
  set quantity = 0, updated_by = actor_id
  where id = p_item_id;

  shopping_result := public.add_inventory_to_shopping(
    p_household_id, p_item_id, p_quantity_needed
  );

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'item_finished', 'inventory_item', p_item_id,
    jsonb_build_object('itemName', item_name)
  );

  return shopping_result;
end;
$$;

create or replace function public.purchase_shopping_item(
  p_household_id uuid,
  p_shopping_item_id uuid,
  p_quantity_purchased numeric,
  p_unit_price_cents integer,
  p_store_name text,
  p_purchased_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  shopping_row public.shopping_items%rowtype;
  inventory_row public.inventory_items%rowtype;
  purchase_id uuid;
  history_id uuid;
  previous_price integer;
  delta integer;
  pct numeric(12,2);
  total_cents integer;
  next_quantity numeric;
begin
  if p_quantity_purchased is null or p_quantity_purchased <= 0 or p_quantity_purchased > 100000 then
    raise exception 'Purchased quantity is invalid.';
  end if;
  if p_unit_price_cents is null or p_unit_price_cents < 0 or p_unit_price_cents > 100000000 then
    raise exception 'Unit price is invalid.';
  end if;
  if char_length(trim(coalesce(p_store_name, ''))) < 1 or char_length(trim(p_store_name)) > 160 then
    raise exception 'Store name is invalid.';
  end if;
  if p_purchased_at < now() - interval '5 years' or p_purchased_at > now() + interval '1 day' then
    raise exception 'Purchase date is outside the allowed range.';
  end if;

  select * into shopping_row
  from public.shopping_items
  where id = p_shopping_item_id and household_id = p_household_id
  for update;
  if not found then
    raise exception 'Shopping list item no longer exists.';
  end if;
  if shopping_row.status <> 'active' then
    raise exception 'This shopping list item is no longer active.';
  end if;

  select * into inventory_row
  from public.inventory_items
  where id = shopping_row.inventory_item_id and household_id = p_household_id
  for update;
  if not found then
    raise exception 'Inventory item no longer exists.';
  end if;

  previous_price := inventory_row.current_unit_price_cents;
  next_quantity := inventory_row.quantity + p_quantity_purchased;
  if next_quantity > 100000 then
    raise exception 'Inventory quantity would exceed the supported maximum.';
  end if;

  total_cents := round(p_unit_price_cents * p_quantity_purchased)::integer;
  if total_cents > 1000000000 then
    raise exception 'Purchase total is too large.';
  end if;

  delta := case when previous_price is null then null else p_unit_price_cents - previous_price end;
  pct := case
    when previous_price is not null and previous_price > 0 and delta is not null
      then round((delta::numeric / previous_price::numeric) * 100, 2)
    else null
  end;

  insert into public.purchases (
    household_id, inventory_item_id, shopping_item_id, purchased_by, store,
    quantity, unit_price_cents, total_cents, purchased_at, item_name, unit, currency
  ) values (
    p_household_id, inventory_row.id, shopping_row.id, actor_id, trim(p_store_name),
    p_quantity_purchased, p_unit_price_cents, total_cents, p_purchased_at,
    inventory_row.name, inventory_row.unit, inventory_row.currency
  ) returning id into purchase_id;

  if previous_price is not null and previous_price <> p_unit_price_cents then
    insert into public.price_history (
      household_id, inventory_item_id, purchase_id, store,
      previous_unit_price_cents, unit_price_cents, recorded_at,
      item_name, difference_cents, percentage_change, currency, changed_by
    ) values (
      p_household_id, inventory_row.id, purchase_id, trim(p_store_name),
      previous_price, p_unit_price_cents, now(),
      inventory_row.name, delta, pct, inventory_row.currency, actor_id
    ) returning id into history_id;
  end if;

  update public.inventory_items
  set quantity = next_quantity,
      previous_unit_price_cents = previous_price,
      current_unit_price_cents = p_unit_price_cents,
      price_change_cents = delta,
      price_change_percentage = pct,
      last_purchased_at = p_purchased_at,
      last_store_name = trim(p_store_name),
      last_purchase_quantity = p_quantity_purchased,
      updated_by = actor_id
  where id = inventory_row.id;

  update public.shopping_items
  set status = 'purchased', purchased_by = actor_id, purchased_at = p_purchased_at
  where id = shopping_row.id;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'item_purchased', 'inventory_item', inventory_row.id,
    jsonb_build_object(
      'itemName', inventory_row.name,
      'storeName', trim(p_store_name),
      'quantityPurchased', p_quantity_purchased,
      'unitPriceCents', p_unit_price_cents,
      'totalPriceCents', total_cents,
      'currency', inventory_row.currency
    )
  );

  return jsonb_build_object(
    'purchaseId', purchase_id,
    'itemId', inventory_row.id,
    'quantity', next_quantity,
    'previousPriceCents', previous_price,
    'priceChangeCents', delta,
    'priceChangePercentage', pct,
    'totalPriceCents', total_cents
  );
end;
$$;

revoke all on function private.require_household_member(uuid) from public;
revoke all on function private.clean_category_id(text) from public;
revoke all on function private.validate_inventory_values(text,text,numeric,text,numeric,integer,text,text) from public;
grant execute on function private.require_household_member(uuid) to authenticated;

grant execute on function public.create_inventory_item(uuid,text,text,numeric,text,numeric,integer,text,text) to authenticated;
grant execute on function public.update_inventory_item(uuid,uuid,text,text,numeric,text,numeric,integer,text,text) to authenticated;
grant execute on function public.adjust_inventory_quantity(uuid,uuid,numeric) to authenticated;
grant execute on function public.delete_inventory_item(uuid,uuid) to authenticated;
grant execute on function public.add_inventory_to_shopping(uuid,uuid,numeric) to authenticated;
grant execute on function public.update_shopping_quantity(uuid,uuid,numeric) to authenticated;
grant execute on function public.remove_shopping_item(uuid,uuid) to authenticated;
grant execute on function public.mark_inventory_finished(uuid,uuid,numeric) to authenticated;
grant execute on function public.purchase_shopping_item(uuid,uuid,numeric,integer,text,timestamptz) to authenticated;
