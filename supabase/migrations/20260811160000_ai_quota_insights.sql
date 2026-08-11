-- Hosted AI quota accounting and one insight snapshot per household/month.

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_operation text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  v_limit := case p_operation
    when 'category' then 40
    when 'bill' then 20
    when 'insights' then 5
    else null
  end;

  if v_limit is null then
    raise exception using errcode = '22023', message = 'Unsupported AI operation.';
  end if;

  insert into public.ai_usage (
    user_id,
    usage_date,
    operation,
    request_count,
    updated_at
  ) values (
    p_user_id,
    current_date,
    p_operation,
    1,
    now()
  )
  on conflict (user_id, usage_date, operation)
  do update
    set request_count = public.ai_usage.request_count + 1,
        updated_at = now()
    where public.ai_usage.request_count < v_limit
  returning request_count into v_count;

  if v_count is null then
    raise exception using errcode = 'P0001', message = 'AI_QUOTA_EXCEEDED';
  end if;

  return v_count;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text) to service_role;

create unique index if not exists ai_insights_household_period_type_unique
  on public.ai_insights(household_id, period_start, insight_type);
