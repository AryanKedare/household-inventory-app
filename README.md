# HomeStock

HomeStock is a native React Native household inventory, shopping and shared-finance application for iOS and Android.

## Architecture

- **Mobile:** React Native Community CLI 0.86.3
- **Backend:** Supabase Auth, Postgres, Realtime and Edge Functions
- **Barcode scanning:** VisionCamera native barcode scanner
- **Builds:** local Xcode and Gradle builds
- **AI:** Supabase Edge Functions with server-side secrets

HomeStock does **not** require Expo, EAS Build or Firebase.

Remote push notifications are intentionally disabled in this migration because the previous transport depended on Expo/Firebase. Household state continues to update through Supabase Realtime while the app is running.

## Prerequisites

- Node.js 22.11 or later
- npm
- Supabase CLI for local database/function development
- Android Studio + Android SDK + JDK for Android
- macOS + Xcode + CocoaPods for iOS

## First-time setup

```bash
npm install
cp .env.example .env
```

Set the mobile-safe Supabase values in `.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Never place a Supabase service-role key or AI provider secret in the mobile `.env` file.

### Generate the native projects

The repository keeps the application source separate from generated React Native native scaffolding. Generate standard React Native 0.86.3 iOS/Android projects once with:

```bash
npm run native:bootstrap
```

This uses the official React Native Community CLI and preserves the application identifier:

```text
com.aryankedare.householdinventory
```

After the native projects exist, they are yours to maintain directly in Xcode/Gradle. Expo prebuild is not involved.

## iOS

On macOS:

```bash
npm install
npm run pods
npm run ios
```

For a Release configuration:

```bash
npm run ios:release
```

Open the generated `.xcworkspace` in Xcode when you need to manage signing, capabilities, a physical iPhone or App Store archives.

## Android

```bash
npm install
npm run android
```

For a release build:

```bash
npm run android:release
```

Configure your own release signing keystore before publishing to Google Play.

## Supabase

Database schema and security changes live under `supabase/migrations/`. Edge Functions live under `supabase/functions/`.

Typical backend checks:

```bash
supabase start
supabase db lint
```

Server-side secrets such as `GROQ_API_KEY` must be stored with Supabase secrets, not in the mobile application.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run verify
```

## Migration note

The Firebase data model has been replaced by Supabase services and SQL migrations. Before using a production project, apply the Supabase migrations to the intended project and verify RLS policies, Auth settings and Edge Function secrets.
