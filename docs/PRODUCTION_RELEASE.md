# Production Release

HomeStock production releases are built **locally** from bare React Native native projects. Expo/EAS and Firebase are not part of the release path.

## 1. Repository gate

Run:

```bash
npm install
npm run verify
```

Run the `Production Release Readiness` GitHub workflow and the Supabase schema workflow. Both must pass for the release commit.

## 2. Supabase production checks

Before building:

- link the Supabase CLI to the intended production project;
- review pending migrations;
- apply migrations through the approved deployment process;
- verify RLS is enabled and policies match household tenancy requirements;
- configure Edge Function secrets such as the AI provider key;
- deploy the required Edge Functions;
- verify Auth email/redirect settings;
- smoke-test household creation/joining, inventory, shopping, purchases and finance using non-production test accounts where appropriate.

Do not place the Supabase service-role key or AI provider credentials in the mobile `.env` file.

## 3. First native setup

If the checkout does not yet contain generated native projects:

```bash
npm run native:bootstrap
```

The bootstrap creates standard React Native iOS/Android projects using application identifier:

```text
com.aryankedare.householdinventory
```

After generation, native files can be maintained directly in Xcode/Gradle. Do not run Expo prebuild.

## 4. iOS release

Requirements:

- macOS
- current compatible Xcode
- Apple Developer account/team
- CocoaPods

Install dependencies:

```bash
npm install
npm run pods
```

Open the generated `.xcworkspace` in Xcode. Then:

1. select the HomeStock target;
2. configure Signing & Capabilities with the production Apple team;
3. verify bundle identifier and version/build number;
4. build on at least one physical iPhone;
5. test authentication, camera/barcode scanning and Supabase data flows;
6. select a generic iOS device and use Product → Archive;
7. validate the archive;
8. upload through Xcode/App Store Connect.

Command-line Release compilation can also be exercised with:

```bash
npm run ios:release
```

## 5. Android release

Requirements:

- Android Studio / Android SDK
- supported JDK
- production signing keystore

Verify a local build:

```bash
npm install
npm run android
npm run android:release
```

Before store upload, configure release signing in the generated Gradle project using secrets that are not committed to Git.

Produce the required signed Android App Bundle with Gradle/Android Studio and upload it to Google Play Console.

## 6. Physical-device acceptance checks

Test at minimum:

- sign up, sign in, sign out and session restoration;
- create and join a household;
- household membership/admin actions;
- add/edit/delete inventory;
- barcode scanning on real hardware;
- quantity and shopping-list flows;
- purchase recording and price history;
- expense creation, bill splitting, debts, repayments and budgets;
- AI functions where enabled;
- account deletion;
- loss/recovery of network connectivity;
- unauthorized cross-household access attempts.

Remote background push notifications are not part of the current release baseline. Supabase Realtime updates data while the app is active.

## 7. Store and legal checks

Ensure:

- privacy policy and terms contain final operator/contact details;
- App Store privacy labels and Google Play Data Safety answers match actual data handling;
- camera permission description accurately explains barcode scanning;
- screenshots/listing copy do not claim unavailable push-notification behavior;
- version/build numbers are unique;
- production Supabase project, not a local/staging project, is configured in the release `.env`.

## 8. Go/no-go

Release only when repository checks, Supabase backend checks, signed local builds and physical-device acceptance testing all pass.
