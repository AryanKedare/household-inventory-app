import { useMemo, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../../components/common/AppCard';
import { LoadingView } from '../../components/common/LoadingView';
import { Screen } from '../../components/common/Screen';
import {
  PurchaseModal,
  type PurchaseFormValue,
} from '../../components/shopping/PurchaseModal';
import { ShoppingItemCard } from '../../components/shopping/ShoppingItemCard';
import { useHousehold } from '../../context/HouseholdContext';
import { useShoppingList } from '../../hooks/useShoppingList';
import * as purchaseService from '../../services/firebase/purchaseService';
import * as shoppingService from '../../services/firebase/shoppingListService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { ShoppingListItem } from '../../types/domain';
import { toUserMessage } from '../../utils/firebaseError';
import { formatMoney } from '../../utils/money';

export function ShoppingListScreen() {
  const { householdId } = useHousehold();
  const { items, estimatedTotalCents, loading, error } = useShoppingList(householdId);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<ShoppingListItem | null>(null);

  const sections = useMemo(() => {
    const grouped = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const category = item.categoryName ?? 'Other';
      const values = grouped.get(category) ?? [];
      values.push(item);
      grouped.set(category, values);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([title, data]) => ({ title, data }));
  }, [items]);
  const categories = sections.length;

  if (loading) {
    return <LoadingView label="Loading shopping list…" />;
  }

  if (!householdId) {
    return null;
  }

  const activeHouseholdId = householdId;

  async function changeQuantity(item: ShoppingListItem, quantity: number) {
    try {
      setBusyItemId(item.id);
      await shoppingService.updateShoppingQuantity(activeHouseholdId, item.id, quantity);
    } catch (updateError) {
      Alert.alert('Could not update quantity', toUserMessage(updateError));
    } finally {
      setBusyItemId(null);
    }
  }

  function confirmRemove(item: ShoppingListItem) {
    Alert.alert('Remove from shopping list?', `${item.name} will remain in inventory.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setBusyItemId(item.id);
          void shoppingService
            .removeShoppingItem(activeHouseholdId, item.id)
            .catch((removeError) => {
              Alert.alert('Could not remove item', toUserMessage(removeError));
            })
            .finally(() => setBusyItemId(null));
        },
      },
    ]);
  }

  async function completePurchase(value: PurchaseFormValue) {
    if (!purchaseItem) {
      return;
    }

    try {
      setBusyItemId(purchaseItem.id);
      await purchaseService.purchaseShoppingListItem({
        householdId: activeHouseholdId,
        shoppingListItemId: purchaseItem.id,
        quantityPurchased: value.quantityPurchased,
        unitPriceCents: value.unitPriceCents,
        storeName: value.storeName,
        purchasedAt: value.purchasedAt,
      });
    } catch (purchaseError) {
      throw new Error(toUserMessage(purchaseError));
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Shopping</Text>
          <Text style={styles.subtitle}>Shared across your household</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{items.length}</Text>
        </View>
      </View>

      <AppCard style={styles.summary}>
        <View>
          <Text style={styles.summaryLabel}>Estimated total</Text>
          <Text style={styles.summaryValue}>{formatMoney(estimatedTotalCents)}</Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.summaryLabel}>Categories</Text>
          <Text style={styles.summarySmall}>{categories}</Text>
        </View>
      </AppCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title.toUpperCase()}</Text>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.itemWrap}>
            <ShoppingItemCard
              item={item}
              busy={busyItemId === item.id}
              onQuantityChange={(quantity) => void changeQuantity(item, quantity)}
              onPurchase={() => setPurchaseItem(item)}
              onRemove={() => confirmRemove(item)}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your list is clear</Text>
            <Text style={styles.emptyText}>
              Mark an inventory item as finished or add it to the shopping list.
            </Text>
          </View>
        }
      />

      <PurchaseModal
        visible={purchaseItem !== null}
        item={purchaseItem}
        onClose={() => setPurchaseItem(null)}
        onSubmit={completePurchase}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
  countBadge: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark,
    borderColor: colors.dark,
  },
  summaryLabel: { color: '#B8C3D7', fontSize: 12, marginBottom: spacing.xs },
  summaryValue: { color: colors.white, fontSize: 28, fontWeight: '800' },
  summaryRight: { alignItems: 'flex-end' },
  summarySmall: { color: colors.white, fontSize: 22, fontWeight: '800' },
  error: { color: colors.danger, marginTop: spacing.md },
  list: { paddingVertical: spacing.lg, paddingBottom: 32, flexGrow: 1 },
  itemWrap: { marginBottom: spacing.md },
  sectionHeader: {
    color: colors.primary,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center', maxWidth: 300, lineHeight: 21 },
});
