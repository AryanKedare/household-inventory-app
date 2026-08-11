-- Hosted household finance, budgets and settlement lifecycle.

alter table public.expenses
  add column category_source text not null default 'manual'
    check (category_source in ('manual', 'ai', 'inventory')),
  add column category_confidence numeric(5,4)
    check (category_confidence is null or (category_confidence >= 0 and category_confidence <= 1)),
  add column paid_by_name text not null default 'Household member',
  add column participant_ids uuid[] not null default '{}',
  add column participant_subtotals jsonb not null default '[]'::jsonb,
  add column line_items jsonb not null default '[]'::jsonb,
  add column allocations jsonb not null default '[]'::jsonb,
  add column notes text,
  add constraint expenses_category_check check (
    category in (
      'groceries','dining_out','rent_mortgage','utilities','household_supplies',
      'transport_commute','fuel','public_transport','electronics','furniture_home',
      'subscriptions','entertainment','health','insurance','childcare','travel',
      'maintenance_repairs','pets','shared_personal','other'
    )
  ),
  add constraint expenses_notes_length check (notes is null or char_length(notes) <= 1000);

alter table public.settlements
  add column note text,
  add column currency text not null default 'EUR' check (char_length(currency) = 3),
  add constraint settlements_note_length check (note is null or char_length(note) <= 500);

create or replace function private.valid_expense_category(p_category text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_category in (
    'groceries','dining_out','rent_mortgage','utilities','household_supplies',
    'transport_commute','fuel','public_transport','electronics','furniture_home',
    'subscriptions','entertainment','health','insurance','childcare','travel',
    'maintenance_repairs','pets','shared_personal','other'
  );
$$;

create or replace function private.persist_household_expense(
  p_actor_id uuid,
  p_household_id uuid,
  p_title text,
  p_merchant text,
  p_category text,
  p_paid_by uuid,
  p_expense_date date,
  p_discount_cents integer,
  p_fee_cents integer,
  p_subtotal_cents integer,
  p_total_cents integer,
  p_participant_subtotals jsonb,
  p_line_items jsonb,
  p_allocations jsonb,
  p_debts jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_expense_id uuid;
  household_currency text;
  payer_name text;
  participant_ids uuid[];
  allocation_total bigint;
  allocation_subtotal bigint;
  discount_total bigint;
  fee_total bigint;
  required_user uuid;
  debt_record record;
begin
  if p_actor_id is null or p_household_id is null or p_paid_by is null then
    raise exception 'Expense identity is invalid.';
  end if;
  if not private.is_household_member(p_household_id, p_actor_id) then
    raise exception 'Actor is not a household member.';
  end if;
  if not private.is_household_member(p_household_id, p_paid_by) then
    raise exception 'Payer must belong to the household.';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 1 or char_length(trim(p_title)) > 120 then
    raise exception 'Expense title is invalid.';
  end if;
  if p_merchant is not null and char_length(trim(p_merchant)) > 120 then
    raise exception 'Merchant is invalid.';
  end if;
  if not private.valid_expense_category(p_category) then
    raise exception 'Expense category is invalid.';
  end if;
  if p_expense_date < current_date - 1827 or p_expense_date > current_date + 1 then
    raise exception 'Expense date is outside the allowed range.';
  end if;
  if p_discount_cents < 0 or p_fee_cents < 0 or p_subtotal_cents <= 0 or p_total_cents < 0
     or p_subtotal_cents > 100000000 or p_discount_cents > p_subtotal_cents
     or p_fee_cents > 100000000 or p_total_cents > 100000000 then
    raise exception 'Expense amounts are invalid.';
  end if;
  if p_total_cents <> p_subtotal_cents - p_discount_cents + p_fee_cents then
    raise exception 'Expense total does not reconcile.';
  end if;
  if jsonb_typeof(p_participant_subtotals) <> 'array'
     or jsonb_typeof(p_line_items) <> 'array'
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_typeof(p_debts) <> 'array' then
    raise exception 'Expense split payload is invalid.';
  end if;
  if jsonb_array_length(p_allocations) < 1 or jsonb_array_length(p_allocations) > 20 then
    raise exception 'Expense participants are invalid.';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'Notes are too long.';
  end if;

  select coalesce(array_agg(distinct (entry ->> 'userId')::uuid), '{}')
    into participant_ids
  from jsonb_array_elements(p_allocations) entry;

  foreach required_user in array participant_ids loop
    if not private.is_household_member(p_household_id, required_user) then
      raise exception 'Every participant must belong to the household.';
    end if;
  end loop;

  select
    coalesce(sum((entry ->> 'owedCents')::bigint), 0),
    coalesce(sum((entry ->> 'subtotalCents')::bigint), 0),
    coalesce(sum((entry ->> 'discountShareCents')::bigint), 0),
    coalesce(sum((entry ->> 'feeShareCents')::bigint), 0)
  into allocation_total, allocation_subtotal, discount_total, fee_total
  from jsonb_array_elements(p_allocations) entry;

  if allocation_total <> p_total_cents
     or allocation_subtotal <> p_subtotal_cents
     or discount_total <> p_discount_cents
     or fee_total <> p_fee_cents then
    raise exception 'Expense allocations do not reconcile.';
  end if;

  select h.currency into household_currency
  from public.households h
  where h.id = p_household_id and h.deletion_started_at is null
  for update;
  if household_currency is null then
    raise exception 'Household no longer exists.';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.email), ''), 'Household member')
  into payer_name
  from public.profiles p
  where p.id = p_paid_by;
  payer_name := coalesce(payer_name, 'Household member');

  insert into public.expenses (
    household_id, title, category, merchant, currency,
    subtotal_cents, discount_cents, fee_cents, total_cents,
    paid_by, created_by, expense_date, notes,
    category_source, paid_by_name, participant_ids,
    participant_subtotals, line_items, allocations
  ) values (
    p_household_id, trim(p_title), p_category, nullif(trim(coalesce(p_merchant, '')), ''), household_currency,
    p_subtotal_cents, p_discount_cents, p_fee_cents, p_total_cents,
    p_paid_by, p_actor_id, p_expense_date, nullif(trim(coalesce(p_notes, '')), ''),
    'manual', payer_name, participant_ids,
    p_participant_subtotals, p_line_items, p_allocations
  ) returning id into new_expense_id;

  for debt_record in
    select
      (entry ->> 'fromUserId')::uuid as debtor_id,
      (entry ->> 'toUserId')::uuid as creditor_id,
      (entry ->> 'amountCents')::integer as amount_cents
    from jsonb_array_elements(p_debts) entry
  loop
    if debt_record.amount_cents <= 0 or debt_record.amount_cents > p_total_cents then
      raise exception 'Expense debt is invalid.';
    end if;
    if debt_record.creditor_id <> p_paid_by
       or debt_record.debtor_id = p_paid_by
       or not (debt_record.debtor_id = any(participant_ids)) then
      raise exception 'Expense debt participants are invalid.';
    end if;

    insert into public.debts (
      household_id, expense_id, debtor_id, creditor_id, original_cents, settled_cents, status
    ) values (
      p_household_id, new_expense_id, debt_record.debtor_id, debt_record.creditor_id,
      debt_record.amount_cents, 0, 'open'
    );
  end loop;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, p_actor_id, 'expense_created', 'expense', new_expense_id,
    jsonb_build_object(
      'title', trim(p_title),
      'merchantName', nullif(trim(coalesce(p_merchant, '')), ''),
      'categoryId', p_category,
      'totalPaidCents', p_total_cents,
      'paidBy', p_paid_by,
      'participantCount', cardinality(participant_ids)
    )
  );

  return jsonb_build_object(
    'expenseId', new_expense_id,
    'currency', household_currency,
    'paidByName', payer_name
  );
end;
$$;

create or replace function public.upsert_monthly_budget(
  p_household_id uuid,
  p_period text,
  p_total_limit_cents integer,
  p_category_limits jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.household_role;
  period_start date;
  household_currency text;
  category_entry jsonb;
  category_id text;
  category_limit integer;
begin
  if actor_id is null then raise exception 'You must be signed in.'; end if;
  actor_role := private.household_role(p_household_id, actor_id);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Only household admins can change budgets.';
  end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Budget period must use YYYY-MM.';
  end if;
  period_start := (p_period || '-01')::date;
  if p_total_limit_cents < 0 or p_total_limit_cents > 100000000 then
    raise exception 'Monthly budget is invalid.';
  end if;
  if jsonb_typeof(p_category_limits) <> 'array' or jsonb_array_length(p_category_limits) > 20 then
    raise exception 'Category limits are invalid.';
  end if;

  select currency into household_currency
  from public.households
  where id = p_household_id and deletion_started_at is null;
  if household_currency is null then raise exception 'Household no longer exists.'; end if;

  delete from public.budgets
  where household_id = p_household_id and period_start = period_start;

  insert into public.budgets (
    household_id, period_start, category, limit_cents, created_by, updated_by
  ) values (
    p_household_id, period_start, null, p_total_limit_cents, actor_id, actor_id
  );

  for category_entry in select value from jsonb_array_elements(p_category_limits)
  loop
    category_id := category_entry ->> 'categoryId';
    category_limit := (category_entry ->> 'limitCents')::integer;
    if not private.valid_expense_category(category_id)
       or category_limit < 0 or category_limit > 100000000 then
      raise exception 'Category budget is invalid.';
    end if;

    insert into public.budgets (
      household_id, period_start, category, limit_cents, created_by, updated_by
    ) values (
      p_household_id, period_start, category_id, category_limit, actor_id, actor_id
    );
  end loop;

  return jsonb_build_object('success', true, 'period', p_period, 'currency', household_currency);
end;
$$;

create or replace function public.record_expense_settlement(
  p_household_id uuid,
  p_expense_id uuid,
  p_from_user_id uuid,
  p_amount_cents integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_household_member(p_household_id);
  expense_row public.expenses%rowtype;
  debt_row public.debts%rowtype;
  new_settlement_id uuid;
  next_settled integer;
  remaining integer;
  next_status public.debt_status;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'Settlement amount is invalid.';
  end if;
  if p_note is not null and char_length(trim(p_note)) > 500 then
    raise exception 'Settlement note is too long.';
  end if;

  select * into expense_row
  from public.expenses
  where id = p_expense_id and household_id = p_household_id
  for update;
  if not found then raise exception 'Expense no longer exists.'; end if;

  select * into debt_row
  from public.debts
  where household_id = p_household_id
    and expense_id = p_expense_id
    and debtor_id = p_from_user_id
    and creditor_id = expense_row.paid_by
  for update;
  if not found then raise exception 'Matching expense debt no longer exists.'; end if;

  if actor_id <> debt_row.debtor_id and actor_id <> debt_row.creditor_id then
    raise exception 'Only the debtor or payee can record this settlement.';
  end if;

  remaining := debt_row.original_cents - debt_row.settled_cents;
  if p_amount_cents > remaining then
    raise exception 'Settlement cannot exceed the outstanding debt.';
  end if;

  next_settled := debt_row.settled_cents + p_amount_cents;
  update public.debts
  set settled_cents = next_settled
  where id = debt_row.id
  returning status into next_status;

  insert into public.settlements (
    household_id, debt_id, from_user_id, to_user_id, amount_cents,
    recorded_by, settled_at, note, currency
  ) values (
    p_household_id, debt_row.id, debt_row.debtor_id, debt_row.creditor_id,
    p_amount_cents, actor_id, now(), nullif(trim(coalesce(p_note, '')), ''), expense_row.currency
  ) returning id into new_settlement_id;

  insert into public.activities (
    household_id, actor_id, activity_type, entity_type, entity_id, metadata
  ) values (
    p_household_id, actor_id, 'expense_settlement_recorded', 'expense', p_expense_id,
    jsonb_build_object(
      'settlementId', new_settlement_id,
      'fromUserId', debt_row.debtor_id,
      'toUserId', debt_row.creditor_id,
      'amountCents', p_amount_cents,
      'remainingCents', debt_row.original_cents - next_settled
    )
  );

  return jsonb_build_object(
    'settlementId', new_settlement_id,
    'expenseId', p_expense_id,
    'fromUserId', debt_row.debtor_id,
    'toUserId', debt_row.creditor_id,
    'amountCents', p_amount_cents,
    'settledCents', next_settled,
    'remainingCents', debt_row.original_cents - next_settled,
    'settlementStatus', next_status
  );
end;
$$;

revoke all on function private.persist_household_expense(uuid,uuid,text,text,text,uuid,date,integer,integer,integer,integer,jsonb,jsonb,jsonb,jsonb,text) from public;
revoke all on function public.upsert_monthly_budget(uuid,text,integer,jsonb) from public;
revoke all on function public.record_expense_settlement(uuid,uuid,uuid,integer,text) from public;

grant execute on function private.persist_household_expense(uuid,uuid,text,text,text,uuid,date,integer,integer,integer,integer,jsonb,jsonb,jsonb,jsonb,text) to service_role;
grant execute on function public.upsert_monthly_budget(uuid,text,integer,jsonb) to authenticated;
grant execute on function public.record_expense_settlement(uuid,uuid,uuid,integer,text) to authenticated;
