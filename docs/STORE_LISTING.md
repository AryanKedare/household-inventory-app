# HomeStock Store Listing Draft

> Replace bracketed URLs/contact details before submission and adapt final wording to any store character limits shown in App Store Connect / Google Play Console at submission time.

## App name

HomeStock

## Short description / subtitle

Shared home inventory, shopping, budgets & Go Dutch expenses.

## Promotional text

Know what is at home, what needs buying, what the household spent, and who owes what—all in one shared place.

## Full description

HomeStock is a shared household inventory, shopping and finance app built for people who live together.

### Keep track of what is at home

Add household items, scan supported barcodes, track quantity, and see what is available, running low, or finished. When something runs out, add it to the shared shopping list so everyone in the household can see what is needed.

### Shop together

Maintain one shared shopping list across the household. Record what was bought, where it was purchased, the actual price, and how prices change over time.

### Track the whole household budget

HomeStock Finance is not limited to groceries. Record household spending such as:

- groceries and household supplies;
- dining out and takeaways;
- rent or mortgage costs;
- utilities;
- commute, fuel and public transport;
- electronics;
- furniture and home purchases;
- subscriptions and entertainment;
- travel, health, insurance, childcare, repairs, pets and other shared costs.

Set an overall monthly household budget and optional category budgets to understand where household money is going.

### Go Dutch, including discounts

Split shared expenses according to what each person actually ordered or used. HomeStock can apply a bill-level discount and fees proportionally to each person's pre-discount share while keeping the final calculation exact to the cent.

Track what you owe, what is owed back to you, and record partial or full repayments without losing the original expense history.

### AI-assisted household finance

Optional Groq-powered AI features can:

- suggest an expense category;
- turn pasted bill or receipt text into a reviewable draft;
- suggest which household members appear to share a line item;
- summarize aggregate household spending patterns and budget pressure.

AI suggestions are always reviewable. AI does not directly decide the final monetary split. HomeStock's deterministic server-side calculation handles final discounts, fees, rounding, debts and repayments.

### Built for shared households

Household roles, invite codes, activity history and notifications help members stay synchronized. Owners can transfer ownership, members can leave, and a sole owner can permanently delete the household and its household-scoped data.

## Feature bullets

- Shared household inventory
- Barcode-assisted item entry
- Low-stock and finished-item tracking
- Shared shopping list
- Store and price history
- Household-wide expense tracking
- Monthly and category budgets
- Go Dutch expense splitting
- Proportional bill discount and fee allocation
- Partial/full repayment tracking
- Optional AI category, bill-draft and spending insights
- Household activity and push notifications
- Owner/admin/member roles

## Suggested keywords

household, inventory, shopping list, groceries, budget, expense tracker, split bills, go dutch, roommates, home, shared expenses

## Support URL

`[SUPPORT_URL]`

## Privacy policy URL

`[PRIVACY_POLICY_URL]`

## Terms URL

`[TERMS_URL]`

## Review notes

HomeStock uses Firebase Authentication and household-scoped data. Reviewers should create at least two test accounts if they want to exercise shared-household and Go Dutch flows.

The application can be tested without using AI features. AI features require the production/staging Groq server secret to be configured. The Groq API key is not stored in the mobile application.

Suggested review sequence:

1. Create account A and create a household.
2. Copy the household invite code.
3. Create account B and join the household with the invite code.
4. Add an inventory item and add it to shopping.
5. Record a purchase.
6. Open Finance and add an expense with account A as payer and both users as participants.
7. Apply a discount to see the proportional split.
8. Record a partial/full repayment from the Go Dutch balances section.
9. Optionally test AI category suggestion or paste non-sensitive sample bill text into AI Bill.

If reviewer credentials are supplied instead, place them only in the secure store-review credential field, not in public listing text.
