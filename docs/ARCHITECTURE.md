# Architecture

## Platform

HomeStock is a **bare React Native** application built with React Native Community CLI. It does not depend on Expo or Firebase.

```text
React Native iOS / Android app
        |
        +-- Supabase Auth
        +-- Supabase Postgres + RLS
        +-- Supabase Realtime
        +-- Supabase Edge Functions
        +-- VisionCamera barcode scanning
```

Native projects are generated once with `npm run native:bootstrap` and then built locally with Xcode or Gradle.

## Mobile layers

```text
screens/components
      ↓
contexts/hooks
      ↓
services/supabase
      ↓
Supabase Auth / Postgres / Realtime / Edge Functions
```

The mobile application contains only the Supabase project URL and publishable client key. Service-role keys and AI provider credentials never belong in the app bundle.

## Authentication and household tenancy

Supabase Auth owns user identity. Application profiles reference `auth.users`. Every household-owned row includes a household identifier and access is constrained by Row Level Security and server-side RPC/Edge Function checks.

A valid authenticated session does not by itself grant access to arbitrary household data; membership must exist in `household_members`.

## Data and transactional rules

- Money is stored in integer euro cents.
- Privileged household, inventory, shopping and finance operations are performed through hardened SQL RPCs or Edge Functions when client-only mutation would be unsafe.
- RLS is the primary database authorization boundary.
- Realtime subscriptions refresh household state while the application is active.
- Purchase, debt and settlement calculations remain deterministic server-side logic.
- AI may classify, extract and summarize, but it is not authoritative for final monetary allocation.

## Barcode scanning

Barcode scanning uses native VisionCamera packages. Camera permission is added to generated Android and iOS projects by the native bootstrap script.

No barcode image is required to be uploaded to Supabase merely to read the barcode; scanning occurs through the native camera component.

## Notifications

The previous Expo/Firebase remote push transport has been removed. HomeStock currently uses Supabase Realtime for in-app household updates. Remote background push can be added later through a deliberately selected native push provider without reintroducing Expo or Firebase.

## AI

AI requests go through authenticated Supabase Edge Functions. Provider secrets remain server-side in Supabase secrets. Daily quota accounting is enforced through a service-role-only database function.

## Native builds

### iOS

- macOS + Xcode
- CocoaPods
- `npm run pods`
- `npm run ios`
- Xcode handles signing, capabilities and App Store archives

### Android

- Android Studio / Android SDK
- supported JDK
- `npm run android`
- Gradle handles local release builds and signing

No EAS build or submission service is required.
