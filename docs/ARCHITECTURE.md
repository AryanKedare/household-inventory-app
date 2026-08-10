# Architecture

## Principles

1. Firestore household data is tenant-scoped below `households/{householdId}`.
2. A signed-in user is not automatically authorized for a household.
3. Membership is proven by `households/{householdId}/members/{uid}`.
4. Privileged membership operations are callable Cloud Functions.
5. Money is stored in integer minor units (EUR cents), never floating-point database values.
6. Critical multi-document purchase flows are atomic/transactional.
7. Firestore Security Rules ship with each feature and are emulator-tested.
8. The client is never the only validation boundary for privileged writes.
9. Audit/history records that affect trust are backend-written.

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
  activities/{activityId}
  categories/{categoryId}

inviteCodes/{inviteCode}
```

The active shopping-list document uses the inventory item ID, which prevents multiple active
documents for the same inventory item. A purchased document can later be reactivated.

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

## Activity and notifications

Inventory/shopping Firestore triggers create structured activity documents. Purchase operations
create their activity inside the purchase transaction. An activity-create trigger builds selected
household notifications and sends them to enabled per-device Expo push tokens, excluding the actor
where possible.

Push delivery is intentionally downstream from the core transaction: a notification failure does not
roll back a successful household purchase/update.

## Security

Firestore rules currently:

- allow users to access only their own profile/device documents
- require household membership for household reads
- deny direct household/member role writes
- validate inventory quantity/status/price/audit ownership
- validate active shopping-list item structure and linked inventory existence
- deny client writes to purchases, price history and activities
- deny all client access to invite-code lookup documents

Before release, App Check must be configured and enabled for production callable functions.
