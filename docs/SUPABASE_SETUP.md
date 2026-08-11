# HomeStock Supabase Hobby Setup

HomeStock is migrating from Firebase to one hosted Supabase project so the backend stays online without a laptop running.

## What stays online

Once deployed, Supabase hosts these pieces for you:

- Postgres database
- Authentication
- Realtime subscriptions
- Edge Functions
- Edge Function secrets, including `GROQ_API_KEY`
- scheduled database/Edge Function jobs added later in the migration

Expo/EAS remains the cloud build service for Android and iOS. Your laptop is only needed while you are changing code or manually running a deployment command.

> Free-plan note: Supabase can pause a low-activity Free project after a period of insufficient activity. A Free project is useful for hobby use but is not an uptime guarantee.

## 1. Create one hosted Supabase project

1. Sign in at the Supabase Dashboard.
2. Create a new project.
3. A simple name such as `homestock` is fine.
4. Choose an available EU region close to the household.
5. Save the database password somewhere private. Do not commit it to Git.

There is no required dev/staging/production split for the hobby setup. One project is enough until HomeStock needs a formal production environment strategy.

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

During the migration, keep the existing Firebase values too. They can be deleted after the final Firebase-removal PR.

## 3. Apply all database migrations

The repository now contains multiple ordered migrations for the foundation, household lifecycle, inventory/shopping/purchases, Finance/Go Dutch, and hosted AI quotas.

The safest CLI path is:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If you use the Dashboard SQL Editor instead, run every file in `supabase/migrations/` in filename order. Do not stop after the original foundation migrations.

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

Supabase provides its own hosted URL and backend keys to deployed Edge Functions. Do not create a mobile `EXPO_PUBLIC_GROQ_API_KEY`.

## 5. Deploy the hosted Edge Functions

Deploy the functions currently implemented by the migration:

```bash
npx supabase functions deploy health --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-expense --project-ref YOUR_PROJECT_REF
npx supabase functions deploy suggest-expense-category --project-ref YOUR_PROJECT_REF
npx supabase functions deploy analyze-household-bill --project-ref YOUR_PROJECT_REF
npx supabase functions deploy generate-household-insights --project-ref YOUR_PROJECT_REF
```

The health endpoint is public only as a liveness check:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/health
```

It should return:

```json
{"ok":true,"service":"homestock-supabase"}
```

The finance and AI functions are not public application operations. They validate the signed-in Supabase user inside the handler and enforce household membership before privileged work. `GROQ_API_KEY` and the Supabase backend secret key never go into the mobile bundle.

## 6. What not to do yet

Until the final cutover PR is complete:

- do not remove Firebase dependencies;
- do not delete the Firebase project if you already created one;
- do not put live household data into both backends manually;
- do not expose the Supabase secret key;
- do not expose `GROQ_API_KEY`;
- do not disable Row Level Security to make an error disappear.

## 7. Migration progress

Completed hosted layers:

1. Supabase schema/RLS/client foundation
2. Auth and profiles
3. households/members/invites
4. inventory/shopping/purchases/realtime
5. Finance/Go Dutch/budgets/settlements
6. Groq AI Edge Functions and atomic AI quotas

Still to migrate before final cutover:

- Expo push fan-out and receipt processing on hosted Supabase infrastructure
- account deletion and remaining lifecycle operations
- mobile screen/service import cutover where Firebase is still the active fallback
- Firebase package/Functions/rules/CI removal after real-device hosted verification

The final target is one hosted Supabase project plus Expo/EAS. No laptop needs to remain running for normal use.
