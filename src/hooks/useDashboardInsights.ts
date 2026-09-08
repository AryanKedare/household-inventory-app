import { useEffect, useMemo, useState } from 'react';

import { requireSupabaseClient } from '../services/supabase/client';
import type { PriceHistory, Purchase } from '../types/domain';
import { timestampFromIso } from '../types/timestamp';

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function useDashboardInsights(householdId: string | null) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(!householdId);
  const [pricesLoaded, setPricesLoaded] = useState(!householdId);

  useEffect(() => {
    if (!householdId) {
      setPurchases([]);
      setPriceHistory([]);
      setPurchasesLoaded(true);
      setPricesLoaded(true);
      return undefined;
    }

    const supabase = requireSupabaseClient();
    let active = true;
    const start = monthStartIso();
    setPurchasesLoaded(false);
    setPricesLoaded(false);

    const loadPurchases = async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id,inventory_item_id,shopping_item_id,item_name,store,quantity,unit,unit_price_cents,total_cents,currency,purchased_by,purchased_at,created_at')
        .eq('household_id', householdId)
        .gte('purchased_at', start)
        .order('purchased_at', { ascending: false })
        .limit(200);
      if (!active) return;
      if (!error) {
        setPurchases((data ?? []).map((row) => ({
          id: row.id,
          itemId: row.inventory_item_id ?? '',
          shoppingListItemId: row.shopping_item_id ?? undefined,
          itemName: row.item_name ?? 'Item',
          storeName: row.store,
          quantityPurchased: Number(row.quantity),
          unit: row.unit ?? undefined,
          unitPriceCents: row.unit_price_cents,
          totalPriceCents: row.total_cents,
          currency: row.currency,
          purchasedBy: row.purchased_by,
          purchasedAt: timestampFromIso(row.purchased_at),
          createdAt: timestampFromIso(row.created_at),
        })));
      }
      setPurchasesLoaded(true);
    };

    const loadPrices = async () => {
      const { data, error } = await supabase
        .from('price_history')
        .select('id,inventory_item_id,purchase_id,item_name,store,previous_unit_price_cents,unit_price_cents,difference_cents,percentage_change,currency,changed_by,recorded_at')
        .eq('household_id', householdId)
        .gte('recorded_at', start)
        .order('recorded_at', { ascending: false })
        .limit(200);
      if (!active) return;
      if (!error) {
        setPriceHistory((data ?? []).map((row) => {
          const previous = row.previous_unit_price_cents ?? row.unit_price_cents;
          const difference = row.difference_cents ?? row.unit_price_cents - previous;
          const percentage = row.percentage_change === null ? null : Number(row.percentage_change);
          return {
            id: row.id,
            itemId: row.inventory_item_id ?? '',
            purchaseId: row.purchase_id ?? '',
            itemName: row.item_name ?? 'Item',
            storeName: row.store ?? '',
            previousPriceCents: previous,
            newPriceCents: row.unit_price_cents,
            differenceCents: difference,
            percentageChange: Number.isFinite(percentage) ? percentage : null,
            currency: row.currency,
            changedBy: row.changed_by ?? '',
            createdAt: timestampFromIso(row.recorded_at),
          } satisfies PriceHistory;
        }));
      }
      setPricesLoaded(true);
    };

    void loadPurchases();
    void loadPrices();
    const purchaseChannel = supabase
      .channel(`dashboard-purchases:${householdId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases', filter: `household_id=eq.${householdId}` }, () => void loadPurchases())
      .subscribe();
    const priceChannel = supabase
      .channel(`dashboard-prices:${householdId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_history', filter: `household_id=eq.${householdId}` }, () => void loadPrices())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(purchaseChannel);
      void supabase.removeChannel(priceChannel);
    };
  }, [householdId]);

  const insights = useMemo(() => {
    const monthlySpendCents = purchases.reduce((sum, purchase) => sum + purchase.totalPriceCents, 0);
    const stores = new Map<string, number>();
    for (const purchase of purchases) stores.set(purchase.storeName, (stores.get(purchase.storeName) ?? 0) + 1);
    const mostUsedStore = [...stores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const biggestIncrease = priceHistory
      .filter((entry) => entry.differenceCents > 0)
      .sort((a, b) => (b.percentageChange ?? 0) - (a.percentageChange ?? 0))[0] ?? null;
    return { monthlySpendCents, mostUsedStore, biggestIncrease };
  }, [priceHistory, purchases]);

  return { ...insights, loading: !purchasesLoaded || !pricesLoaded };
}
