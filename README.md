# HomeStock

HomeStock is a cross-platform iOS/Android household inventory and shared shopping-list app. Household
members can track what is at home, mark items finished, share what needs buying, scan product
barcodes, record purchases/stores, see price movement, and receive household updates.

The product baseline is in `docs/PRODUCT_REQUIREMENTS.md`. Engineering decisions and security changes
are documented in `docs/ARCHITECTURE.md`.

## Current implementation

The repository now includes a working MVP code path for:

- email/password signup, login, persisted auth and logout
- secure household creation and invite-code joining
- owner/admin/member household administration
- live inventory CRUD, search, filter and sort
- quantity stepper, low-stock and out-of-stock logic
- shared shopping list with category grouping and estimated total
- atomic purchase completion with quantity, store and actual unit price
- purchase history and price-change history
- barcode scan → find existing item / prefill new item
- household activity feed
- dashboard inventory/shopping/monthly-spending/store/price insights
- per-device Expo notification registration and backend push fan-out
- Firestore tenant/security rules and emulator rule tests
- Firebase emulators, Cloud Functions, EAS profiles and GitHub Actions CI

This is **not yet a production release**. Native dependency installation, Firebase/EAS project linking,
full emulator/device tests, App Check, release credentials/assets and store submission still need to
be completed in a connected development environment.

## Stack

- Expo SDK 57
- React Native 0.86
- React 19.2
- TypeScript 6 strict mode
- React Navigation 7
- Firebase Authentication
- Cloud Firestore
- Cloud Functions for Firebase (2nd gen / Node.js 22)
- Firebase Local Emulator Suite
- Expo Camera
- Expo Notifications
- React Hook Form + Zod
- EAS Build

## Install

```bash
npm install
npm --prefix functions install
```

## Firebase

Create three Firebase projects (recommended):

- `household-app-dev`
- `household-app-staging`
- `household-app-prod`

If those IDs are unavailable, change `.firebaserc`.

In the development project enable:

- Authentication → Email/Password
- Cloud Firestore
- Cloud Functions

Create a Firebase Web App, then:

```bash
cp .env.example .env
```

Fill the Firebase values in `.env`. Never commit `.env`, service-account keys, APNs credentials or
other private secrets.

## Local Firebase emulators

```bash
npm run emulators
```

With:

```text
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true
```

Ports:

- Auth `9099`
- Firestore `8080`
- Functions `5001`
- Emulator UI `4000`

For a physical device on the same LAN, set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to the development
machine's LAN IP.

## Start mobile app

```bash
npm start
```

For camera-only testing, Expo Go may be sufficient. For remote push notification testing use an Expo
development build.

## EAS development build

After installing/logging into EAS CLI:

```bash
eas init
eas build --profile development --platform ios
eas build --profile development --platform android
```

`eas init` writes/links the EAS project ID used by Expo Push Tokens. Do not invent that UUID manually.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run functions:build
npm run test:rules
```

The GitHub Actions workflow runs the same core checks plus the Firestore emulator rules suite.

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
  activities/{activityId}
  categories/{categoryId}

inviteCodes/{inviteCode}
```

## Important backend operations

Callable Functions:

- `createHousehold`
- `joinHousehold`
- `purchaseShoppingListItem`
- `regenerateInviteCode`
- `removeHouseholdMember`
- `changeHouseholdMemberRole`

Firestore triggers build activity events and selected push notifications.

## Next work

See `docs/ROADMAP.md`. The immediate priority is dependency-aware build/test verification in a normal
networked development environment, followed by callable integration tests, App Check, resilience,
accessibility/device QA and release preparation.
