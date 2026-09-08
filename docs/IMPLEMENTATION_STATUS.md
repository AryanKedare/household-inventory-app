# Implementation Status

Updated: 8 September 2026

## Current target

HomeStock is being finalized as a **bare React Native + Supabase** application.

### Mobile

- React Native Community CLI 0.86.3
- React 19.2.3
- native iOS and Android builds
- VisionCamera barcode scanning
- React Navigation
- no Expo runtime
- no EAS Build/Submit
- no Firebase SDK

### Backend

- Supabase Auth
- Supabase Postgres
- Row Level Security
- Supabase Realtime
- SQL RPCs for transactional operations
- Supabase Edge Functions for privileged and AI operations
- server-side secrets managed by Supabase

## Completed migration areas

- Authentication and profile lifecycle moved to Supabase.
- Household creation, joining, membership and administration moved to Supabase.
- Inventory, quantity changes and barcode lookup moved to Supabase.
- Shopping-list and purchase flows moved to Supabase.
- Purchase/price history moved to Supabase.
- Shared finance, budgets, debts and settlements moved to Supabase.
- AI category suggestions, bill analysis and household insights run through Supabase Edge Functions.
- Expo camera was replaced by a native VisionCamera barcode scanner.
- Expo/EAS build and submission configuration was removed.
- Firebase Functions/deployment workflow and Firebase package dependencies were removed.
- Expo push-token and push-receipt schema is removed by migration.
- Local native project creation is reproducible with `npm run native:bootstrap`.

## Notification status

Remote background push notifications are intentionally not part of the migrated baseline because the former transport was Expo/Firebase based. Supabase Realtime continues to update household state while HomeStock is active.

A future remote-push implementation should be added as a separate native capability and must not require Expo or Firebase unless that architectural decision is explicitly reversed.

## Local build workflow

First-time native scaffolding:

```bash
npm install
cp .env.example .env
npm run native:bootstrap
```

On macOS:

```bash
npm run pods
npm run ios
```

Android:

```bash
npm run android
```

## Remaining release work

The migration is code-complete only after repository CI and Supabase schema checks pass on the final PR. Before production release also verify:

- production Supabase migrations are applied to the intended project;
- RLS policies are reviewed against production requirements;
- Supabase Auth settings and redirect configuration are correct;
- Edge Function secrets are configured;
- physical-device barcode scanning works on iOS and Android;
- Xcode/Android release signing is configured;
- privacy policy and store disclosures match the deployed architecture;
- store archives/bundles are produced and smoke-tested locally.
