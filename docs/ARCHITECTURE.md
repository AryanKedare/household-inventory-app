# Architecture

## Principles

1. Firestore household data is tenant-scoped below `households/{householdId}`.
2. A signed-in user is not automatically authorized for a household.
3. Membership is proven by `households/{householdId}/members/{uid}`.
4. Privileged membership, finance and settlement operations are callable Cloud Functions.
5. Money is stored in integer minor units (EUR cents), never floating-point database values.
6. Critical multi-document purchase and shared-expense flows are atomic/transactional.
7. Firestore Security Rules ship with each feature and are emulator-tested.
8. The client is never the only validation boundary for privileged writes.
9. Audit/history records that affect trust are backend-written.
10. AI may classify, extract and explain financial data, but authoritative money allocation is deterministic server code.

## Mobile layers

```text
screens/components
      ↓
contexts/hooks
      ↓
feature/service functions
      ↓
Firebase client SDK / callable functions
```

UI components do not contain large Firestore queries or server transactions.

## Household bootstrap

```text
Firebase Auth user
      ↓
users/{uid}.defaultHouseholdId
      ↓
HouseholdContext
      ↓
No household → Household Setup
Has household → Main Tabs
```

`createHousehold` and `joinHousehold` are server-side callable functions so users cannot insert
themselves into arbitrary membership subcollections.

## Firestore layout

```text
users/{uid}
  devices/{deviceId}

households/{householdId}
  members/{uid}
  items/{itemId}
  shoppingList/{itemId}
  purchases/{purchaseId}
  priceHistory/{priceHistoryId}
  expenses/{expenseId}
  budgets/{yyyy-mm}
  aiInsights/{yyyy-mm}
  activities/{activityId}
  categories/{categoryId}

aiUsage/{uid}_{yyyy-mm-dd}
inviteCodes/{inviteCode}
pushReceipts/{expoTicketId}
```

The active shopping-list document uses the inventory item ID, which prevents multiple active
documents for the same inventory item. A purchased document can later be reactivated.

`pushReceipts` is backend-only transient delivery state. It maps an accepted Expo push ticket to the
Expo token and the current Firestore device-document paths that produced that token. Clients cannot
read or write this collection.

`aiUsage` is backend-only quota state used to bound provider cost and abuse. Household AI insight
records are member-readable but can only be written by trusted Cloud Functions.

## Purchase transaction

`purchaseShoppingListItem` performs one logical server transaction:

1. authenticate
2. validate household membership
3. validate request values
4. read the active shopping-list entry
5. read its linked inventory item
6. calculate new inventory quantity
7. calculate price delta and percentage
8. create purchase record
9. create price-history record only when the unit price changed
10. update inventory quantity/latest price/last store/status
11. mark shopping entry purchased
12. create structured activity event
13. commit atomically

Clients cannot directly write purchases, price history or activity records.

## Household finance and Go Dutch

Household finance is a separate domain from inventory. It covers groceries, dining out, rent/mortgage,
utilities, household supplies, commute/transport, fuel, public transport, electronics, furniture/home,
subscriptions, entertainment, health, insurance, childcare, travel, repairs, pets, shared personal
spending and other household costs.

`createHouseholdExpense` accepts exactly one of:

- per-person pre-discount subtotals, or
- itemized expense lines assigned to one or more household members.

The trusted backend then:

1. authenticates the actor
2. validates the payer and every participant inside the same Firestore transaction
3. calculates the pre-discount subtotal
4. allocates a bill-level discount proportionally by each participant's pre-discount spend
5. allocates bill-level tax/fees proportionally using the same weights
6. uses deterministic largest-remainder cent allocation with integer arithmetic
7. verifies every allocated cent reconciles exactly to the amount actually paid
8. creates per-person allocations and debts to the payer
9. writes the expense and activity atomically

The mobile client displays these allocations but cannot directly write expense/debt records. This
prevents a client or AI suggestion from changing who owes what without the trusted calculation path.

Monthly budgets live at `budgets/{yyyy-mm}` and can include an overall household limit plus optional
limits for any household finance category. Only owners/admins can change budgets through the trusted
callable; all household members can read them.

## Groq household AI

Groq integration runs only in Cloud Functions. The mobile app never receives the Groq API key. The
`GROQ_API_KEY` value is declared with Firebase Secret Manager and is bound only to AI callables.
The current text model is `openai/gpt-oss-20b` through Groq's OpenAI-compatible chat-completions API,
using strict JSON-schema structured output.

The AI layer has three responsibilities:

1. **Expense category suggestion** — the model chooses one category from the same fixed taxonomy used
   by the trusted finance backend. The user can override the suggestion before saving.
2. **Bill-text assistant** — free-form receipt/bill text is converted into a draft containing line
   descriptions, amounts, optional participant suggestions, bill-level discount/fees and a category.
   Household users are represented to the model using server-generated aliases; Firebase user IDs are
   mapped back only on the server. Ambiguous participant assignments remain unassigned and are flagged
   for review. The draft is never persisted as a real expense by the AI callable.
3. **Household spending insights** — the backend aggregates recent expenses into month/category totals
   and budget figures before sending data to Groq. Individual member spending breakdowns are not sent
   for the insight workflow. Saved insight text remains advisory.

Every AI path requires authenticated household membership and consumes a daily server-side quota.
Current per-user UTC-day limits are 40 category suggestions, 20 bill analyses and 5 household insight
generations. Quota state is inaccessible to clients.

### AI-to-money trust boundary

AI output cannot create or modify debts directly. A bill draft must be reviewed in the mobile UI and
is then submitted through `createHouseholdExpense`. The deterministic finance engine revalidates the
payer/participants and calculates line splitting, discounts, fees, exact cent rounding and final debts.
This means an inaccurate AI extraction can be corrected without allowing model output to become an
authoritative monetary calculation.

### AI data handling

The bill assistant sends only the bill text that the user explicitly submits plus the household member
aliases/display names required to make participant suggestions. The UI warns users not to submit
unnecessary sensitive information such as card or bank details.

The production Groq organization should be reviewed/configured for the desired data-retention policy,
including Zero Data Retention if required. The application privacy policy must disclose that submitted
AI-assistant text is processed by an external AI provider. The Groq secret must never be stored in
Expo public environment variables, the mobile bundle or Firestore.

## Activity and notifications

Inventory/shopping Firestore triggers create structured activity documents. Purchase and household
expense operations create their activity inside their trusted transaction. An activity-create trigger
builds selected household notifications and sends them to enabled per-device Expo push tokens,
excluding the actor where possible.

Accepted Expo push tickets are stored in `pushReceipts/{expoTicketId}`. A scheduled Cloud Function
checks due receipts after the delivery window. Successful receipts are removed. A
`DeviceNotRegistered` ticket or receipt disables only device documents that still contain the same
Expo token, preventing an old receipt from disabling a newly rotated token. Other final delivery
errors are logged and removed from the queue. Receipt requests that fail at the service/network level
leave queued tickets intact for a later scheduled attempt.

Push delivery is intentionally downstream from the core transaction: a notification failure does not
roll back a successful household purchase/update.

## Security

Firestore rules currently:

- allow users to access only their own profile/device documents
- require household membership for household reads
- deny direct household/member role writes
- validate inventory quantity/status/price/audit ownership
- validate active shopping-list item structure and linked inventory existence
- deny client writes to purchases, price history, household expenses, budgets, AI insights and activities
- deny outsiders access to household finance and AI insight records
- deny all client access to AI usage/quota documents
- deny all client access to invite-code lookup documents
- deny all client access to Expo push-receipt queue documents

Before release, App Check must be configured and enabled for production callable functions.
