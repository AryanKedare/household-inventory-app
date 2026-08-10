import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DEFAULT_CATEGORIES } from '../../constants/categories';
import type { InventoryItem } from '../../types/domain';
import { centsToEuros, eurosToCents, parseDecimalInput } from '../../utils/money';
import { AppButton } from '../common/AppButton';
import { AppInput } from '../common/AppInput';
import type { InventoryItemInput } from '../../services/firebase/inventoryService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const UNITS: InventoryItem['unit'][] = ['piece', 'pack', 'kg', 'g', 'l', 'ml', 'box', 'other'];

interface ItemEditorModalProps {
  visible: boolean;
  item?: InventoryItem | null;
  initialBarcode?: string;
  onClose: () => void;
  onSave: (input: InventoryItemInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function ItemEditorModal({
  visible,
  item,
  initialBarcode,
  onClose,
  onSave,
  onDelete,
}: ItemEditorModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<InventoryItem['unit']>('piece');
  const [price, setPrice] = useState('');
  const [lowThreshold, setLowThreshold] = useState('');
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(item?.name ?? '');
    setCategory(item?.categoryName ?? 'Other');
    setQuantity(String(item?.quantity ?? 1));
    setUnit(item?.unit ?? 'piece');
    setPrice(item ? String(centsToEuros(item.currentPriceCents)) : '');
    setLowThreshold(
      typeof item?.lowStockThreshold === 'number' ? String(item.lowStockThreshold) : '',
    );
    setBarcode(item?.barcode ?? initialBarcode ?? '');
    setError(null);
  }, [initialBarcode, item, visible]);

  async function save() {
    const numericQuantity = parseDecimalInput(quantity);
    const numericPrice = price.trim() === '' ? 0 : parseDecimalInput(price);
    const numericThreshold =
      lowThreshold.trim() === '' ? undefined : parseDecimalInput(lowThreshold);

    if (name.trim().length === 0) {
      setError('Item name is required.');
      return;
    }
    if (category.trim().length === 0) {
      setError('Category is required.');
      return;
    }
    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      setError('Quantity must be zero or more.');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('Price must be zero or more.');
      return;
    }
    if (
      numericThreshold !== undefined &&
      (!Number.isFinite(numericThreshold) || numericThreshold < 0)
    ) {
      setError('Low-stock threshold must be zero or more.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave({
        name: name.trim(),
        categoryName: category.trim(),
        quantity: numericQuantity,
        unit,
        lowStockThreshold: numericThreshold,
        currentPriceCents: eurosToCents(numericPrice),
        currency: 'EUR',
        barcode: barcode.trim() || undefined,
      });
      onClose();
    } catch {
      setError('Unable to save this item. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{item ? 'Edit item' : 'Add item'}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppInput label="Item name" placeholder="Milk" value={name} onChangeText={setName} />
          <AppInput label="Category" value={category} onChangeText={setCategory} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {DEFAULT_CATEGORIES.map((value) => (
              <Pressable
                key={value}
                onPress={() => setCategory(value)}
                style={[styles.chip, category === value && styles.chipActive]}
              >
                <Text style={[styles.chipText, category === value && styles.chipTextActive]}>
                  {value}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <AppInput
            label="Quantity"
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
          />

          <Text style={styles.label}>Unit</Text>
          <View style={styles.unitGrid}>
            {UNITS.map((value) => (
              <Pressable
                key={value}
                onPress={() => setUnit(value)}
                style={[styles.unit, unit === value && styles.unitActive]}
              >
                <Text style={[styles.unitText, unit === value && styles.unitTextActive]}>{value}</Text>
              </Pressable>
            ))}
          </View>

          <AppInput
            label="Current price (€)"
            placeholder="2.75"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
          <AppInput
            label="Low-stock threshold (optional)"
            placeholder="1"
            keyboardType="decimal-pad"
            value={lowThreshold}
            onChangeText={setLowThreshold}
          />
          <AppInput
            label="Barcode (optional)"
            placeholder="Scan or enter barcode"
            keyboardType="number-pad"
            value={barcode}
            onChangeText={setBarcode}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton title={item ? 'Save changes' : 'Add item'} loading={saving} onPress={() => void save()} />
          {item && onDelete ? (
            <AppButton
              title="Delete item"
              variant="danger"
              disabled={saving}
              onPress={() => void onDelete()}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  close: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 48 },
  chips: { gap: spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: '#E8EEFF' },
  chipText: { color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  label: { color: colors.text, fontWeight: '600', fontSize: 14 },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  unit: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  unitActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  unitText: { color: colors.textMuted, fontWeight: '600' },
  unitTextActive: { color: colors.white },
  error: { color: colors.danger, lineHeight: 20 },
});
