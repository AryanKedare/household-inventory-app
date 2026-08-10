# Implementation Roadmap

This repository follows `docs/PRODUCT_REQUIREMENTS.md`, with security and transaction work moved
forward so later UI phases do not rely on an unsafe data model. The product scope now also includes
household-wide finance, budgeting, shared-expense settlement and AI-assisted financial analysis.

## Implemented in the current build

- Expo SDK 57 / React Native / strict TypeScript foundation
- development, preview and production EAS profiles
- Firebase environment/bootstrap and Local Emulator Suite configuration
- Firebase Authentication: signup, login, persisted session, logout and user profile
- secure household create/join callable functions
- owner/admin/member model
- invite-code regeneration
- owner-only promote/demote member flow
- admin/owner member removal rules
- owner-to-member ownership transfer with previous owner retained as admin
- voluntary household leave flow for admins/members with default-household cleanup
- lifecycle activity events for ownership transfers and voluntary leaves
- live household/member settings UI
- household-scoped inventory CRUD
- search, category/status filtering and sorting
- quantity controls, low-stock/out-of-stock status derivation
- mark-finished + add-to-shopping transaction
- shared shopping list with duplicate-document prevention
- category-grouped shopping UI and estimated total
- trusted `purchaseShoppingListItem` Cloud Function transaction
- purchase store, quantity, unit price, total price, and editable purchase date capture
- inventory replenishment after purchase
- price change calculation/history
- purchase and price history UI
- barcode scanning and barcode lookup/create flow
- activity event generation and activity feed
- Expo notification token registration per device
- backend household push fan-out from activity events
- Expo push ticket persistence, scheduled receipt checks, and `DeviceNotRegistered` token cleanup
- live dashboard inventory/shopping/monthly-spend/store/price insights
- household-wide finance categories beyond groceries
- trusted shared-expense creation with payer/participant membership validation
- deterministic Go Dutch split engine for direct subtotals and itemized shared lines
- proportional bill-level discount and fee/tax allocation with exact cent reconciliation
- per-expense debts showing who owes the payer and how much
- owner/admin monthly household budgets with optional category limits
- Finance tab with monthly spend, budget status, category totals, recent expenses and personal debt visibility
- Firestore tenant-isolation/security rules including backend-only finance writes
- emulator security-rule tests
- Cloud Functions emulator integration coverage for ownership transfer and leave
- Cloud Functions emulator integration coverage for household create/join/purchase, repeat-purchase rejection, and outsider denial
- Cloud Functions emulator integration coverage for finance splits, outsider participants and budget permissions
- GitHub Actions verification workflow

## Still required before production release

### Finance and AI

- settlement/repayment recording so debts can be marked partially or fully paid
- Groq-backed expense categorization and household spending insights
- AI bill assistant for pasted receipt/bill text with user review before saving
- optional receipt image OCR after the text-assisted flow is stable
- AI response caching/rate controls and privacy/data-retention configuration

### Hardening

- add dedicated Cloud Function tests for remaining callable/admin/transaction branches
- add concurrency tests for two users purchasing/updating the same item
- extend Firestore rule tests to every allowed/denied field mutation
- enable Firebase App Check and set `enforceAppCheck: true` in production
- add rate/abuse controls to invite, finance, AI and administrative callables
- decide and implement explicit household deletion semantics for a sole owner who wants to remove the household

### Resilience and UX

- explicit network/offline banner and retry states
- optimistic updates only where conflict-safe
- richer loading/skeleton states
- accessibility labels/audits and dynamic text checks
- dark-mode theme implementation (setting/model exists but UI theme is currently light)
- destructive-action confirmation audit
- device tests for camera and notifications

### Product completion

- optional custom inventory categories UI
- optional multiple-household switching
- expiry tracking/recipes/advanced analytics/widgets only after the production baseline is stable

### Release

- create/link Firebase dev/staging/prod projects
- create/link EAS project and inject generated project ID
- configure Groq API secret and production data-retention controls
- configure APNs and FCM credentials
- deploy the scheduled Expo receipt processor with Cloud Scheduler available in the Firebase project
- add final icon/splash assets
- privacy policy and terms
- App Store privacy disclosures / Google Play Data Safety
- internal/TestFlight/closed-track builds
- production security review
- App Store and Google Play submission
