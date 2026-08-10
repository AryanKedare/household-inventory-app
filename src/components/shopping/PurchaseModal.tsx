import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ShoppingListItem } from '../../types/domain';
import { centsToEuros, eurosToCents, formatMoney } from '../../utils/money';
import { AppButton } from '../common/AppButton';
import { AppInput } from '../common/AppInput';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export interface PurchaseFormValue {
  quantityPurchased: number;
  unitPriceCents: number;
  storeName: string;
}

interface PurchaseModalProps {
  visible: boolean;
  item: ShoppingListItem | null;
  onClose: () => void;
  onSubmit: (value: PurchaseFormValue) => Promise<void>;
}

export function PurchaseModal({ visible, item, onClose, onSubmit }: PurchaseModalProps) {
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0.00');
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !item) {
      return;
    }
    setQuantity(String(item.quantityNeeded || 1));
    setUnitPrice(centsToEuros(item.estimatedPriceCents ?? 0).toFixed(2));
    setStoreName('');
    setError(null);
    setSaving(false);
  }, [visible, item]);

  const totalCents = useMemo(() => {
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice.replace(',', '.'));
    if (!Number.isFinite(parsedQuantity) || !Number.isFinite(parsedPrice)) {
      return 0;
    }
    return Math.round(Math.max(0, parsedQuantity) * eurosToCents(Math.max(0, parsedPrice)));
  }, [quantity, unitPrice]);

  if (!item) {
    return null;
  }

  async function submit() {
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice.replace(',', '.'));
    const cleanStore = storeName.trim();

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a quantity greater than zero.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Enter a valid unit price.');
      return;
    }
    if (!cleanStore) {
      setError('Enter where the item was purchased.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSubmit({
        quantityPurchased: parsedQuantity,
        unitPriceCents: eurosToCents(parsedPrice),
        storeName: cleanStore,
      });
      onClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save purchase.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>PURCHASE</Text>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.subtitle}>Record the actual purchase so inventory and price history stay accurate.</Text>

            <AppInput
              label="Quantity bought"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            <AppInput
              label="Unit price (€)"
              value={unitPrice}
              onChangeText={setUnitPrice}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            <AppInput
              label="Purchased from"
              value={storeName}
              onChangeText={setStoreName}
              placeholder="Tesco, Lidl, Aldi…"
              autoCapitalize="words"
              editable={!saving}
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Purchase total</Text>
              <Text style={styles.total}>{formatMoney(totalCents)}</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <AppButton
                title="Cancel"
                variant="secondary"
                onPress={onClose}
                disabled={saving}
                style={styles.action}
              />
              <AppButton
                title="Save purchase"
                onPress={() => void submit()}
                loading={saving}
                style={styles.action}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 18, 32, 0.52)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 36 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  totalLabel: { color: colors.textMuted, fontWeight: '600' },
  total: { color: colors.text, fontSize: 20, fontWeight: '800' },
  error: { color: colors.danger, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
