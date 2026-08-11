create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_operation text,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count integer;
begin
  if p_user_id is null or p_operation not in ('category', 'bill', 'insights') or p_limit < 1 then
    raise exception 'Invalid AI quota request.';
  end if;

  insert into public.ai_usage (user_id, usage_date, operation, request_count, updated_at)
  values (p_user_id, current_date, p_operation, 1, now())
  on conflict (user_id, usage_date, operation) do update
    set request_count = public.ai_usage.request_count + 1,
        updated_at = now()
    where public.ai_usage.request_count < p_limit
  returning request_count into next_count;

  if next_count is null then
    raise exception 'Daily AI quota reached.';
  end if;
  return next_count;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

alter table public.ai_insights replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.ai_insights;
exception
  when duplicate_object then null;
end;
$$;
