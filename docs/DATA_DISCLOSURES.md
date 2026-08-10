# HomeStock Data Disclosure Mapping

This document is an implementation-based worksheet for completing Apple App Privacy and Google Play Data Safety forms. Store-console wording/categories can change, so the final answers must be checked against the live forms at submission time.

## General principles

- Do not claim that HomeStock collects less data than the deployed production build actually processes.
- Do not disclose data as being used for advertising or tracking unless that functionality is intentionally added later.
- Keep production analytics/crash-reporting disclosures synchronized with any SDKs actually added before release.
- Groq AI processing occurs only when the user intentionally invokes an AI feature.
- AI bill text should not contain unnecessary sensitive credentials or identifiers.

## Data inventory

| Data / content | Why HomeStock processes it | Shared with household members? | External service processing | User control |
|---|---|---|---|---|
| Email address | Authentication/account | May be visible to household members in membership UI | Firebase Authentication | In-app account deletion; sign out |
| Display name | Account/household identity | Yes | Firebase/Firestore | In-app account deletion |
| Household membership/role | Authorization and sharing | Yes | Firebase/Firestore/Functions | Leave/remove/transfer/delete flows; account deletion for non-owner memberships |
| Household invite code | Joining household | Shared intentionally by user | Firebase/Firestore/Functions | Admin can regenerate |
| Inventory/product names | Household inventory | Yes | Firebase/Firestore | Edit/delete; household deletion |
| Barcode | Item lookup/entry | Yes | Firebase/Firestore | Edit/delete; household deletion |
| Quantity/unit/category | Inventory state | Yes | Firebase/Firestore | Edit/delete; household deletion |
| Shopping-list entries | Shared shopping | Yes | Firebase/Firestore | Add/remove/purchase; household deletion |
| Purchase store/date/price | Purchase/price history | Yes | Firebase/Firestore/Functions | Household deletion |
| Household expense title/merchant/category/date | Finance tracking | Yes | Firebase/Firestore/Functions | Household deletion |
| Expense amounts/discounts/fees | Budget and split calculation | Yes | Firebase/Firestore/Functions | Household deletion |
| Payer/participant assignments | Go Dutch calculation | Yes | Firebase/Firestore/Functions | Household deletion |
| Debt/repayment/settlement records | Go Dutch balances/audit | Yes | Firebase/Firestore/Functions | Household deletion |
| Household budgets | Budget tracking | Yes | Firebase/Firestore/Functions | Admin edits; household deletion |
| Device platform / Expo push token | Push notifications | No ordinary UI sharing | Firebase + Expo push service | Disable notifications; account deletion |
| Push delivery receipts/errors | Delivery maintenance | No | Firebase/Cloud Functions + Expo | Backend retention/cleanup |
| Camera image stream | Barcode scanning | Not stored by current barcode flow | Processed on-device by camera/scanner path | Camera permission |
| AI category request text | Optional category suggestion | Result may be visible via saved expense if user saves | Firebase Functions + Groq | Only sent on explicit AI action |
| AI bill text | Optional bill draft extraction | Reviewed result can become household expense only after user saves | Firebase Functions + Groq | Explicit submit; user edits/rejects draft |
| AI member aliases/display names | Optional bill participant suggestion | Household identities already shared within household | Firebase Functions + Groq during bill request | Only during explicit AI bill request |
| Aggregate month/category/budget totals | Optional household AI insights | Saved insight visible to household members | Firebase Functions + Groq | Explicit Generate/Refresh; household deletion |
| AI usage quota counters | Abuse/cost control | No | Firebase/Firestore/Functions | Backend-only; account deletion |

## Apple App Privacy worksheet

Review the current App Store Connect definitions when submitting. Based on the current implementation, likely categories to evaluate include:

### Contact info

- Email address: used for authentication/account operation.
- Name/display name: used for account and household member identity.

### User content

- Household inventory and shopping content entered by users.
- Bill/receipt text intentionally submitted to the AI assistant.
- Expense notes and line descriptions.

### Purchases / financial information

HomeStock does not process payment-card credentials or move money. It does process user-entered household purchase/expense amounts, shared balances and budgets. The final store classification should be selected based on Apple's current definition of financial information/purchases at submission time.

### Identifiers

- Firebase account/user identifier.
- Household membership identifiers.
- Expo push token/device record used for notifications.

### Usage / diagnostics

Do not select analytics/diagnostic categories unless a production analytics/crash-reporting SDK is actually configured before release. Revisit this worksheet if Crashlytics, Sentry, analytics or similar tooling is added.

### Tracking

The current HomeStock design does not intentionally use data for cross-app/site advertising tracking. Do not make a final "not used for tracking" declaration until all production SDKs are reviewed.

## Google Play Data Safety worksheet

Review the current Google Play Console definitions when submitting.

Likely areas to evaluate:

- account management: email/display name/auth identifier;
- app functionality: inventory, shopping, household content, budgets, expenses and shared balances;
- communications/app functionality: push token for household notifications;
- optional AI functionality: bill text/category request/aggregate spending data processed through Groq;
- security/fraud prevention: backend authorization, App Check when enabled, quotas/rate controls and delivery/security logs.

For each Play Console data type, verify whether it is:

1. collected by the app/backend;
2. shared with a service provider under the store definition;
3. required or optional;
4. used for app functionality, account management, security/fraud prevention, personalization, analytics, advertising, or other purposes;
5. encrypted in transit;
6. deletable through in-app account deletion, household deletion, or an appropriate account/data request process depending on whether the record is personal or shared household history.

## Groq AI disclosure checklist

Before production submission:

- [ ] Groq production project/organization selected
- [ ] production data-retention setting reviewed
- [ ] Zero Data Retention confirmed if the public policy says it is enabled
- [ ] Groq API key stored only in Firebase Secret Manager
- [ ] key absent from Expo public variables, app bundle and Firestore
- [ ] staging category suggestion live test passed
- [ ] staging bill assistant live test passed
- [ ] staging aggregate insight live test passed
- [ ] AI failure/outage UX reviewed
- [ ] user-facing AI privacy notice matches production behavior
- [ ] public privacy policy accurately describes Groq processing

## Camera disclosure

Current camera usage is for barcode scanning. The app should request camera permission only when scanning is used and should describe that purpose in the platform permission text/configuration.

If receipt-image OCR is added later, update:

- privacy policy;
- app privacy/data safety forms;
- camera/photo permission messaging;
- AI provider disclosure;
- retention/storage documentation.

## Deletion disclosure

HomeStock now implements two separate deletion paths:

- **Household deletion:** available only to the sole household owner and recursively removes household-scoped records, including inventory, shopping, purchases, expenses, budgets, settlements, activity and saved AI insights, while clearing the owner's default household and active invite.
- **Account deletion:** available in Settings and requires recent authentication. It removes the Firebase Authentication account, personal profile/device records, AI quota state, and non-owner household memberships. A user who still owns a household must transfer ownership or delete that household first.

Shared household accounting history can remain after an individual member deletes their account because remaining household members still rely on that shared financial/audit history. The public privacy policy and store disclosures must state this accurately.

## Final review before store submission

Re-run this worksheet against:

- `package.json` production dependencies;
- Firebase production services actually enabled;
- Expo push configuration;
- Groq production configuration;
- any analytics/crash-reporting SDKs;
- final privacy policy;
- live App Store Connect / Google Play Console forms.
