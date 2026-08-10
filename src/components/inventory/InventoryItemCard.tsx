import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { InventoryItem } from '../../types/domain';
import { formatMoney } from '../../utils/money';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { AppCard } from '../common/AppCard';
import { AppButton } from '../common/AppButton';

interface InventoryItemCardProps {
  item: InventoryItem;
  busy?: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onQuantityChange: (quantity: number) => void;
  onAddToShopping: () => void;
  onFinished: () => void;
}

const statusLabel = {
  available: 'Available',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
} as const;

export function InventoryItemCard({
  item,
  busy = false,
  onEdit,
  onHistory,
  onQuantityChange,
  onAddToShopping,
  onFinished,
}: InventoryItemCardProps) {
  return (
    <AppCard style={styles.card}>
      <Pressable onPress={onEdit} style={styles.top}>
        <View style={styles.titleBlock}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.category}>{item.categoryName}</Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.price}>{formatMoney(item.currentPriceCents, item.currency)}</Text>
          {typeof item.priceChangeCents === 'number' && item.priceChangeCents !== 0 ? (
            <Text style={item.priceChangeCents > 0 ? styles.priceIncrease : styles.priceDecrease}>
              {item.priceChangeCents > 0 ? '↑ ' : '↓ '}
              {formatMoney(Math.abs(item.priceChangeCents), item.currency)}
            </Text>
          ) : null}
          <Text
            style={[
              styles.status,
              item.status === 'available' && styles.available,
              item.status === 'low_stock' && styles.low,
              item.status === 'out_of_stock' && styles.out,
            ]}
          >
            {statusLabel[item.status]}
          </Text>
        </View>
      </Pressable>

      <View style={styles.quantityRow}>
        <Pressable
          disabled={busy || item.quantity <= 0}
          onPress={() => onQuantityChange(item.quantity - 1)}
          style={[styles.stepper, (busy || item.quantity <= 0) && styles.disabled]}
        >
          <Text style={styles.stepperText}>−</Text>
        </Pressable>
        <Text style={styles.quantity}>
          {item.quantity} {item.unit}
        </Text>
        <Pressable
          disabled={busy}
          onPress={() => onQuantityChange(item.quantity + 1)}
          style={[styles.stepper, busy && styles.disabled]}
        >
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <AppButton
          title="History"
          variant="secondary"
          disabled={busy}
          onPress={onHistory}
          style={styles.actionButton}
        />
        <AppButton
          title="Add to list"
          variant="secondary"
          disabled={busy}
          onPress={onAddToShopping}
          style={styles.actionButton}
        />
        <AppButton
          title="Finished"
          disabled={busy}
          onPress={onFinished}
          style={styles.actionButton}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  titleBlock: { flex: 1 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  category: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  priceBlock: { alignItems: 'flex-end', gap: spacing.xs },
  price: { color: colors.text, fontWeight: '700' },
  priceIncrease: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  priceDecrease: { color: colors.success, fontSize: 11, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '800' },
  available: { color: colors.success },
  low: { color: colors.warning },
  out: { color: colors.danger },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stepper: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { color: colors.text, fontSize: 24, fontWeight: '700' },
  quantity: { color: colors.text, minWidth: 72, textAlign: 'center', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, minHeight: 44 },
  disabled: { opacity: 0.4 },
});
