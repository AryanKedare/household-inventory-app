import { z } from 'zod';

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().trim().min(1),
  categoryName: z.string().trim().min(1).max(80),
  quantity: z.number().min(0),
  unit: z.enum(['piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'other']),
  lowStockThreshold: z.number().min(0).optional(),
  currentPriceCents: z.number().int().min(0),
  currency: z.string().length(3),
  barcode: z.string().trim().max(64).optional(),
});
