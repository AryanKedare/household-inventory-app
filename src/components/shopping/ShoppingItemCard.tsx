import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShoppingListItem } from '../../types/domain';
import { formatMoney } from '../../utils/money';
import { AppButton } from '../common/AppButton';
import { AppCard } from '../common/AppCard';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

interface ShoppingItemCardProps {
  item: ShoppingListItem;
  busy?: boolean;
  onQuantityChange: (quantity: number) => void;
  onPurchase: () => void;
  onRemove: () => void;
}

export function ShoppingItemCard({
  item,
  busy = false,
  onQuantityChange,
  onPurchase,
  onRemove,
}: ShoppingItemCardProps) {
  const estimatedUnit = item.estimatedPriceCents ?? 0;
  const estimatedTotal = estimatedUnit * item.quantityNeeded;

  return (
    <AppCard style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.categoryName ?? 'Other'} · {item.unit ?? 'piece'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name} from shopping list`}
          onPress={onRemove}
          disabled={busy}
          hitSlop={12}
        >
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.detailRow}>
        <View>
          <Text style={styles.label}>Estimated</Text>
          <Text style={styles.value}>{formatMoney(estimatedTotal)}</Text>
        </View>

        <View style={styles.quantityWrap}>
          <Text style={styles.label}>Quantity</Text>
          <View style={styles.quantityRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${item.name} quantity`}
              disabled={busy || item.quantityNeeded <= 1}
              onPress={() => onQuantityChange(Math.max(1, item.quantityNeeded - 1))}
              style={[styles.stepper, (busy || item.quantityNeeded <= 1) && styles.disabled]}
            >
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <Text style={styles.quantity}>{item.quantityNeeded}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Increase ${item.name} quantity`}
              disabled={busy}
              onPress={() => onQuantityChange(item.quantityNeeded + 1)}
              style={[styles.stepper, busy && styles.disabled]}
            >
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <AppButton title="Mark purchased" onPress={onPurchase} loading={busy} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headingText: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.textMuted },
  remove: { color: colors.danger, fontWeight: '700' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.xs },
  value: { color: colors.text, fontSize: 18, fontWeight: '700' },
  quantityWrap: { alignItems: 'flex-end' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepper: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  stepperText: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  quantity: { color: colors.text, minWidth: 28, textAlign: 'center', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
