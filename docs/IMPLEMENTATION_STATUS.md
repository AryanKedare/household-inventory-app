# HomeStock Implementation Status

Updated: 11 August 2026

## Implemented in the current codebase

### Application foundation

- Expo SDK 57 / React Native / strict TypeScript project foundation
- Firebase Auth client with React Native session persistence
- development, preview and production EAS profiles
- Firebase Emulator Suite configuration for local/CI verification
- GitHub Actions CI, security scanning, Firebase deployment, EAS build/submit and release-readiness workflows

### Household lifecycle and authorization

- household creation and invite-code joining through callable Cloud Functions
- owner/admin/member authorization model
- member administration and invite regeneration
- ownership transfer from the current owner to another member; previous owner becomes admin
- voluntary household leave for admins/members with automatic `defaultHouseholdId` cleanup
- sole-owner permanent household deletion with active-invite removal and recursive household cleanup
- deletion lock ownership so an interrupted recursive delete can be retried safely even if child membership documents were already removed
- separate in-app account deletion requiring recent authentication
- account deletion blocks users who still own a household, removes personal profile/device/quota/membership data, deletes Firebase Authentication identity and preserves shared household accounting history required by remaining members
- lifecycle/audit events for joins, leaves, ownership transfer, purchases, expenses and settlements

### Inventory, shopping and purchases

- household-scoped inventory CRUD
- search, category/status filtering and sorting
- transactional quantity adjustments with low/out-of-stock status derivation
- mark-finished + add-to-shopping transaction
- shared shopping list with deterministic item IDs and duplicate prevention
- barcode scan flow for existing and new items
- transactional purchase flow recording store, quantity, unit price, editable purchase date and total price
- inventory replenishment, price change calculation/history and activity generation
- concurrency coverage for simultaneous inventory updates and simultaneous purchase attempts

### Household finance / Go Dutch

- household-wide expense categories
- trusted shared-expense creation with direct per-person or itemized splits
- deterministic proportional discount/fee allocation with exact cent reconciliation
- per-expense debt records
- partial/full repayment recording by debtor or payee
- transaction-safe settlement updates and immutable settlement records
- fail-closed validation of stored debt state: corrupted `settledCents` values are rejected instead of silently resetting/reopening a debt
- Finance balance view showing what the current user owes/is owed
- monthly household budget and per-category limits controlled by owner/admin roles
- concurrency coverage for racing repayments

### AI

- Groq client isolated to Cloud Functions with `GROQ_API_KEY` in Firebase Secret Manager
- expense-category suggestions with strict structured output
- bill-text assistant producing a reviewable draft; deterministic HomeStock code performs the final money/debt calculations
- household spending insights generated from aggregate month/category/budget totals
- per-user daily quotas for AI category, bill and insight requests
- member-readable/backend-write-only AI insights and backend-only quota state
- bounded Groq outbound requests so a stalled provider cannot hold a function open indefinitely

### Notifications

- per-device Expo notification registration
- household notification fan-out from activity events
- actor exclusion where intended
- Expo push-ticket persistence and scheduled receipt processing
- automatic disabling of `DeviceNotRegistered` tokens guarded against token rotation
- bounded Expo send/receipt network requests and defensive response parsing
- backend-only Firestore receipt queue

### Security and CI hardening

- household-scoped Firestore Security Rules with privileged finance, settlement, lifecycle, AI and audit writes restricted to trusted backend code
- Auth + Firestore + Cloud Functions emulator integration coverage
- Firestore Rules emulator coverage
- CodeQL scanning
- npm production-dependency audits that surface high findings and block critical findings
- current Node-24-backed GitHub Action majors for checkout/setup tooling and CodeQL v4
- Google Cloud deployment through Workload Identity Federation rather than committed service-account credentials
- generated `gha-creds-*.json` credentials ignored by Git
- Dependabot configuration for root npm, Functions npm and GitHub Actions updates
- production release gate checks for App Check enforcement, legal placeholders, real Firebase/EAS configuration and accidental Groq secret exposure

## Verification covered by CI

The CI pipeline verifies:

- strict TypeScript typecheck
- ESLint
- unit tests
- Cloud Functions TypeScript build
- Auth + Firestore + Cloud Functions emulator integration tests
- Firestore Security Rules emulator tests

The integration suites cover, among other cases:

- invalid invite rejection and household create/join/rejoin flows
- ownership transfer, leave and ownerless-household prevention
- sole-owner household deletion and blocked deletion while another member remains
- interrupted household deletion retry authorization and prevention of deletion-lock takeover
- account deletion for non-owners and owner deletion guard
- transactional purchases, repeat-purchase rejection and non-member denial
- simultaneous inventory updates and simultaneous purchase protection
- direct/itemized finance splits, discounts, fees and exact cent reconciliation
- outsider participant denial and budget permissions
- partial/full settlement, racing settlement attempts, overpayment/already-settled rejection and outsider denial
- rejection of corrupted stored settlement state rather than silently changing financial history
- Firestore tenant isolation and backend-only write boundaries

CI intentionally does not call the live Groq or Expo/APNs/FCM services. Those require staging credentials and physical-device smoke tests.

## Known dependency posture

The security workflow currently reports high and moderate transitive findings rather than hiding them:

- the mobile Expo/Metro toolchain currently resolves vulnerable `image-size` versions; npm's forced remediation proposes a breaking downgrade outside the supported Expo/React Native stack, so the finding remains visible while upstream remediation is monitored;
- moderate `uuid` findings are currently transitive through Expo/Google/Firebase dependency chains; direct Firebase Admin/Functions dependencies should stay on supported current releases rather than being force-downgraded;
- any future **critical** production dependency finding fails the Security workflow.

Do not use `npm audit fix --force` as an unattended production remediation. Review dependency-tree and framework compatibility first.

## Repository hardening still required

- Generate and commit `package-lock.json` for both the repository root and `functions/`, then switch CI/deploy installs from `npm install` to `npm ci`. The current environment did not provide a reliable way to generate trustworthy lockfiles, so they were not fabricated by hand.
- Add/expand rate and abuse controls for non-AI sensitive callables such as invite and administrative operations. AI endpoints already have daily quotas.
- Enable Firebase App Check only after valid native iOS/Android attestation has been proven on staging devices, then set production callable Functions to `enforceAppCheck: true`.
- Continue expanding branch-level callable/rules tests as new behavior is added.

## External setup still required

- choose/create real Firebase development, staging and production projects and replace placeholder project IDs;
- enable/configure Firebase Authentication, Firestore, Functions, Scheduler and App Check for those environments;
- link the Expo/EAS project and add the real EAS project ID;
- configure APNs/FCM and production signing credentials;
- set the Groq production secret in Firebase Secret Manager and review production retention controls;
- perform staging live-AI, push-notification and physical-device smoke tests;
- finalize legal operator/contact/effective-date placeholders and publish privacy/terms URLs;
- provide final app icon, splash and store assets;
- complete TestFlight / Play internal-or-closed-track verification and store submissions.

## Product/UX work that is not a security release blocker

- richer offline/network retry UX
- broader accessibility/device QA and dynamic text checks
- dark-mode UI implementation
- optional custom inventory-category UI
- optional multiple-household switching
- expiry/recipes/advanced analytics/widgets only after the production baseline is stable
