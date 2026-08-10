# HomeStock

HomeStock is a cross-platform iOS/Android household inventory, shopping and shared-household finance app. Household members can track what is at home, share what needs buying, scan product barcodes, record purchases and price changes, manage household expenses/budgets, split shared bills, record repayments and receive household updates.

The product baseline is in `docs/PRODUCT_REQUIREMENTS.md`. Architecture and release controls are documented in `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/SECURITY_REVIEW_2026-08-11.md` and `docs/PRODUCTION_RELEASE.md`.

## Current implementation

### Household and account lifecycle

- email/password signup/login, persisted auth and logout
- secure household creation and invite-code joining
- owner/admin/member household administration
- invite regeneration, role changes and member removal
- ownership transfer and voluntary household leave
- sole-owner recursive household deletion
- separate recent-auth in-app account deletion with household-owner guard
- lifecycle/activity audit records

### Inventory, shopping and purchases

- household-scoped inventory CRUD, search/filter/sort and quantity controls
- low-stock/out-of-stock status
- barcode scan → existing item or prefilled new item
- shared shopping list with duplicate prevention and estimated total
- transactional purchase completion with quantity, store, unit price and editable purchase date
- inventory replenishment, purchase history and price-change history
- concurrency-safe quantity and purchase operations
- dashboard and household activity feed

### Household Finance / Go Dutch

- household expense categories
- direct per-person and itemized shared-expense entry
- deterministic discount/fee allocation with exact-cent reconciliation
- debts showing who owes whom
- partial/full repayment recording by debtor or payee
- transaction-safe settlement state and immutable repayment records
- current-user owes/is-owed view
- owner/admin monthly and per-category budgets

### Optional AI assistance

- Groq API key stored only as a Firebase Functions secret
- structured expense-category suggestions
- review-first bill-text extraction
- aggregate household spending insights
- deterministic HomeStock code performs final financial calculations
- daily per-user AI quotas
- bounded provider request timeouts

### Notifications and security

- per-device Expo push registration
- household notification fan-out and Expo ticket/receipt processing
- invalid push-token cleanup
- household-scoped Firestore Security Rules
- privileged finance/lifecycle/history/AI/audit writes restricted to trusted backend code
- Cloud Functions emulator integration tests and Firestore Rules tests
- concurrency regression tests
- CodeQL and npm dependency-audit workflows
- Dependabot for npm/Functions/GitHub Actions
- Workload Identity Federation deployment workflow for Google Cloud/Firebase
- production release-readiness gate

HomeStock is **not yet a public production release**. The remaining blockers are primarily real Firebase/EAS/App Check/provider/store configuration, physical-device verification, legal placeholders and store assets. See `docs/PRODUCTION_RELEASE.md` for the go/no-go checklist.

## Stack

- Expo SDK 57
- React Native 0.86
- React 19.2
- TypeScript strict mode
- React Navigation 7
- Firebase Authentication
- Cloud Firestore
- Cloud Functions for Firebase (2nd gen / Node.js 22)
- Firebase Local Emulator Suite
- Expo Camera
- Expo Notifications
- React Hook Form + Zod
- EAS Build
- Groq API from server-side Cloud Functions only

## Install

```bash
npm install
npm --prefix functions install
```

> Repository hardening note: root and Functions npm lockfiles still need to be generated from the committed manifests in a normal npm-connected development environment. Once committed, CI/deploy installs should switch to `npm ci`. Do not hand-author lockfiles.

## Firebase configuration

The checked-in `.firebaserc` currently contains placeholder development/staging/production aliases. Replace them with real Firebase project IDs before deployment.

For each required environment configure at minimum:

- Authentication → Email/Password
- Cloud Firestore
- Cloud Functions
- Cloud Scheduler for scheduled Expo receipt processing
- App Check as described in the production runbook

Create the client Firebase app configuration, then:

```bash
cp .env.example .env
```

Fill the Firebase values in `.env`. Never commit `.env`, service-account keys, Groq API keys, Expo tokens, APNs/FCM credentials, signing credentials or generated Google auth credential files.

## Local Firebase emulators

```bash
npm run emulators
```

With:

```text
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true
```

Default ports:

- Auth `9099`
- Firestore `8080`
- Functions `5001`
- Emulator UI `4000`

For a physical device on the same LAN, set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to the development machine's LAN IP.

## Start mobile app

```bash
npm start
```

For remote push notification testing use an Expo development build rather than relying on Expo Go.

## EAS development build

After installing/logging into EAS CLI:

```bash
eas init
eas build --profile development --platform ios
eas build --profile development --platform android
```

`eas init` links the real EAS project and writes the project ID used by Expo services. Do not invent that UUID manually.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run functions:build
npm run test:functions
npm run test:rules
```

GitHub CI executes the full application/backend verification. The Security workflow separately runs CodeQL and production dependency audits.

## Key data layout

```text
users/{userId}
  devices/{deviceId}

households/{householdId}
  members/{userId}
  items/{itemId}
  shoppingList/{itemId}
  purchases/{purchaseId}
  priceHistory/{priceHistoryId}
  expenses/{expenseId}
  settlements/{settlementId}
  budgets/{period}
  aiInsights/{period}
  activities/{activityId}
  categories/{categoryId}

inviteCodes/{inviteCode}
aiUsage/{userId_day}
pushReceipts/{expoTicketId}
```

## Important callable Functions

Household/inventory:

- `createHousehold`
- `joinHousehold`
- `regenerateInviteCode`
- `removeHouseholdMember`
- `changeHouseholdMemberRole`
- `transferHouseholdOwnership`
- `leaveHousehold`
- `deleteHousehold`
- `deleteAccount`
- `adjustInventoryQuantity`
- `purchaseShoppingListItem`

Finance/AI:

- `createHouseholdExpense`
- `upsertMonthlyBudget`
- `recordExpenseSettlement`
- `suggestExpenseCategory`
- `analyzeHouseholdBillText`
- `generateHouseholdAiInsights`

Firestore/scheduled triggers create activity notifications and process Expo push receipts.

## Security notes

- Do not turn on production App Check enforcement until real staging iOS/Android builds have proven valid attestation tokens; the release gate intentionally blocks production while callables contain `enforceAppCheck: false`.
- Do not use `npm audit fix --force` just to silence transitive framework advisories.
- Do not add client-side direct writes for collections intentionally marked backend-only in Firestore Rules.
- Money is represented as integer cents and sensitive concurrent mutations use server-side transactions.

See `SECURITY.md` for vulnerability reporting and `docs/SECURITY_REVIEW_2026-08-11.md` for the current review findings.

## Next work

See `docs/ROADMAP.md`. The next release-oriented priorities are npm lockfile reproducibility, non-AI abuse/rate controls, real Firebase/EAS provisioning, staging App Check, live provider/device smoke testing, accessibility/device QA and store release preparation.
