-- Remote push transport was retired with Expo/Firebase. HomeStock now relies on
-- Supabase Realtime for in-app household updates. Drop the obsolete token and
-- receipt tables, including any RLS policies/grants attached to them.

drop table if exists public.push_receipts cascade;
drop table if exists public.devices cascade;
