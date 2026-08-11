-- Defense-in-depth rules for the initial HomeStock Supabase schema.

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Inventory status is derived from quantity. Clients cannot create an impossible
-- state such as quantity=5 with status='out'.
create or replace function private.sync_inventory_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity = 0 then
    new.status = 'out'::public.inventory_status;
  elsif new.quantity <= new.low_stock_threshold then
    new.status = 'low'::public.inventory_status;
  else
    new.status = 'available'::public.inventory_status;
  end if;
  return new;
end;
$$;

create trigger inventory_items_sync_status
  before insert or update of quantity, low_stock_threshold
  on public.inventory_items
  for each row execute function private.sync_inventory_status();

-- Debt state is derived from the immutable original amount and settled amount.
create or replace function private.sync_debt_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.settled_cents = 0 then
    new.status = 'open'::public.debt_status;
  elsif new.settled_cents = new.original_cents then
    new.status = 'settled'::public.debt_status;
  else
    new.status = 'partial'::public.debt_status;
  end if;
  return new;
end;
$$;

create trigger debts_sync_status
  before insert or update of original_cents, settled_cents
  on public.debts
  for each row execute function private.sync_debt_status();

alter table public.expenses
  add constraint expenses_discount_not_above_subtotal
  check (discount_cents <= subtotal_cents);

alter table public.expense_lines
  add constraint expense_lines_discount_not_above_subtotal
  check (discount_cents <= subtotal_cents);

-- A user may only point their profile at a household they actually belong to.
drop policy profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      default_household_id is null
      or private.is_household_member(default_household_id)
    )
  );

-- Shopping mutation will move through a transactional API/Edge Function during
-- migration, because purchase state and audit fields must not be forgeable by a
-- mobile client. Keep it read-only until that API exists.
drop policy shopping_items_insert_member on public.shopping_items;
drop policy shopping_items_update_member on public.shopping_items;
drop policy shopping_items_delete_member on public.shopping_items;
revoke insert, update, delete on public.shopping_items from authenticated;
