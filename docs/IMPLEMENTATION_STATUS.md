# HomeStock Implementation Status

Updated: 10 August 2026

## Implemented in the initial codebase

- Expo SDK 57 / React Native / strict TypeScript project foundation
- Firebase Auth client with React Native session persistence
- Household creation and invite-code joining through callable Cloud Functions
- Owner/admin/member authorization model
- Household member administration and invite regeneration through Cloud Functions
- Firestore household-scoped data model, rules, indexes, and emulator rule tests
- Inventory create/edit/delete, search, category/status filtering, sorting, quantity controls, low-stock/out-of-stock logic
- Barcode scan flow for existing and new inventory items
- Shared shopping list with deterministic item IDs, quantity edits, category grouping, estimated total, and duplicate prevention
- Transactional purchase flow that records store, quantity, unit price, total price, inventory replenishment, price changes, history, and activity
- Dashboard inventory/shopping/monthly-spend/store/price-change insights
- Item purchase and price history
- Household activity feed
- Per-device Expo notification registration plus backend household notification fan-out
- GitHub Actions workflow for install, typecheck, lint, unit tests, functions build, and Firestore rules tests
- EAS build profiles and development/preview/production configuration scaffolding

## Verification completed in this environment

- JSON configuration files parse successfully
- No TypeScript parser-level errors were found in source files
- Pure money/status business-logic assertions execute successfully
- No TODO/FIXME/console.log markers remain in application, functions, or tests

## Verification blocked by this runtime

The runtime could not complete npm package installation because registry/network access timed out. Therefore the following must still run in a normal development/CI environment before the baseline is considered green:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run functions:build
npm run test:rules
```

## External setup still required

- Create/choose the Firebase dev, staging, and production projects and replace placeholder project IDs.
- Enable Firebase Email/Password Authentication.
- Deploy Firestore rules/indexes and Cloud Functions after local emulator verification.
- Link the app to an Expo/EAS project (`eas init`) so an EAS project ID is written into app configuration.
- Configure iOS/Android push credentials for production notifications.
- Create the GitHub remote repository and push the local `main` branch.

## Remaining MVP/product hardening

- Editable purchase date in the purchase sheet
- Owner transfer / household leave workflow
- App Check enablement and enforcement before production
- Push receipt processing and invalid-token cleanup
- Deeper Cloud Functions integration tests and concurrency tests
- Offline UX and retry/pending-state polish
- Accessibility/device QA, store assets, privacy policy/data-safety disclosures, TestFlight/Play closed testing
