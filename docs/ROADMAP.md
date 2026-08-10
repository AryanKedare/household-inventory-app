# Implementation Roadmap

This repository follows `docs/PRODUCT_REQUIREMENTS.md`, with security and transaction work moved forward so later UI phases do not rely on an unsafe data model. The scope also includes household-wide finance, budgeting, shared-expense settlement and optional AI-assisted financial organization.

## Implemented baseline

### Core household app

- Expo SDK 57 / React Native / strict TypeScript foundation
- development, preview and production EAS profiles
- Firebase Authentication with persisted sessions
- household create/join and invite regeneration
- owner/admin/member authorization and member administration
- ownership transfer and voluntary leave flows
- sole-owner recursive household deletion
- separate recent-auth account deletion with ownership guard
- household lifecycle/activity audit events
- inventory CRUD, quantity/status controls, search/filter/sort and barcode scanning
- shared shopping list and transactional purchase flow
- store/date/price capture, replenishment and price history
- dashboard and household activity feed
- per-device Expo push registration, ticket/receipt processing and invalid-token cleanup

### Finance / Go Dutch

- household-wide finance categories
- trusted shared-expense creation
- direct and itemized split modes
- exact-cent discount and fee allocation
- debt and repayment tracking
- transaction-safe partial/full settlements
- fail-closed stored debt-state validation
- current-user owes/is-owed balances
- owner/admin monthly and category budgets

### AI

- server-side Groq secret handling
- structured category suggestions
- review-first bill-text extraction
- aggregate household spending insights
- deterministic final money/debt calculations outside AI
- per-user AI daily quotas
- bounded Groq network requests

### Security / reliability / delivery

- Firestore tenant-isolation and backend-only privileged writes
- Cloud Functions emulator integration tests
- Firestore Security Rules tests
- concurrency tests for inventory, purchases and settlements
- deletion retry lock that survives partial recursive cleanup
- account/household deletion tests
- bounded Expo network requests and defensive provider-response parsing
- CodeQL and dependency-audit workflows
- critical dependency findings block CI; high findings remain visible for review
- current GitHub Action majors and Google Workload Identity Federation deployment
- Dependabot for npm, Functions and Actions
- production release-readiness workflow
- privacy/data-disclosure/production runbook documentation

## Still required before production release

### Repository hardening

- generate and commit root and `functions/` npm lockfiles, then move CI/deployment workflows from `npm install` to deterministic `npm ci`;
- add broader rate/abuse controls for non-AI invite/admin-sensitive callables;
- expand edge-case tests whenever callable/rule behavior changes;
- keep transitive Expo/Metro and Firebase/Google dependency advisories under review and remove exceptions when upstream-supported fixes are available.

### Firebase / platform security

- create/link real Firebase dev, staging and production projects;
- configure native App Check attestation in staging;
- prove valid App Check tokens on physical iOS and Android devices;
- enable `enforceAppCheck: true` for production callable Functions only after the staging proof;
- configure least-privilege Workload Identity Federation/IAM for production deploys;
- configure billing/budget alerts and Cloud Scheduler for the receipt processor.

### Finance and AI production setup

- configure the real Groq API secret in Firebase Secret Manager;
- choose/review the production Groq data-retention policy;
- run live staging category, bill and insight smoke tests;
- review provider outage/timeout UX on device;
- keep receipt-image OCR out of the production baseline until the text-assisted flow is stable.

### Resilience and UX

- explicit network/offline banner and retry/pending states;
- optimistic updates only where conflict-safe;
- richer loading/skeleton states;
- accessibility audit, screen-reader labels and dynamic text checks;
- dark-mode implementation;
- destructive-action confirmation review on real devices;
- physical camera/notification tests.

### Release operations

- link the real EAS project and add its project ID;
- configure APNs/FCM and iOS/Android signing credentials;
- finalize app icon, splash and store screenshots/assets;
- finalize/publish privacy policy and terms with real operator/contact details;
- complete Apple App Privacy and Google Play Data Safety forms;
- run TestFlight/internal iOS and Play internal/closed Android testing;
- perform final production security review;
- submit signed production builds only after the release checklist is green.

## Post-production / optional product scope

- custom inventory categories UI;
- multiple-household switching;
- expiry tracking;
- recipes;
- advanced analytics;
- widgets/voice integrations;
- receipt-image OCR after privacy, accuracy and operational review.
