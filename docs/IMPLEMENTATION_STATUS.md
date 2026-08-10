# HomeStock Implementation Status

Updated: 10 August 2026

## Implemented in the current codebase

- Expo SDK 57 / React Native / strict TypeScript project foundation
- Firebase Auth client with React Native session persistence
- Household creation and invite-code joining through callable Cloud Functions
- Owner/admin/member authorization model
- Household member administration and invite regeneration through Cloud Functions
- Ownership transfer from the current owner to another member; the previous owner remains an admin
- Voluntary household leave for admins/members with automatic `defaultHouseholdId` cleanup
- Household lifecycle activity events for ownership transfer and voluntary leave
- Firestore household-scoped data model, rules, indexes, and emulator rule tests
- Inventory create/edit/delete, search, category/status filtering, sorting, quantity controls, low-stock/out-of-stock logic
- Barcode scan flow for existing and new inventory items
- Shared shopping list with deterministic item IDs, quantity edits, category grouping, estimated total, and duplicate prevention
- Transactional purchase flow that records store, quantity, unit price, total price, inventory replenishment, price changes, history, and activity
- Dashboard inventory/shopping/monthly-spend/store/price-change insights
- Item purchase and price history
- Household activity feed
- Per-device Expo notification registration plus backend household notification fan-out
- GitHub Actions workflow for install, typecheck, lint, unit tests, Functions build, Cloud Functions emulator integration tests, and Firestore rules tests
- EAS build profiles and development/preview/production configuration scaffolding

## Verification completed in GitHub Actions

The CI pipeline has successfully completed the following checks on the household lifecycle implementation:

- mobile dependency installation
- Cloud Functions dependency installation
- strict TypeScript typecheck
- ESLint
- unit tests
- Cloud Functions TypeScript build
- Auth + Firestore + Cloud Functions emulator integration test for ownership transfer and leave
- Firestore Security Rules emulator tests

The lifecycle integration test verifies that an owner cannot leave an ownerless household, ownership can be transferred atomically, the previous owner becomes an admin, the new owner is promoted, the previous owner can then leave, their default household is cleared, and lifecycle activity records are created.

## External setup still required

- Create/choose the Firebase dev, staging, and production projects and replace placeholder project IDs.
- Enable Firebase Email/Password Authentication.
- Deploy Firestore rules/indexes and Cloud Functions after environment provisioning.
- Link the app to an Expo/EAS project (`eas init`) so an EAS project ID is written into app configuration.
- Configure iOS/Android push credentials for production notifications.

## Remaining MVP/product hardening

- Editable purchase date in the purchase sheet
- Explicit delete-household flow for a sole owner who wants to remove the household entirely
- App Check enablement and enforcement before production
- Push receipt processing and invalid-token cleanup
- Integration coverage for create/join/purchase and concurrency-sensitive flows
- Broader Cloud Functions and Firestore rule branch coverage
- Offline UX and retry/pending-state polish
- Accessibility/device QA, store assets, privacy policy/data-safety disclosures, TestFlight/Play closed testing
