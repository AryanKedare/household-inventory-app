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
- Transactional purchase flow that records store, quantity, unit price, editable purchase date, total price, inventory replenishment, price changes, history, and activity
- Dashboard inventory/shopping/monthly-spend/store/price-change insights
- Item purchase and price history
- Household activity feed
- Household-wide finance categories for groceries, dining out, housing, utilities, transport, electronics and other shared spending
- Trusted shared-expense creation with per-person or itemized splits
- Deterministic proportional discount and fee allocation with exact cent reconciliation
- Per-expense debt records describing who owes the payer
- Monthly household budget and per-category limits managed by owner/admin roles
- Finance screen with monthly spend, budget remaining/overage, category totals, discounts and personal debt visibility
- Per-device Expo notification registration plus backend household notification fan-out
- Expo push-ticket persistence and scheduled push-receipt processing
- Automatic disabling of device records when Expo reports `DeviceNotRegistered`, guarded against token rotation
- Backend-only Firestore receipt queue with explicit Security Rules coverage
- GitHub Actions workflow for install, typecheck, lint, unit tests, Functions build, Cloud Functions emulator integration tests, and Firestore rules tests
- EAS build profiles and development/preview/production configuration scaffolding

## Verification completed in GitHub Actions

The CI pipeline has successfully completed:

- mobile dependency installation
- Cloud Functions dependency installation
- strict TypeScript typecheck
- ESLint
- unit tests
- Cloud Functions TypeScript build
- Auth + Firestore + Cloud Functions emulator integration tests
- Firestore Security Rules emulator tests

The lifecycle integration suite verifies that an owner cannot leave an ownerless household, ownership can be transferred atomically, the previous owner becomes an admin, the new owner is promoted, the previous owner can then leave, their default household is cleared, and lifecycle activity records are created.

The core callable integration suite verifies invalid invite rejection, household creation, invite joining, repeat joining, owner/member/default-household records, transactional purchase, inventory replenishment, purchase and price history, repeat-purchase rejection, and non-member purchase denial.

The finance test suites verify direct and itemized shared expenses, exact proportional discount allocation, fee allocation, cent rounding, large-value integer arithmetic, outsider participant rejection, owner/admin budget permissions, and Firestore tenant/write isolation. The supplied five-person restaurant example (€15, €10, €21, €53, €67 with a €20 discount) reconciles exactly to €146 after discount.

Purchase date input has unit coverage for stable `YYYY-MM-DD` formatting/parsing and rejects malformed or impossible calendar dates before the request reaches the backend.

Push receipt handling compiles as part of the Cloud Functions build, loads successfully in the Functions emulator suite, and has Firestore rule coverage proving signed-in clients cannot access the backend receipt queue.

## External setup still required

- Create/choose the Firebase dev, staging, and production projects and replace placeholder project IDs.
- Enable Firebase Email/Password Authentication.
- Deploy Firestore rules/indexes and Cloud Functions after environment provisioning.
- Ensure the Firebase production project can deploy the scheduled receipt processor through Cloud Scheduler.
- Link the app to an Expo/EAS project (`eas init`) so an EAS project ID is written into app configuration.
- Configure iOS/Android push credentials for production notifications.
- Create/configure a Groq API key in Firebase Secret Manager before enabling AI functions.

## Remaining production work

- Groq AI categorization, household spending insights and bill assistant
- Expense repayment/settlement recording
- Explicit delete-household flow for a sole owner who wants to remove the household entirely
- App Check enablement and enforcement before production
- Concurrency coverage for simultaneous purchase/inventory/finance updates
- Rate and abuse controls for sensitive callables
- Broader Cloud Functions and Firestore rule branch coverage
- Offline UX and retry/pending-state polish
- Dark mode and accessibility/device QA
- Store assets, privacy policy/data-safety disclosures, TestFlight/Play closed testing and production submission
