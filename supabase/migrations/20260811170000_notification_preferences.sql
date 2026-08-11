-- Keep the user's explicit notification preference separate from OS permission
-- and per-device token health so token refresh cannot silently re-enable a user
-- who turned HomeStock notifications off.

alter table public.profiles
  add column if not exists notifications_enabled boolean not null default true;

alter table public.devices
  add column if not exists platform text,
  add column if not exists last_seen_at timestamptz;

alter table public.devices
  drop constraint if exists devices_platform_check;

alter table public.devices
  add constraint devices_platform_check
  check (platform is null or platform in ('ios', 'android'));
