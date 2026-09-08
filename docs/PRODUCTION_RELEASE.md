# HomeStock Production Release Runbook

HomeStock mobile binaries are compiled locally. Hosted services such as Firebase, Supabase, Groq and Expo Push Service may still be used at runtime, but EAS Build/EAS Submit are not required for compiling or distributing the application.

## 1. Release blockers

Do not publish until all of the following are complete:

- finalize the privacy policy and terms placeholders;
- finish and verify the Firebase-to-Supabase migration strategy;
- configure the real backend projects used by the release;
- configure production iOS/Android signing credentials;
- configure APNs/FCM/Expo push credentials if push notifications are enabled;
- configure the production Groq secret and review provider data controls;
- complete real-device iOS and Android testing;
- complete App Store Connect and Google Play Console metadata/assets;
- pass repository CI/security/release checks on the exact release commit.

## 2. Backend environments

During the migration, never point an ordinary development build at production data unintentionally.

For any Firebase environment still in use:

```bash
firebase use <environment-alias>
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

For Supabase setup/migrations, follow `docs/SUPABASE_SETUP.md`.

## 3. Secrets

Never put backend secrets in the mobile bundle.

Examples that must remain server-side:

- `GROQ_API_KEY`
- Supabase secret/service-role keys
- Firebase service-account credentials
- signing private keys
- APNs/FCM private credentials

Only values intentionally safe for client use should use `EXPO_PUBLIC_*` variables.

## 4. App Check and backend security

Do not enable production Firebase App Check enforcement until local signed staging builds on physical devices are proven to obtain valid attestation tokens.

Before release verify:

- household isolation rules/RLS;
- privileged membership and finance operations remain server-side;
- concurrency tests pass;
- account/household deletion behavior is verified;
- production secrets are not committed;
- backend rules/migrations match the reviewed release commit.

## 5. Local native builds

Install dependencies first:

```bash
npm install
npm --prefix functions install
```

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

Android requires a correctly installed local Android SDK/toolchain and signing configuration. iOS requires macOS, Xcode and Apple signing configuration.

The Expo CLI can generate/update the native projects locally with:

```bash
npm run prebuild
```

If Expo Push Service is used, configure any required Expo project metadata and notification credentials separately. That runtime service does not require using EAS Build for compilation.

## 6. Verification before building

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run functions:build
npm run test:functions
npm run test:rules
```

Also run the repository's production release-readiness workflow against the exact release commit.

## 7. Physical-device test matrix

Use at least two real household accounts on separate devices and verify:

### Authentication and household

- sign up/sign in/sign out;
- create/join household;
- invite regeneration;
- owner/admin/member permissions;
- ownership transfer, leave and member removal;
- account and household deletion guards.

### Inventory and shopping

- add/edit/delete inventory;
- barcode scan existing/new items;
- concurrent quantity updates;
- low/out-of-stock state;
- shared shopping list changes;
- concurrent purchase attempts;
- purchase and price history.

### Finance

- direct and itemized splits;
- discounts/fees and awkward-cent rounding;
- owed/owing balances;
- partial/full repayments;
- concurrent repayment attempts;
- monthly/category budgets.

### AI and notifications

- category suggestion and manual override;
- bill extraction/review workflow;
- spending insights;
- quota/provider failure behavior;
- notification permission denial;
- foreground/background push delivery;
- invalid push-token cleanup.

### Resilience

- connection loss during writes;
- repeated submissions;
- backend outage behavior;
- camera permission denial/re-enable;
- app restart with persisted authentication where supported.

## 8. Store submission

After local signed production binaries pass testing:

- iOS: archive/sign with Xcode and upload through Xcode/Transporter/App Store Connect as appropriate;
- Android: generate the signed release artifact locally and upload it to Google Play Console;
- complete privacy/data-safety declarations, screenshots, descriptions, review notes and release controls in each store console.

Submitting a binary is not the same as publishing it.

## 9. Final go/no-go

Release only when all answers are YES:

- [ ] exact release commit is green in CI/security checks
- [ ] backend configuration matches the release
- [ ] migration state is understood and verified
- [ ] production secrets are configured server-side
- [ ] App Check/RLS/security rules are validated as applicable
- [ ] APNs/FCM/push tests pass if notifications are enabled
- [ ] two-device concurrency scenarios pass
- [ ] account/household deletion tests pass
- [ ] privacy policy and terms are finalized
- [ ] Apple privacy and Google Play Data Safety forms are complete
- [ ] icons/screenshots/store copy are final
- [ ] locally compiled signed iOS build passes testing
- [ ] locally compiled signed Android build passes testing
- [ ] final production security review is complete
