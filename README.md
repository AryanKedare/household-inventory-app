# HomeStock

HomeStock is a cross-platform iOS/Android household inventory, shopping and shared-household finance app. Household members can track items at home, maintain a shared shopping list, scan barcodes, record purchases and price changes, split household expenses, track repayments and receive household updates.

The repository is currently in a staged Firebase-to-Supabase migration. Firebase still powers parts of the active mobile runtime, while Supabase-backed services and migrations are being introduced incrementally. Do not remove either backend until the final cutover is verified.

## Main features

- email/password authentication and household membership
- household create/join/invite and role management
- inventory CRUD, quantity controls and low/out-of-stock state
- barcode scanning
- shared shopping list and purchase completion
- purchase and price history
- household expenses, deterministic bill splitting and repayments
- monthly/category budgets
- optional Groq-assisted categorisation, bill extraction and spending insights
- Expo push notifications
- Firebase/Supabase backend verification and security checks

## Stack

- Expo SDK 57
- React Native 0.86
- React 19.2
- TypeScript strict mode
- React Navigation 7
- Firebase Authentication / Firestore / Cloud Functions during migration
- Supabase Postgres / Auth / Realtime / Edge Functions for migrated services
- Expo Camera
- Expo Notifications
- React Hook Form + Zod
- local native Android/iOS compilation via Expo CLI

## Install

```bash
npm install
npm --prefix functions install
cp .env.example .env
```

Fill the required Firebase/Supabase public configuration in `.env`. Never commit `.env`, service-account keys, backend secrets, signing credentials, APNs/FCM credentials, Groq keys or generated authentication files.

## Run and compile locally

Start Metro only:

```bash
npm start
```

Build and run Android locally:

```bash
npm run android
```

Build and run iOS locally:

```bash
npm run ios
```

Local release builds:

```bash
npm run android:release
npm run ios:release
```

You can explicitly generate/update the native projects with:

```bash
npm run prebuild
```

### Local toolchain requirements

Android builds require a local Android development toolchain (Android Studio/Android SDK and a compatible JDK). iOS builds require macOS with Xcode and the required native Apple toolchain. Signing credentials are still required for installable/distributable release binaries.

HomeStock does **not** require EAS Build for compilation. The former EAS cloud-build and submit workflows/configuration have been removed. Expo services may still be used independently for push notifications; that is separate from compiling the application.

## Local backend testing

Firebase emulators:

```bash
npm run emulators
```

Verification:

```bash
npm run typecheck
npm run lint
npm test
npm run functions:build
npm run test:functions
npm run test:rules
```

The repository keeps GitHub CI/security checks because they validate code; they do not compile or distribute the mobile application through a hosted build service.

## Supabase migration

See `docs/SUPABASE_SETUP.md` for the current hosted Supabase setup and migration status. The migration is intentionally incremental; the open final-cutover work should only be merged after its backend tests and real-device verification are healthy.

## Firebase configuration

The checked-in `.firebaserc` contains placeholder development/staging/production aliases. Replace them with real Firebase project IDs for any environment that still uses Firebase during the migration.

For local emulator use, set:

```text
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true
```

Default ports:

- Auth `9099`
- Firestore `8080`
- Functions `5001`
- Emulator UI `4000`

For a physical device on the same LAN, set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to the development machine's LAN IP.

## Security notes

- Never expose Groq or Supabase secret/service-role keys in `EXPO_PUBLIC_*` variables.
- Do not bypass Row Level Security or Firestore Security Rules to work around development errors.
- Do not enable production App Check enforcement before real staging iOS/Android builds have proven valid attestation.
- Do not use `npm audit fix --force` merely to silence transitive framework advisories.
- Sensitive concurrent finance/inventory operations should remain server-side and transactional.
- Money is represented as integer cents.

## Documentation

- `docs/PRODUCT_REQUIREMENTS.md` — product baseline
- `docs/ARCHITECTURE.md` — architecture
- `docs/SUPABASE_SETUP.md` — current Supabase migration/setup
- `docs/PRODUCTION_RELEASE.md` — release checklist
- `docs/ROADMAP.md` — remaining work
- `SECURITY.md` — vulnerability reporting and security expectations

HomeStock is not yet a public production release. Complete backend cutover, physical-device testing, signing, legal/store metadata, push configuration and production security checks before publication.
