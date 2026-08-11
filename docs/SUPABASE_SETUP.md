# HomeStock Supabase Hobby Setup

HomeStock is migrating from Firebase to one hosted Supabase project so the backend stays online without a laptop running.

## What stays online

Once deployed, Supabase hosts these pieces for you:

- Postgres database
- Authentication
- Realtime subscriptions
- Edge Functions
- Edge Function secrets, including `GROQ_API_KEY`
- database webhooks for household activity notifications
- scheduled Edge Function jobs for Expo push receipt cleanup

Expo/EAS remains the cloud build service for Android and iOS. Your laptop is only needed while you are changing code or performing one-time deployment/configuration work.

> Free-plan note: a Free project is useful for hobby use but is not an uptime guarantee. If reliable production uptime becomes a requirement, use an appropriate paid hosting plan before public release.

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

The publishable key is intentionally safe to ship in a mobile app when Row Level Security is enabled. Never put a Supabase secret key, Groq key, or HomeStock internal secret in an `EXPO_PUBLIC_*` variable.

During the migration, keep the existing Firebase values too. They can be deleted after the final Firebase-removal PR.

## 3. Apply all database migrations

The repository contains ordered migrations for the foundation, household lifecycle, inventory/shopping/purchases, Finance/Go Dutch, hosted AI quotas, and notification preferences.

The safest CLI path is:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If you use the Dashboard SQL Editor instead, run every file in `supabase/migrations/` in filename order. Do not stop after the original foundation migrations.

Do not run `db reset` against the hosted hobby project once it contains real household data.

## 4. Store hosted backend secrets

The Groq key and the HomeStock internal webhook/cron secret belong in Edge Function secrets, never in Expo.

Generate a long random internal secret with a password manager or another cryptographically secure random generator, then store both values:

```bash
npx supabase secrets set GROQ_API_KEY=YOUR_GROQ_KEY --project-ref YOUR_PROJECT_REF
npx supabase secrets set HOMESTOCK_INTERNAL_SECRET=YOUR_LONG_RANDOM_SECRET --project-ref YOUR_PROJECT_REF
```

The Dashboard path is **Edge Functions > Secrets** if you prefer not to use the CLI.

Supabase provides its own hosted URL and backend keys to deployed Edge Functions. Do not create `EXPO_PUBLIC_GROQ_API_KEY` or `EXPO_PUBLIC_HOMESTOCK_INTERNAL_SECRET`.

## 5. Deploy the hosted Edge Functions

Deploy the functions currently implemented by the migration:

```bash
npx supabase functions deploy health --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-expense --project-ref YOUR_PROJECT_REF
npx supabase functions deploy suggest-expense-category --project-ref YOUR_PROJECT_REF
npx supabase functions deploy analyze-household-bill --project-ref YOUR_PROJECT_REF
npx supabase functions deploy generate-household-insights --project-ref YOUR_PROJECT_REF
npx supabase functions deploy register-push-device --project-ref YOUR_PROJECT_REF
npx supabase functions deploy notify-household-activity --project-ref YOUR_PROJECT_REF
npx supabase functions deploy process-push-receipts --project-ref YOUR_PROJECT_REF
```

The health endpoint is public only as a liveness check:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/health
```

It should return:

```json
{"ok":true,"service":"homestock-supabase"}
```

The finance, AI, and push-device registration functions validate the signed-in Supabase user inside the handler. The activity notification and receipt-processing functions instead require `HOMESTOCK_INTERNAL_SECRET` because they are called by hosted infrastructure rather than a signed-in person.

## 6. Configure the activity notification webhook

Create one Supabase Database Webhook in the Dashboard:

1. Open **Database > Webhooks** (or the Webhooks integration page for the project).
2. Create a webhook named `homestock-household-activity-push`.
3. Schema: `public`.
4. Table: `activities`.
5. Event: `INSERT` only.
6. Method: `POST`.
7. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-household-activity`.
8. Add request header `x-homestock-internal-secret` with the exact same `HOMESTOCK_INTERNAL_SECRET` value stored in Edge Function secrets.
9. Save the webhook.

The webhook is downstream of the database write. HomeStock's notification function intentionally logs Expo failures without failing the inventory/shopping transaction that already succeeded.

## 7. Schedule Expo receipt processing every 15 minutes

HomeStock queues successful Expo push tickets in `push_receipts`. The receipt processor checks them after about 15 minutes, disables `DeviceNotRegistered` tokens, retries missing receipts, and drops receipt rows after their useful lifetime.

Supabase's hosted scheduler uses `pg_cron` with `pg_net`. Store the project URL and internal secret in Supabase Vault first. Run the following once in the SQL Editor, replacing the values before execution:

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'homestock_project_url'
);

select vault.create_secret(
  'YOUR_LONG_RANDOM_SECRET',
  'homestock_internal_secret'
);
```

Then create the 15-minute job:

```sql
select cron.schedule(
  'homestock-process-push-receipts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'homestock_project_url'
    ) || '/functions/v1/process-push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-homestock-internal-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'homestock_internal_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Before creating it again, check the Cron jobs page or `cron.job` table so you do not schedule duplicate receipt processors.

## 8. Expo/EAS push prerequisites

Hosted Supabase replaces the server that sends and checks Expo notifications; it does not replace native push credentials.

Before real-device push testing:

- link the real Expo/EAS project so HomeStock has a valid EAS project ID;
- use an Expo development build or store build rather than relying on Expo Go for remote push testing;
- configure the required APNs/FCM credentials through Expo/EAS for iOS/Android.

The app stores only Expo push tokens in Supabase. APNs/FCM signing credentials stay with the native push/Expo configuration and are never written to HomeStock's database.

## 9. What not to do yet

Until the final cutover PR is complete:

- do not remove Firebase dependencies;
- do not delete the Firebase project if you already created one;
- do not put live household data into both backends manually;
- do not expose the Supabase secret key;
- do not expose `GROQ_API_KEY`;
- do not expose `HOMESTOCK_INTERNAL_SECRET`;
- do not disable Row Level Security to make an error disappear.

## 10. Migration progress

Completed hosted layers:

1. Supabase schema/RLS/client foundation
2. Auth and profiles
3. households/members/invites
4. inventory/shopping/purchases/realtime
5. Finance/Go Dutch/budgets/settlements
6. Groq AI Edge Functions and atomic AI quotas
7. Expo push registration, activity fan-out, and receipt processing

Still to migrate before final cutover:

- account deletion and remaining lifecycle operations
- mobile screen/service import cutover where Firebase is still the active fallback
- Firebase package/Functions/rules/CI removal after real-device hosted verification

The final target is one hosted Supabase project plus Expo/EAS. No laptop needs to remain running for normal use.
