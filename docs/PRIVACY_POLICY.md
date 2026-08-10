# HomeStock Privacy Policy

> **Release blocker:** Replace `[EFFECTIVE_DATE]`, `[LEGAL_OPERATOR_NAME]`, `[CONTACT_EMAIL]`, and `[COUNTRY_OR_ADDRESS]` before publishing this policy or submitting HomeStock to an app store. This repository draft describes the current application architecture but is not a substitute for jurisdiction-specific legal review.

Effective date: `[EFFECTIVE_DATE]`

HomeStock ("HomeStock", "we", "us", or "our") is operated by `[LEGAL_OPERATOR_NAME]`, `[COUNTRY_OR_ADDRESS]`. You can contact us at `[CONTACT_EMAIL]`.

## 1. What HomeStock does

HomeStock helps people in the same household manage inventory, shopping, purchases, household-wide spending, budgets, shared-expense splitting ("Go Dutch"), repayments, price history, activity, notifications, and optional AI-assisted financial organization.

## 2. Information we process

### Account information

We process information used to create and operate your account, such as your email address, display name, authentication identifiers, household membership, role, and account preferences.

### Household inventory and shopping information

We process household-created information such as product names, categories, quantities, units, barcodes, shopping-list entries, low-stock thresholds, purchase prices, purchase dates, and stores.

### Household finance information

If you use Finance or Go Dutch features, we process household expense descriptions, merchants/payees, categories, dates, amounts, bill discounts, fees/tax, payer and participant assignments, per-person shares, outstanding balances, repayment/settlement records, monthly budgets, and related activity history.

HomeStock is designed for household expense management and is not intended to store bank-account credentials, payment-card numbers, authentication codes, or other financial-access credentials.

### Device and notification information

If you enable push notifications, we process an Expo push token, device platform, notification preference, and delivery status information needed to send and maintain household notifications.

### AI assistant information

If you intentionally use an AI feature, HomeStock sends the minimum information needed for that feature to the configured Groq AI service:

- **Category suggestion:** expense title, optional merchant, notes, and optional line descriptions.
- **AI bill assistant:** the receipt/bill text you explicitly submit plus temporary household-member aliases/display names used to suggest participants.
- **Household spending insights:** aggregated recent month totals, category totals, category-by-month totals, and household budget figures. The insight workflow is designed not to send individual member-level spending breakdowns.

The AI bill assistant produces a draft that you must review. AI output does not directly create final debts. Final discount, fee, share, and debt calculations are performed by deterministic HomeStock server code after you save a reviewed expense.

Do not include card numbers, bank-account credentials, passwords, authentication codes, government identifiers, health information, or other unnecessary sensitive information in AI prompts or bill text.

## 3. Why we process information

We process information to:

- authenticate users and maintain household access;
- synchronize inventory and shopping lists among household members;
- record purchases and price history;
- calculate household expenses, budgets, Go Dutch shares, discounts, fees, debts, and repayments;
- provide household activity and push notifications;
- provide AI features only when requested by the user;
- prevent abuse and enforce security controls and AI usage limits;
- diagnose failures and maintain the service.

## 4. How household sharing works

Household data is shared with authenticated members of the same household. Depending on the feature, household members may see inventory, shopping, purchases, finance records, shared balances, settlements, budgets, activity, and saved household AI insights.

Do not join a household or enter shared information unless you are comfortable making that information available to the household's members.

Owners and administrators can perform certain membership and household-management actions. A sole owner can permanently delete the household and its household-scoped data through the app.

## 5. Service providers

HomeStock relies on service providers needed to operate the application. The production deployment is expected to include:

- **Google Firebase / Google Cloud** for authentication, database storage, Cloud Functions, secrets, scheduling, and supporting infrastructure;
- **Expo** for application build/distribution tooling and push-notification delivery infrastructure;
- **Groq** for AI features that you explicitly invoke.

Each provider processes information under its own terms and privacy practices. Production configuration should use the most privacy-protective retention/settings appropriate for the service, including reviewing Groq's available data-retention controls before release.

## 6. AI and automated processing

AI features are assistive. HomeStock does not rely on AI output as the authoritative calculation for who owes money. AI category suggestions, bill extraction, spending observations, savings ideas, and budget suggestions can be incomplete or incorrect and should be reviewed by users.

HomeStock applies server-side usage limits to AI requests to reduce abuse and unexpected provider cost.

## 7. Data retention

Household records remain available while the household and relevant records exist, subject to product deletion and operational retention rules. A sole owner can permanently delete the household through Settings. The household-deletion flow removes the household document and its nested household data, including inventory, shopping records, purchases, household expenses, budgets, settlements, activity records, and saved AI insights.

HomeStock also provides in-app account deletion. Account deletion removes the Firebase Authentication account, the user's profile and notification-device records, AI quota state, and non-owner household memberships. A user who still owns a household must transfer ownership or delete that household before deleting the account.

Some shared household records may remain after an individual account is deleted when they are part of the remaining household's shared accounting or audit history, for example an expense or settlement involving other household members. This preserves the integrity of balances and historical records relied on by the remaining household members.

Some service providers may retain limited operational or security logs according to their own policies and configured retention settings. Production deployment must document the selected provider retention configuration.

## 8. Security

HomeStock uses household-scoped access control, Firebase Authentication, Firestore Security Rules, trusted Cloud Functions for privileged financial/membership writes, server-side secrets for the Groq API key, transaction-based money calculations, and automated tests for important authorization boundaries.

No internet service can guarantee absolute security. Users should protect their account credentials and household invite codes.

## 9. Your choices and rights

Depending on your location, applicable law may provide rights concerning access, correction, deletion, restriction, objection, portability, or complaints to a data-protection authority.

Within HomeStock you can disable push notifications, leave a household when permitted, permanently delete your account from Settings subject to the household-ownership guard, and—when you are the sole owner—permanently delete the household. For account/data requests that cannot be completed in-app, contact `[CONTACT_EMAIL]`.

## 10. Children's privacy

HomeStock is not designed for children to independently create or manage financial household accounts. Before release, `[LEGAL_OPERATOR_NAME]` must confirm and document the minimum permitted age and any jurisdiction-specific requirements.

## 11. International processing

Service providers may process data in countries other than the user's country. Before release, `[LEGAL_OPERATOR_NAME]` must confirm the applicable legal basis and safeguards for any required international transfers.

## 12. Changes to this policy

We may update this policy when HomeStock's functionality, providers, or legal requirements change. Material changes should be communicated through an appropriate product or store channel and the effective date updated.

## 13. Contact

Privacy questions or requests: `[CONTACT_EMAIL]`

Operator: `[LEGAL_OPERATOR_NAME]`

Address/country: `[COUNTRY_OR_ADDRESS]`
