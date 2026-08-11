# HomeStock Supabase Hobby Setup

HomeStock is migrating from Firebase to one hosted Supabase project so the backend stays online without a laptop running.

## What stays online

Once deployed, Supabase hosts these pieces for you:

- Postgres database
- Authentication
- Realtime subscriptions
- Edge Functions
- Edge Function secrets (including `GROQ_API_KEY`)
- scheduled database/Edge Function jobs added later in the migration

Expo/EAS remains the cloud build service for Android and iOS. Your laptop is only needed while you are changing code or manually running a command.

> Free-plan note: Supabase can pause a low-activity Free project after roughly seven days of insufficient activity. Open the project in the dashboard and press **Resume project** if that happens. Normal household use should create activity, but the Free plan is not an uptime guarantee.

## 1. Create one free Supabase project

1. Sign in at the Supabase Dashboard.
2. Create a new project.
3. A simple name such as `homestock` is fine.
4. Choose a region close to the household (for Ireland, choose an available nearby EU region).
5. Save the database password somewhere private. Do not commit it to Git.

There is no dev/staging/production split for the hobby setup. Use this one project.

## 2. Get the two mobile-safe values

Open the project's **Connect** dialog or **Settings > API Keys** and copy:

- Project URL, such as `https://abcxyz.supabase.co`
- Publishable key, starting with `sb_publishable_`

Create `.env.local` in the repository root:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

The publishable key is intentionally safe to ship in a mobile app when Row Level Security is enabled. Never put a Supabase secret key or Groq key in an `EXPO_PUBLIC_*` variable.

During the migration, keep the existing Firebase values in `.env.local` too. They can be deleted after the final Firebase-removal PR.

## 3. Apply the database schema

### Easiest method: Supabase Dashboard

1. Open **SQL Editor**.
2. Open `supabase/migrations/20260811123000_initial_homestock.sql` from this repository.
3. Paste it into a new query and run it.
4. Then run `supabase/migrations/20260811123500_harden_foundation.sql`.

The migrations create household, inventory, shopping, purchase, finance, debt, settlement, budget, activity, device, AI, and push-receipt structures with Row Level Security.

### CLI method (optional)

If you prefer the CLI later:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Do not run `db reset` against the hosted hobby project once it contains real household data.

## 4. Store the Groq key on the hosted backend

The Groq key belongs in Edge Function secrets, never in Expo.

Using the Dashboard:

1. Open **Edge Functions > Secrets**.
2. Add `GROQ_API_KEY`.
3. Paste the Groq API key and save.

Or with the CLI:

```bash
npx supabase secrets set GROQ_API_KEY=YOUR_GROQ_KEY --project-ref YOUR_PROJECT_REF
```

Supabase automatically provides its own hosted URL and backend keys to deployed Edge Functions. Do not create a mobile `EXPO_PUBLIC_GROQ_API_KEY`.

## 5. Deploy the first hosted function

The first function is only a health check. It proves the backend runs when your laptop is off.

```bash
npx supabase functions deploy health --project-ref YOUR_PROJECT_REF
```

After deployment, the endpoint is:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/health
```

It should return:

```json
{"ok":true,"service":"homestock-supabase"}
```

Shut the laptop lid and call the URL from your phone. The response still comes from Supabase's hosted Edge Function.

## 6. What not to do yet

Until the migration PRs are complete:

- do not remove Firebase dependencies;
- do not delete the Firebase project if you already created one;
- do not put live household data into both backends manually;
- do not expose the Supabase secret key;
- do not expose `GROQ_API_KEY`;
- do not disable Row Level Security to make an error disappear.

## 7. Migration order

HomeStock moves feature-by-feature so the app remains usable:

1. Supabase schema/RLS/client foundation
2. Auth and profiles
3. households/members/invites
4. inventory/shopping/purchases/realtime
5. finance/Go Dutch/budgets/settlements
6. Groq AI and push-processing Edge Functions
7. account/household deletion
8. remove Firebase packages, Functions, rules, and Firebase CI

The final target is one hosted Supabase project plus Expo/EAS. No laptop needs to remain running for normal use.
