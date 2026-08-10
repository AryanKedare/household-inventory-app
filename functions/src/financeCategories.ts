export const EXPENSE_CATEGORY_IDS = [
  'groceries',
  'dining_out',
  'rent_mortgage',
  'utilities',
  'household_supplies',
  'transport_commute',
  'fuel',
  'public_transport',
  'electronics',
  'furniture_home',
  'subscriptions',
  'entertainment',
  'health',
  'insurance',
  'childcare',
  'travel',
  'maintenance_repairs',
  'pets',
  'shared_personal',
  'other',
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number];

export const EXPENSE_CATEGORY_SET = new Set<string>(EXPENSE_CATEGORY_IDS);
