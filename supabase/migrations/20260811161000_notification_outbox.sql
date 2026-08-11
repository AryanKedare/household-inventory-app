create table public.notification_outbox (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
grant all on public.notification_outbox to service_role;

create index notification_outbox_pending_idx
  on public.notification_outbox(processed_at, available_at)
  where processed_at is null;

create or replace function private.queue_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activity_type in ('item_finished', 'shopping_item_added', 'item_purchased') then
    insert into public.notification_outbox (activity_id, household_id)
    values (new.id, new.household_id)
    on conflict (activity_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger queue_household_activity_notification
  after insert on public.activities
  for each row execute function private.queue_activity_notification();

-- Hosted setup: store `project_url` and `secret_key` in Supabase Vault, then run
-- `select public.configure_notification_cron();` once. This avoids committing
-- backend credentials while keeping delivery independent of any client device.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.configure_notification_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  secret_key text;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into secret_key
    from vault.decrypted_secrets where name = 'secret_key' limit 1;

  if project_url is null or secret_key is null then
    raise exception 'Vault secrets project_url and secret_key must be configured first.';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'homestock-process-notifications';

  perform cron.schedule(
    'homestock-process-notifications',
    '* * * * *',
    format(
      $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',%L), body := '{}'::jsonb);$job$,
      rtrim(project_url, '/') || '/functions/v1/process-notifications',
      secret_key
    )
  );
end;
$$;

revoke all on function public.configure_notification_cron() from public, anon, authenticated;
grant execute on function public.configure_notification_cron() to service_role;
