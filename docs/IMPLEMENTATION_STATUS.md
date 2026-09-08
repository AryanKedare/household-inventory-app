# HomeStock Implementation Status

Updated: 8 September 2026

## Current state

HomeStock is an Expo SDK 57 / React Native / strict TypeScript application in an incremental Firebase-to-Supabase migration. Firebase remains active for parts of the mobile/backend runtime while Supabase-backed database, auth, realtime and Edge Function work is being introduced and verified.

Mobile compilation is local. EAS Build and EAS Submit are no longer part of the repository build flow.

## Implemented

### Application and household

- persisted authentication
- household creation/joining and role management
- invite regeneration
- ownership transfer, member removal and household leave
- guarded account/household deletion flows
- lifecycle/activity records

### Inventory, shopping and purchases

- household-scoped inventory CRUD
- filtering/sorting and low/out-of-stock state
- barcode scanning
- shared shopping list
- transactional quantity and purchase operations
- purchase and price history
- concurrency coverage for critical mutations

### Household finance

- direct and itemized shared expenses
- deterministic discount/fee allocation and cent reconciliation
- debt tracking
- partial/full repayments
- monthly/category budgets
- concurrency-safe settlement behavior

### AI

- Groq-assisted category suggestions
- review-first bill extraction
- household spending insights
- server-side Groq secret handling
- per-user quotas and bounded provider requests
- Supabase AI Edge Function migration work already present in the repository

### Notifications

- Expo push registration and delivery logic
- household activity fan-out
- actor exclusion
- ticket/receipt handling and invalid-token cleanup

The complete notification migration to Supabase remains open work and should not be merged until its backend checks and real-device behavior are healthy.

## Local mobile build flow

Development builds:

```bash
npm run android
npm run ios
```

Release builds:

```bash
npm run android:release
npm run ios:release
```

Native projects can be generated/refreshed with:

```bash
npm run prebuild
```

Android requires the local Android SDK/toolchain. iOS requires macOS and Xcode. Signing credentials are required for distributable release binaries.

## CI and security

GitHub Actions are retained for code verification and security, not hosted mobile compilation. The repository includes:

- strict TypeScript typecheck
- ESLint
- unit tests
- Firebase Functions build/tests and Firestore Rules tests
- Supabase schema/Edge Function backend checks
- CodeQL
- dependency audits
- release-readiness checks

Backend deployment workflows are separate from compiling the mobile application.

## Migration work still open

- complete notification/lifecycle Supabase migration
- finish mobile service-import cutover
- verify the migrated backend on physical devices
- remove Firebase packages/Functions/rules/workflows only after the final cutover is proven
- reconcile or close migration PRs once a single verified cutover path is selected

## Release work still required

- real backend environment/project configuration
- production signing credentials
- APNs/FCM/Expo push configuration as applicable
- staging App Check/native attestation verification
- live AI/push smoke tests
- privacy/terms finalization
- icons/screenshots/store metadata
- TestFlight and Google Play internal/closed-track testing
- final security review

See `docs/PRODUCTION_RELEASE.md` for the release checklist and `docs/SUPABASE_SETUP.md` for the current Supabase setup.
