# Supabase Setup

HomeStock uses Supabase as its application backend. Firebase is not required.

## Mobile environment

Copy:

```bash
cp .env.example .env
```

Set only the mobile-safe project configuration:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

The publishable key is intended for client use and is constrained by Supabase Auth and RLS. Never put a service-role key in the mobile application.

## Local Supabase development

Install the Supabase CLI using a supported installation method, then:

```bash
supabase start
supabase db lint
```

Migration files live in `supabase/migrations/`. Edge Functions live in `supabase/functions/`.

## Hosted project

For a hosted environment:

1. create/select the Supabase project;
2. link the local repository with the Supabase CLI;
3. review and apply migrations in order;
4. verify RLS policies;
5. configure Auth settings;
6. configure Edge Function secrets;
7. deploy required Edge Functions;
8. set the hosted project URL and publishable key in the mobile `.env` before compiling the app.

## AI secrets

AI provider credentials are server-side only. Configure them as Supabase Edge Function secrets, for example the provider key used by the Groq integration. They must not be prefixed or exposed as mobile/public environment variables.

## Realtime

HomeStock subscribes to relevant Supabase Postgres changes for active household views. Ensure the migrations that add required tables to `supabase_realtime` publication have been applied.

## Push notifications

The Expo/Firebase remote push implementation has been retired. The cleanup migration removes the former Expo token/receipt tables. Background remote push is not required for the current application baseline.

## Validation

Before using a production project:

- create two test users;
- create/join a household;
- verify members can read/write only authorized household data;
- verify non-members cannot query another household;
- test inventory, shopping, purchase/history and finance RPCs;
- test account deletion;
- test AI Edge Functions if enabled;
- run database lint and repository CI.
