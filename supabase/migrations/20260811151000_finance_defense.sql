alter table public.budgets
  add column currency text not null default 'EUR' check (char_length(currency) = 3);

-- The Edge Function owns the deterministic calculation, but the database also
-- verifies that every debt exactly matches the corresponding non-payer allocation.
create or replace function public.persist_household_expense(
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
  expected_debt_count integer;
  actual_debt_count integer;
  invalid_debt_count integer;
begin
  select count(*)::integer into expected_debt_count
  from jsonb_array_elements(p_allocations) allocation
  where (allocation ->> 'userId')::uuid <> p_paid_by
    and (allocation ->> 'owedCents')::integer > 0;

  select count(*)::integer, count(*)::integer - count(distinct (debt ->> 'fromUserId'))::integer
  into actual_debt_count, invalid_debt_count
  from jsonb_array_elements(p_debts) debt;

  if actual_debt_count <> expected_debt_count or invalid_debt_count <> 0 then
    raise exception 'Expense debts do not match allocations.';
  end if;

  select count(*)::integer into invalid_debt_count
  from jsonb_array_elements(p_debts) debt
  left join jsonb_array_elements(p_allocations) allocation
    on allocation ->> 'userId' = debt ->> 'fromUserId'
  where (debt ->> 'toUserId')::uuid <> p_paid_by
     or (debt ->> 'fromUserId')::uuid = p_paid_by
     or allocation is null
     or (debt ->> 'amountCents')::integer <> (allocation ->> 'owedCents')::integer;

  if invalid_debt_count <> 0 then
    raise exception 'Expense debt amounts do not reconcile.';
  end if;

  return private.persist_household_expense(
    p_actor_id,
    p_household_id,
    p_title,
    p_merchant,
    p_category,
    p_paid_by,
    p_expense_date,
    p_discount_cents,
    p_fee_cents,
    p_subtotal_cents,
    p_total_cents,
    p_participant_subtotals,
    p_line_items,
    p_allocations,
    p_debts,
    p_notes
  );
end;
$$;

revoke all on function public.persist_household_expense(uuid,uuid,text,text,text,uuid,date,integer,integer,integer,integer,jsonb,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.persist_household_expense(uuid,uuid,text,text,text,uuid,date,integer,integer,integer,integer,jsonb,jsonb,jsonb,jsonb,text) to service_role;

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
  v_period_start date;
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
  v_period_start := (p_period || '-01')::date;
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

  delete from public.budgets b
  where b.household_id = p_household_id and b.period_start = v_period_start;

  insert into public.budgets (
    household_id, period_start, category, limit_cents, currency, created_by, updated_by
  ) values (
    p_household_id, v_period_start, null, p_total_limit_cents, household_currency, actor_id, actor_id
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
      household_id, period_start, category, limit_cents, currency, created_by, updated_by
    ) values (
      p_household_id, v_period_start, category_id, category_limit, household_currency, actor_id, actor_id
    );
  end loop;

  return jsonb_build_object('success', true, 'period', p_period, 'currency', household_currency);
end;
$$;
