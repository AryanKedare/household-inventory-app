# HomeStock Production Release Runbook

This document separates repository-complete work from account/credential work that must be performed in the real Firebase, Expo, Apple, Google Play, and Groq accounts before public release.

## 1. Release blockers that require operator input

Do not submit a public build until all of these are resolved:

- replace `[LEGAL_OPERATOR_NAME]`, `[CONTACT_EMAIL]`, `[COUNTRY_OR_ADDRESS]`, and effective dates in `docs/PRIVACY_POLICY.md` and `docs/TERMS_OF_USE.md`;
- choose the real Firebase development, staging, and production project IDs;
- link the Expo/EAS project and write the generated EAS project ID into app configuration;
- provide production iOS/Android signing and push-notification credentials;
- create the production Groq API key and select/review the required Groq retention policy;
- confirm Apple App Store Connect and Google Play Console application records exist;
- complete real-device testing and staging AI/push smoke tests.

## 2. Environment model

Use three isolated Firebase environments:

```text
development -> local/dev testing
staging     -> real-device/TestFlight/closed-track verification
production  -> public App Store / Google Play release
```

Never point development builds at the production Firestore project.

The repository currently contains placeholder Firebase aliases. Replace them with real projects before deployment.

## 3. Firebase project setup

For each environment:

1. Create/select the Firebase project.
2. Enable Email/Password Authentication.
3. Create the required iOS and Android Firebase applications using the production bundle/package identifiers where appropriate.
4. Configure Firestore.
5. Configure Cloud Functions in `europe-west1` unless the architecture is intentionally changed.
6. Ensure Cloud Scheduler can be used for the Expo push-receipt processor.
7. Configure App Check before production enforcement.
8. Configure budget/billing alerts in Google Cloud appropriate to the expected usage.

Deploy rules/indexes/functions only after the relevant branch is green in CI.

Typical deployment sequence after selecting the correct Firebase alias:

```bash
firebase use <environment-alias>
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

Verify the selected project before every production deploy.

## 4. Groq AI secret

The mobile application must never contain the Groq API key.

Set the server-side Firebase secret in each environment that should support AI:

```bash
firebase use <environment-alias>
firebase functions:secrets:set GROQ_API_KEY
```

After deploying the AI Functions, perform a staging smoke test for:

- expense category suggestion;
- bill-text extraction;
- household insight generation;
- daily AI quota behavior;
- provider/network failure handling.

Review the Groq organization/project data controls before public release and document the selected retention policy in the public privacy policy. If Zero Data Retention is required for the deployment, confirm it is actually enabled for the production organization/project before claiming it.

## 5. App Check

Production callable Functions should not be switched to `enforceAppCheck: true` until the shipped iOS and Android clients are proven to obtain valid App Check tokens on physical devices.

Because HomeStock currently uses the Firebase JavaScript SDK inside Expo/React Native, the final native attestation integration must be validated in staging before enforcement. The production plan must provide platform-native attestation (for example, the appropriate Apple and Android App Check providers) and confirm that callable requests carry valid tokens.

Safe rollout:

1. implement/configure the native App Check provider in a development build;
2. verify valid App Check requests in staging on physical iOS and Android devices;
3. monitor rejected/invalid requests;
4. enable enforcement for production callable Functions;
5. repeat production smoke tests after enforcement.

Never enable enforcement first and hope the client integration works afterward; that would make valid production calls fail.

## 6. Expo/EAS project

Link the repository to the real EAS project:

```bash
eas login
eas init
```

Confirm the generated EAS project ID is present in app configuration and that development, preview, and production profiles point at the intended environment configuration.

Validate:

```bash
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

Install preview builds on physical devices before production builds.

## 7. Push notifications

Before release:

- configure APNs credentials for iOS;
- configure FCM credentials for Android;
- enable notifications on physical devices;
- verify foreground/background receipt;
- verify household actor exclusion where intended;
- verify `DeviceNotRegistered` tokens become disabled after Expo ticket/receipt processing;
- verify the scheduled receipt processor is deployed and executing.

The application must continue to complete the underlying household action if push delivery fails.

## 8. Staging test matrix

Use at least two real household accounts on separate physical devices.

### Authentication and household

- sign up / sign in / sign out;
- create household;
- join via invite code;
- regenerate invite;
- owner/admin/member permissions;
- ownership transfer;
- leave household;
- remove member;
- sole-owner permanent household deletion;
- non-owner in-app account deletion;
- owner account deletion blocked until ownership is transferred or the owned household is deleted;
- account deletion removes login/profile/device/membership data while preserving shared household accounting history required by remaining members.

### Inventory and shopping

- add/edit/delete inventory;
- barcode scan existing/new item;
- simultaneous quantity updates from two devices;
- low-stock/out-of-stock status;
- add/remove/reactivate shopping item;
- simultaneous purchase attempt from two devices;
- purchase replenishment and price history.

### Household finance / Go Dutch

- groceries and non-grocery household categories;
- direct per-person split;
- itemized/shared-line split;
- bill-level discount;
- tax/service/delivery fees;
- exact rounding on awkward cent totals;
- current user's owed/owing balances;
- partial repayment;
- full repayment;
- racing repayment attempts;
- monthly overall budget;
- category budgets.

### AI

- manual category suggestion;
- incorrect category overridden by user;
- bill text with named individual items;
- shared item;
- ambiguous participant remains review-required;
- AI-missed line manually added;
- hallucinated/incorrect line removed;
- bill total mismatch warning;
- saved reviewed bill produces deterministic debts;
- aggregate household insights;
- quota exhaustion;
- Groq outage/failure UX.

### Resilience

- offline launch with cached/authenticated state where supported;
- connection loss during save;
- repeated tap/submission attempts;
- Firebase Functions unavailable;
- notification permission denied;
- camera permission denied and later enabled.

## 9. Security release checks

Before public release:

- CI green on the exact production release commit;
- no secrets committed to Git;
- Groq secret only in Secret Manager;
- production Firestore rules deployed from the reviewed commit;
- all privileged membership/finance/settlement writes server-side;
- App Check verified and enforced for production callables;
- rate/abuse limits verified for sensitive endpoints;
- concurrency tests passing;
- household isolation tests passing;
- household recursive deletion tested against realistic household data;
- account deletion and ownership guard tested against realistic household data;
- dependency/security findings reviewed rather than blindly force-upgraded.

## 10. Privacy and store disclosures

Before submission:

- publish the final privacy policy at a stable public URL;
- publish the final terms at a stable public URL if used in the product/store listing;
- disclose account/contact data, household content, purchase/finance data, device/push data, and AI-provider processing accurately in Apple privacy disclosures and Google Play Data Safety;
- disclose the distinction between in-app account deletion and household deletion, including retained shared household financial/audit history where applicable;
- disclose the purpose of camera access (barcode scanning and any future receipt-image feature);
- disclose push-notification usage;
- ensure screenshots and store copy describe AI as assistive, not guaranteed financial advice;
- confirm the minimum user age and jurisdiction-specific consumer/privacy requirements.

## 11. Store assets

Required production brand assets remain an operator/design task unless final approved assets are already supplied:

- app icon;
- splash/launch artwork;
- App Store screenshots;
- Google Play screenshots/feature artwork as required;
- store description, support URL, privacy URL, and marketing URL if used.

Do not ship placeholder assets.

## 12. Production builds and submission

After staging sign-off:

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

Then submit the reviewed signed binaries using EAS Submit or the relevant store tooling configured for the operator accounts.

Submitting a binary is not the same as publishing it. Complete App Store Connect / Play Console metadata, privacy/data-safety forms, age/content declarations, screenshots, review notes, and release controls in the relevant store consoles.

## 13. Final go/no-go

Release only when all answers are YES:

- [ ] exact release commit is green in CI
- [ ] staging Firebase deploy matches the release commit
- [ ] production Firebase project IDs are correct
- [ ] Groq staging smoke test passed
- [ ] production Groq retention configuration reviewed
- [ ] App Check validated on physical iOS and Android devices
- [ ] App Check enforcement enabled for production callables
- [ ] APNs/FCM push tests passed
- [ ] two-device concurrency scenarios passed
- [ ] household deletion passed with realistic data
- [ ] account deletion passed with realistic member/owner scenarios
- [ ] privacy policy finalized/published
- [ ] terms finalized/published if applicable
- [ ] Apple privacy disclosures completed
- [ ] Google Play Data Safety completed
- [ ] final icon/splash/screenshots approved
- [ ] TestFlight/internal iOS test passed
- [ ] Play closed/internal Android test passed
- [ ] production security review completed
- [ ] final signed production binaries approved
