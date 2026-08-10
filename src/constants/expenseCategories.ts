import type { ExpenseCategoryId } from '../types/domain';

export interface ExpenseCategoryOption {
  id: ExpenseCategoryId;
  label: string;
  icon: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryOption[] = [
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'dining_out', label: 'Dining out', icon: '🍽️' },
  { id: 'rent_mortgage', label: 'Rent / mortgage', icon: '🏠' },
  { id: 'utilities', label: 'Utilities', icon: '💡' },
  { id: 'household_supplies', label: 'Household supplies', icon: '🧴' },
  { id: 'transport_commute', label: 'Commute / transport', icon: '🚗' },
  { id: 'fuel', label: 'Fuel', icon: '⛽' },
  { id: 'public_transport', label: 'Public transport', icon: '🚆' },
  { id: 'electronics', label: 'Electronics', icon: '💻' },
  { id: 'furniture_home', label: 'Furniture / home', icon: '🛋️' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '🔁' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'health', label: 'Health', icon: '🩺' },
  { id: 'insurance', label: 'Insurance', icon: '🛡️' },
  { id: 'childcare', label: 'Childcare', icon: '🧸' },
  { id: 'travel', label: 'Travel', icon: '✈️' },
  { id: 'maintenance_repairs', label: 'Maintenance / repairs', icon: '🛠️' },
  { id: 'pets', label: 'Pets', icon: '🐾' },
  { id: 'shared_personal', label: 'Shared personal', icon: '👥' },
  { id: 'other', label: 'Other', icon: '•••' },
];

export function expenseCategoryLabel(categoryId: ExpenseCategoryId): string {
  return EXPENSE_CATEGORIES.find((category) => category.id === categoryId)?.label ?? 'Other';
}
