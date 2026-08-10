# Household Inventory & Shopping List App — Phased Development Plan

## App Overview

Build a cross-platform mobile app for iPhone and Android where people living in the same household can manage household items, track available quantity, add finished items to a shared shopping list, receive notifications, and track purchase prices and stores.

The app should be built gradually in phases, not all at once.

Recommended stack:

- Mobile app: React Native with Expo
- Backend: Firebase
- Database: Firestore
- Authentication: Firebase Auth
- Push notifications: Firebase Cloud Messaging / Expo Notifications
- Server logic: Firebase Cloud Functions

The app should be clean, modern, simple to use, and designed for household users.

---

# Phase 1: Project Setup and Base App Structure

## Goal

Create the basic app foundation with navigation, folder structure, Firebase setup, and reusable UI components.

## Tasks

1. Create a React Native Expo project.
2. Set up TypeScript.
3. Install required dependencies:
   - React Navigation
   - Firebase SDK
   - Expo Barcode Scanner or Camera
   - Expo Notifications
   - Form validation library
   - Date utility library
4. Create Firebase project.
5. Connect Firebase to the app.
6. Set up Firestore.
7. Set up Firebase Authentication.
8. Set up basic navigation structure.
9. Create reusable UI components.

## Required Folder Structure

```
src/
  components/
    AppButton.tsx
    AppInput.tsx
    AppCard.tsx
    ItemCard.tsx
    ShoppingListCard.tsx
    CategoryChip.tsx
    QuantityControl.tsx
    EmptyState.tsx
    LoadingState.tsx

  screens/
    LoginScreen.tsx
    SignupScreen.tsx
    HouseholdSetupScreen.tsx
    DashboardScreen.tsx
    InventoryScreen.tsx
    AddEditItemScreen.tsx
    BarcodeScannerScreen.tsx
    ShoppingListScreen.tsx
    ItemDetailsScreen.tsx
    MembersScreen.tsx
    SettingsScreen.tsx

  services/
    firebase.ts
    authService.ts
    householdService.ts
    itemService.ts
    shoppingListService.ts
    purchaseService.ts
    notificationService.ts

  hooks/
    useAuth.ts
    useHousehold.ts
    useItems.ts
    useShoppingList.ts
    usePurchases.ts

  navigation/
    AppNavigator.tsx
    AuthNavigator.tsx

  types/
    User.ts
    Household.ts
    Item.ts
    ShoppingListItem.ts
    Category.ts
    Purchase.ts
    PriceHistory.ts
    ActivityLog.ts

  utils/
    currency.ts
    dates.ts
    validation.ts
    inviteCode.ts

```

## Screens to Create in This Phase

Create placeholder screens only:

1. Login Screen
2. Signup Screen
3. Household Setup Screen
4. Dashboard Screen
5. Inventory Screen
6. Add/Edit Item Screen
7. Barcode Scanner Screen
8. Shopping List Screen
9. Item Details Screen
10. Household Members Screen
11. Settings Screen

## Phase 1 Completion Criteria

Phase 1 is complete when:

- The app runs on iPhone and Android.
- Firebase is connected.
- Navigation works.
- Placeholder screens are visible.
- Basic reusable components are created.

---

# Phase 2: Authentication

## Goal

Allow users to create an account, log in, log out, and store their profile in Firestore.

## Tasks

1. Implement Firebase email/password signup.
2. Implement Firebase email/password login.
3. Create user document after signup.
4. Add logout functionality.
5. Persist user session.
6. Redirect authenticated users to the app.
7. Redirect unauthenticated users to login/signup screens.

## User Data Model

```
{
  "userId": "string",
  "name": "string",
  "email": "string",
  "photoUrl": "",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}

```

## Required Screens

### Login Screen

Fields:

- Email
- Password

Actions:

- Login
- Go to Signup

### Signup Screen

Fields:

- Name
- Email
- Password
- Confirm Password

Actions:

- Create account
- Go to Login

## Phase 2 Completion Criteria

Phase 2 is complete when:

- User can sign up.
- User can log in.
- User document is created in Firestore.
- User stays logged in after app restart.
- User can log out.

---

# Phase 3: Household Creation and Joining

## Goal

Allow users to create a household or join an existing household using an invite code.

## Tasks

1. Create household creation flow.
2. Generate unique household invite code.
3. Save household to Firestore.
4. Add creator as household admin.
5. Allow another user to join household using invite code.
6. Store household members in Firestore.
7. Load current household after login.
8. Add basic household switching support if user belongs to more than one household.

## Household Data Model

```
{
  "householdId": "string",
  "name": "Apartment B307",
  "inviteCode": "B307XY",
  "createdBy": "userId",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}

```

## Household Member Data Model

```
{
  "userId": "string",
  "name": "string",
  "email": "string",
  "role": "admin",
  "joinedAt": "timestamp"
}

```

Roles:

```
admin
member

```

## Required Screens

### Household Setup Screen

Options:

- Create household
- Join household

Create household fields:

- Household name

Join household fields:

- Invite code

## Phase 3 Completion Criteria

Phase 3 is complete when:

- User can create a household.
- User can join a household using invite code.
- Household members are stored correctly.
- User can only see data for their own household.
- Household admin/member roles exist.

---

# Phase 4: Inventory Management

## Goal

Allow household members to add, view, edit, and delete household items.

## Tasks

1. Create item data model.
2. Add item manually.
3. View all household items.
4. Edit item details.
5. Delete item.
6. Add search by item name.
7. Add filter by category.
8. Add filter by status.
9. Add sorting by name, category, quantity, and price.
10. Show empty state when no items exist.

## Item Data Model

```
{
  "itemId": "string",
  "householdId": "string",
  "name": "Milk",
  "category": "Dairy",
  "quantity": 2,
  "unit": "litres",
  "price": 2.50,
  "currency": "EUR",
  "status": "available",
  "barcode": "",
  "lastPurchasedFrom": "",
  "lastPurchaseDate": null,
  "lastPurchasePrice": null,
  "previousPurchasePrice": null,
  "priceChangeAmount": 0,
  "priceChangePercentage": 0,
  "addedBy": "userId",
  "updatedBy": "userId",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}

```

## Item Status Values

```
available
low_stock
out_of_stock
shopping_list
purchased

```

## Default Categories

```
Dairy
Vegetables
Fruits
Meat
Frozen
Snacks
Drinks
Cleaning
Bathroom
Kitchen
Medicine
Other

```

## Required Screens

### Inventory Screen

Show:

- Search bar
- Category filter
- Status filter
- Item list

Each item card should show:

- Item name
- Category
- Quantity
- Unit
- Price
- Status

### Add/Edit Item Screen

Fields:

- Item name
- Category
- Quantity
- Unit
- Price
- Currency
- Barcode
- Status

## Phase 4 Completion Criteria

Phase 4 is complete when:

- User can add items.
- User can view inventory.
- User can edit items.
- User can delete items.
- User can search, filter, and sort items.
- Items are scoped to the correct household.

---

# Phase 5: Quantity Controls and Out-of-Stock Logic

## Goal

Allow users to increase/decrease item quantity and mark items as finished.

## Tasks

1. Add quantity increase button.
2. Add quantity decrease button.
3. Add set exact quantity option.
4. Prevent quantity from going below zero.
5. Add “Mark as Finished” button.
6. Automatically set status to `out_of_stock` when quantity is zero.
7. Ask user whether to add item to shopping list when quantity reaches zero.
8. Add activity log entry when item quantity changes.
9. Add activity log entry when item is marked as finished.

## Required Actions

Each item should support:

```
Increase quantity
Decrease quantity
Set exact quantity
Mark as finished
Add to shopping list

```

## Activity Log Example

```
{
  "activityId": "string",
  "householdId": "string",
  "type": "quantity_updated",
  "itemId": "string",
  "itemName": "Milk",
  "performedBy": "userId",
  "message": "Milk quantity was updated.",
  "createdAt": "timestamp"
}

```

## Phase 5 Completion Criteria

Phase 5 is complete when:

- Quantity controls work.
- Quantity cannot go below zero.
- Item can be marked as finished.
- Out-of-stock status updates correctly.
- Important actions are saved in activity log.

---

# Phase 6: Shared Shopping List

## Goal

Create a household shopping list from items that are finished or need to be bought.

## Tasks

1. Create shopping list data model.
2. Add item to shopping list.
3. Prevent duplicate active shopping list entries.
4. Show all active shopping list items.
5. Allow editing quantity needed.
6. Allow editing estimated price.
7. Allow removing item from shopping list.
8. Allow grouping shopping list by category.
9. Show estimated total cost.
10. Add checkbox system for purchased items.

## Shopping List Item Data Model

```
{
  "shoppingListItemId": "string",
  "householdId": "string",
  "itemId": "string",
  "name": "Milk",
  "category": "Dairy",
  "quantityNeeded": 2,
  "unit": "litres",
  "estimatedPrice": 2.50,
  "currency": "EUR",
  "addedBy": "userId",
  "isPurchased": false,
  "createdAt": "timestamp",
  "purchasedBy": null,
  "purchasedAt": null,
  "archived": false
}

```

## Shopping List Screen

Show:

- Active shopping list items
- Category grouping
- Estimated total
- Checkbox to mark purchased
- Edit quantity needed
- Edit estimated price
- Remove item

## Phase 6 Completion Criteria

Phase 6 is complete when:

- User can add items to shopping list.
- Duplicate active shopping list entries are avoided.
- Shopping list is shared across household members.
- Estimated total is calculated.
- User can remove items from the list.

---

# Phase 7: Purchase Flow, Store Tracking, and Price Tracking

## Goal

When a shopping list item is marked as purchased, capture purchase details, store name, actual price, and price changes.

## Tasks

1. Create purchase data model.
2. Create price history data model.
3. When user marks an item as purchased, open purchase modal.
4. Ask for quantity purchased.
5. Ask for actual price paid.
6. Ask where the product was purchased from.
7. Ask for purchase date, defaulting to today.
8. Save purchase record.
9. Compare new purchase price with previous item price.
10. If price changed, save price history record.
11. Update item inventory quantity.
12. Update item latest price.
13. Update item last purchased store.
14. Archive shopping list item.
15. Add activity log entry.

## Purchase Data Model

```
{
  "purchaseId": "string",
  "householdId": "string",
  "itemId": "string",
  "itemName": "Milk",
  "storeName": "Tesco",
  "quantityPurchased": 2,
  "unit": "litres",
  "pricePaid": 2.75,
  "currency": "EUR",
  "purchasedBy": "userId",
  "purchasedAt": "timestamp",
  "createdAt": "timestamp"
}

```

## Price History Data Model

```
{
  "priceHistoryId": "string",
  "householdId": "string",
  "itemId": "string",
  "itemName": "Milk",
  "storeName": "Tesco",
  "oldPrice": 2.50,
  "newPrice": 2.75,
  "priceDifference": 0.25,
  "percentageChange": 10,
  "currency": "EUR",
  "changedBy": "userId",
  "createdAt": "timestamp"
}

```

## Purchase Modal Fields

When marking an item as purchased, show a modal with:

```
Quantity bought
Actual price paid
Store name
Purchase date

```

## Price Change Logic

```
If new price > old price:
Show "Price increased by €0.25"

If new price < old price:
Show "Price decreased by €0.25"

If new price == old price:
Show "No price change"

```

## Item Update After Purchase

After purchase, update item with:

```
{
  "quantity": "existing quantity + quantity purchased",
  "price": "latest purchase price",
  "lastPurchasedFrom": "store name",
  "lastPurchaseDate": "purchase date",
  "lastPurchasePrice": "actual price paid",
  "previousPurchasePrice": "old price",
  "priceChangeAmount": "new price - old price",
  "priceChangePercentage": "percentage change",
  "status": "available",
  "updatedAt": "timestamp"
}

```

## Activity Log Example

```
{
  "activityId": "string",
  "householdId": "string",
  "type": "item_purchased",
  "itemId": "string",
  "itemName": "Milk",
  "performedBy": "userId",
  "message": "Milk was purchased from Tesco for €2.75.",
  "createdAt": "timestamp"
}

```

## Phase 7 Completion Criteria

Phase 7 is complete when:

- User can mark shopping list item as purchased.
- User can enter store name.
- User can enter actual price.
- Purchase record is saved.
- Price changes are detected.
- Price history is saved.
- Inventory quantity is updated.
- Shopping list item is archived after purchase.

---

# Phase 8: Barcode Scanner

## Goal

Allow users to scan product barcodes and add or find items.

## Tasks

1. Add barcode scanner screen.
2. Request camera permission.
3. Scan product barcode.
4. Search household inventory by barcode.
5. If barcode exists, open item details screen.
6. If barcode does not exist, open add item screen with barcode prefilled.
7. Allow user to manually add product details.
8. Store barcode in item record.

## Barcode Flow

```
User scans barcode

If barcode exists in household inventory:
Open item details screen

If barcode does not exist:
Open add item screen with barcode field prefilled
User manually enters item name, category, quantity, price, and unit
Save item

```

## Phase 8 Completion Criteria

Phase 8 is complete when:

- Barcode scanner works.
- Existing items can be found by barcode.
- New items can be created from barcode scan.
- Camera permission denial is handled properly.

---

# Phase 9: Push Notifications

## Goal

Notify household members when items are added to the shopping list or marked as finished.

## Tasks

1. Request notification permission.
2. Store user notification token.
3. Create notification service.
4. Create Firebase Cloud Function for shopping list notifications.
5. Notify household members when item is added to shopping list.
6. Notify household members when item is marked as out of stock.
7. Optionally notify when an item is purchased.
8. Do not send notification to users who disabled notifications.
9. Handle denied notification permissions gracefully.

## Notification Token Model

Store notification token in user document:

```
{
  "expoPushToken": "string",
  "notificationsEnabled": true
}

```

## Notification Examples

When item is added to shopping list:

```
Title: Shopping list updated
Body: Milk has been added to the shopping list.

```

When item is marked finished:

```
Title: Item finished
Body: Rice is finished at home and needs to be bought.

```

When item is purchased:

```
Title: Item purchased
Body: Milk was purchased from Tesco.

```

## Phase 9 Completion Criteria

Phase 9 is complete when:

- Push notification permission is requested.
- User notification token is stored.
- Household members receive notifications.
- Notifications are triggered by shopping list updates.
- Denied permissions are handled properly.

---

# Phase 10: Dashboard and Insights

## Goal

Create a useful dashboard showing household inventory, shopping list, and spending insights.

## Tasks

1. Show total inventory item count.
2. Show low-stock item count.
3. Show out-of-stock item count.
4. Show shopping list item count.
5. Show estimated shopping list total.
6. Show monthly spending.
7. Show biggest price increase.
8. Show most used store.
9. Show recently updated items.
10. Show recent activity log.

## Dashboard Cards

```
Available Items: 42
Shopping List: 8
Low Stock: 5
Out of Stock: 3
Estimated Shopping Cost: €34.80
This Month Spending: €120.40
Biggest Price Increase: Milk +10%
Most Used Store: Tesco

```

## Phase 10 Completion Criteria

Phase 10 is complete when:

- Dashboard displays useful household summary.
- Shopping list estimated total is shown.
- Monthly spending is calculated from purchases.
- Biggest price increase is calculated from price history.
- Most used store is calculated from purchase history.
- Recent activity is visible.

---

# Phase 11: Item Details, Purchase History, and Price History

## Goal

Improve item details screen with full purchase and price history.

## Tasks

1. Show complete item information.
2. Show last purchased store.
3. Show last purchase price.
4. Show previous purchase price.
5. Show price change amount.
6. Show price change percentage.
7. Show purchase history list.
8. Show price history list.
9. Show who last updated the item.
10. Add action buttons for quantity update, mark as finished, and add to shopping list.

## Item Details Screen Sections

### Basic Info

```
Name
Category
Quantity
Unit
Current price
Status
Barcode

```

### Purchase Info

```
Last purchased from
Last purchase date
Last purchase price
Previous purchase price
Price change amount
Price change percentage

```

### Purchase History

Example:

```
Tesco — €2.75 — 9 July 2026
Lidl — €2.50 — 1 July 2026
Aldi — €2.60 — 25 June 2026

```

### Price Changes

Example:

```
Increased from €2.50 to €2.75
Difference: +€0.25
Change: +10%

```

## Phase 11 Completion Criteria

Phase 11 is complete when:

- Item details show purchase history.
- Item details show price history.
- Item details show latest store and price.
- User can manage item from details screen.

---

# Phase 12: Household Members and Settings

## Goal

Allow household admins to manage members and users to manage settings.

## Tasks

1. Show household members.
2. Show member role.
3. Allow admin to remove members.
4. Allow admin to regenerate invite code.
5. Allow user to update notification preference.
6. Allow user to change currency.
7. Allow user to manage categories.
8. Allow user to log out.
9. Add dark mode support if possible.

## Members Screen

Show:

```
Member name
Member email
Role
Joined date

```

Admin actions:

```
Remove member
Change role
Regenerate invite code

```

## Settings Screen

Show:

```
Household name
Invite code
Notification settings
Currency
Categories
Theme
Logout

```

## Phase 12 Completion Criteria

Phase 12 is complete when:

- Members screen works.
- Admin can manage household members.
- User can manage notification preferences.
- User can manage currency.
- User can manage categories.
- User can log out.

---

# Phase 13: Firestore Security Rules

## Goal

Secure the app so users can only access households they belong to.

## Tasks

1. Write Firestore security rules.
2. Only authenticated users can access data.
3. Users can only read/write household data if they are members.
4. Only admins can remove members.
5. Only admins can delete households.
6. Validate required fields.
7. Prevent users from writing to another household.
8. Test rules carefully.

## Security Rules Requirements

```
Only authenticated users can access Firestore.
Users can only access their own user document.
Users can only access household data if they are members of that household.
Members can add and update items.
Members can add shopping list items.
Members can mark shopping list items as purchased.
Members can create purchase records.
Members can create price history records.
Only admins can remove members.
Only admins can delete household.

```

## Phase 13 Completion Criteria

Phase 13 is complete when:

- Firestore data is protected.
- Non-members cannot access household data.
- Members can perform normal actions.
- Admin-only actions are restricted.
- Rules are tested.

---

# Phase 14: Error Handling, Loading States, and Offline Handling

## Goal

Make the app stable and user-friendly.

## Tasks

1. Add loading states to all screens.
2. Add empty states to inventory and shopping list.
3. Add error messages.
4. Handle invalid invite code.
5. Handle permission denied errors.
6. Handle no internet connection.
7. Handle barcode scanner permission denied.
8. Handle notification permission denied.
9. Prevent duplicate form submissions.
10. Add form validation.

## Edge Cases to Handle

```
User has no household yet
User enters invalid invite code
User has denied camera permission
User has denied notification permission
Inventory is empty
Shopping list is empty
Item already exists
Barcode already exists
Quantity cannot go below zero
Price cannot be negative
Store name is missing during purchase
Firestore permission denied
No internet connection
Duplicate shopping list item

```

## Phase 14 Completion Criteria

Phase 14 is complete when:

- App does not crash during common errors.
- Clear error messages are shown.
- Empty states are shown.
- Forms are validated.
- Duplicate submissions are prevented.

---

# Phase 15: UI Polish and User Experience

## Goal

Make the app feel polished, simple, and household-friendly.

## Tasks

1. Improve visual design.
2. Use card-based layouts.
3. Add icons.
4. Improve spacing.
5. Improve typography.
6. Add category chips.
7. Add status badges.
8. Add smooth loading states.
9. Add confirmation dialogs for destructive actions.
10. Add success messages after important actions.

## UI Requirements

The app should feel:

```
Clean
Modern
Simple
Fast
Family-friendly
Easy to understand

```

## Recommended UI Elements

```
Inventory item cards
Shopping list cards
Category chips
Status badges
Quantity stepper
Purchase modal
Dashboard summary cards
Search bar
Filter chips
Empty state illustrations/icons

```

## Phase 15 Completion Criteria

Phase 15 is complete when:

- App looks polished.
- Main flows are easy to use.
- UI is consistent.
- Important actions have confirmation or feedback.

---

# Phase 16: Testing

## Goal

Test all important features before release.

## Tasks

1. Test signup/login/logout.
2. Test household creation.
3. Test joining household.
4. Test item creation/edit/delete.
5. Test quantity update.
6. Test mark as finished.
7. Test shopping list.
8. Test purchase flow.
9. Test price history.
10. Test barcode scanner.
11. Test push notifications.
12. Test member permissions.
13. Test Firestore security rules.
14. Test iPhone.
15. Test Android.

## Important Test Cases

```
User can create account
User can create household
User can join household
User can add item
User can edit item
User can delete item
User can mark item as finished
Finished item appears in shopping list
Duplicate shopping list item is not created
User can mark item as purchased
Purchase updates inventory
Purchase records store name
Purchase records actual price
Price change is calculated correctly
Purchase history appears in item details
Price history appears in item details
Notifications are sent to household members
Non-household user cannot access data
Member cannot perform admin-only actions
Barcode scan finds existing item
Barcode scan creates new item if not found

```

## Phase 16 Completion Criteria

Phase 16 is complete when:

- All main flows work.
- No major bugs are found.
- App works on both iPhone and Android.
- Security rules are verified.
- Notifications work.

---

# Phase 17: Release Preparation

## Goal

Prepare the app for App Store and Google Play Store release.

## Tasks

1. Add app icon.
2. Add splash screen.
3. Configure app name.
4. Configure bundle identifier.
5. Configure Android package name.
6. Set production Firebase environment.
7. Add privacy policy.
8. Add terms of use if needed.
9. Prepare screenshots.
10. Build iOS version.
11. Build Android version.
12. Test production builds.
13. Submit to App Store.
14. Submit to Google Play Store.

## Phase 17 Completion Criteria

Phase 17 is complete when:

- Production builds are created.
- App is ready for store submission.
- Privacy policy is available.
- App Store and Play Store assets are ready.

---

# MVP Scope

The MVP should include only the features needed for the first usable version.

## MVP Features

Build these first:

```
User signup/login
Create household
Join household using invite code
Add household item manually
View inventory
Edit item quantity
Mark item as finished
Add item to shopping list
Shared shopping list
Mark item as purchased
Enter purchase store
Enter actual purchase price
Save purchase history
Track price changes
Show estimated shopping list total
Basic push notifications
Basic dashboard

```

Do not include these in the MVP:

```
AI shopping suggestions
Store price comparison APIs
Product image upload
Receipt scanning
Expiry date tracking
Recipe suggestions
Advanced analytics
Widgets
Voice input
Multiple household switching if not needed immediately

```

---

# Suggested Development Order Summary

Build in this exact order:

```
Phase 1: Project setup and base structure
Phase 2: Authentication
Phase 3: Household creation and joining
Phase 4: Inventory management
Phase 5: Quantity controls and out-of-stock logic
Phase 6: Shared shopping list
Phase 7: Purchase flow, store tracking, and price tracking
Phase 8: Barcode scanner
Phase 9: Push notifications
Phase 10: Dashboard and insights
Phase 11: Item details, purchase history, and price history
Phase 12: Household members and settings
Phase 13: Firestore security rules
Phase 14: Error handling, loading states, and offline handling
Phase 15: UI polish and user experience
Phase 16: Testing
Phase 17: Release preparation

```

---

# Final Instruction for the Coding Agent

Build this app phase by phase.

Do not attempt to build all features at once.

At the end of each phase:

1. Confirm what was completed.
2. Mention any files created or changed.
3. Mention any assumptions made.
4. Mention any bugs or incomplete items.
5. Wait for approval before moving to the next phase.

Prioritize a working MVP first, then add advanced features later.

Use clean, scalable code with reusable components, separated services, typed models, and clear Firebase rules.