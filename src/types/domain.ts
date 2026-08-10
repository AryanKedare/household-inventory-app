import type { Timestamp } from 'firebase/firestore';

export type HouseholdRole = 'owner' | 'admin' | 'member';
export type ItemStatus = 'available' | 'low_stock' | 'out_of_stock';
export type ShoppingItemStatus = 'active' | 'purchasing' | 'purchased' | 'removed';
export type ShoppingPriority = 'normal' | 'important' | 'urgent';
export type ExpenseCategoryId =
  | 'groceries'
  | 'dining_out'
  | 'rent_mortgage'
  | 'utilities'
  | 'household_supplies'
  | 'transport_commute'
  | 'fuel'
  | 'public_transport'
  | 'electronics'
  | 'furniture_home'
  | 'subscriptions'
  | 'entertainment'
  | 'health'
  | 'insurance'
  | 'childcare'
  | 'travel'
  | 'maintenance_repairs'
  | 'pets'
  | 'shared_personal'
  | 'other';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  defaultHouseholdId?: string;
  preferences: {
    currency: string;
    notificationsEnabled: boolean;
    theme: 'system' | 'light' | 'dark';
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Household {
  id: string;
  name: string;
  createdBy: string;
  inviteCode: string;
  currency: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HouseholdMember {
  userId: string;
  displayName: string;
  email: string;
  role: HouseholdRole;
  joinedAt: Timestamp;
}

export interface InventoryItem {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string;
  categoryName: string;
  barcode?: string | null;
  quantity: number;
  unit: 'piece' | 'kg' | 'g' | 'l' | 'ml' | 'pack' | 'box' | 'other';
  lowStockThreshold?: number | null;
  status: ItemStatus;
  currentPriceCents: number;
  currency: string;
  previousPriceCents?: number | null;
  priceChangeCents?: number | null;
  priceChangePercentage?: number | null;
  lastPurchase?: {
    storeName: string;
    priceCents: number;
    quantity: number;
    purchasedAt: Timestamp;
  };
  addedBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShoppingListItem {
  id: string;
  itemId?: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  quantityNeeded: number;
  unit?: string;
  estimatedPriceCents?: number;
  priority: ShoppingPriority;
  status: ShoppingItemStatus;
  addedBy: string;
  addedAt: Timestamp;
  purchasedBy?: string;
  purchasedAt?: Timestamp;
}

export interface Purchase {
  id: string;
  itemId: string;
  shoppingListItemId?: string;
  itemName: string;
  storeName: string;
  quantityPurchased: number;
  unit?: string;
  unitPriceCents: number;
  totalPriceCents: number;
  currency: string;
  purchasedBy: string;
  purchasedAt: Timestamp;
  createdAt: Timestamp;
}

export interface PriceHistory {
  id: string;
  itemId: string;
  purchaseId: string;
  itemName: string;
  storeName: string;
  previousPriceCents: number;
  newPriceCents: number;
  differenceCents: number;
  percentageChange: number | null;
  currency: string;
  changedBy: string;
  createdAt: Timestamp;
}

export interface ExpenseAllocation {
  userId: string;
  subtotalCents: number;
  discountShareCents: number;
  feeShareCents: number;
  owedCents: number;
}

export interface ExpenseDebt {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  settledCents?: number;
}

export interface HouseholdExpense {
  id: string;
  title: string;
  merchantName?: string | null;
  categoryId: ExpenseCategoryId;
  categorySource: 'manual' | 'ai' | 'inventory';
  categoryConfidence?: number | null;
  paidBy: string;
  paidByName: string;
  participantIds: string[];
  participantSubtotals: Array<{ userId: string; subtotalCents: number }>;
  lineItems: Array<{ description: string; totalCents: number; participantIds: string[] }>;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalPaidCents: number;
  allocations: ExpenseAllocation[];
  debts: ExpenseDebt[];
  settlementStatus?: 'open' | 'partial' | 'settled';
  currency: string;
  expenseDate: Timestamp;
  notes?: string | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpenseSettlement {
  id: string;
  expenseId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  currency: string;
  note?: string | null;
  recordedBy: string;
  createdAt: Timestamp;
}

export interface MonthlyBudget {
  id: string;
  period: string;
  currency: string;
  totalLimitCents: number;
  categoryLimitsCents: Partial<Record<ExpenseCategoryId, number>>;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ActivityType =
  | 'item_created'
  | 'item_updated'
  | 'quantity_changed'
  | 'item_finished'
  | 'shopping_item_added'
  | 'shopping_item_removed'
  | 'item_purchased'
  | 'expense_created'
  | 'expense_settlement_recorded'
  | 'member_joined'
  | 'member_removed'
  | 'member_left'
  | 'ownership_transferred';

export interface Activity {
  id: string;
  type: ActivityType;
  entityId?: string;
  actorId: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
}
