import type { ItemStatus } from '../types/domain';

export function getItemStatus(
  quantity: number,
  lowStockThreshold?: number | null,
): ItemStatus {
  if (quantity <= 0) {
    return 'out_of_stock';
  }

  if (
    typeof lowStockThreshold === 'number' &&
    Number.isFinite(lowStockThreshold) &&
    lowStockThreshold >= 0 &&
    quantity <= lowStockThreshold
  ) {
    return 'low_stock';
  }

  return 'available';
}
