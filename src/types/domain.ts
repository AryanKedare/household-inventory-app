import type { Timestamp } from 'firebase/firestore';

export type HouseholdRole = 'owner' | 'admin' | 'member';
export type ItemStatus = 'available' | 'low_stock' | 'out_of_stock';
export type ShoppingItemStatus = 'active' | 'purchasing' | 'purchased' | 'removed';
export type ShoppingPriority = 'normal' | 'important' | 'urgent';

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

export type ActivityType =
  | 'item_created'
  | 'item_updated'
  | 'quantity_changed'
  | 'item_finished'
  | 'shopping_item_added'
  | 'shopping_item_removed'
  | 'item_purchased'
  | 'member_joined'
  | 'member_removed';

export interface Activity {
  id: string;
  type: ActivityType;
  entityId?: string;
  actorId: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
}
