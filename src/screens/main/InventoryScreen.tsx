import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/common/AppButton';
import { AppInput } from '../../components/common/AppInput';
import { LoadingView } from '../../components/common/LoadingView';
import { Screen } from '../../components/common/Screen';
import { BarcodeScannerModal } from '../../components/inventory/BarcodeScannerModal';
import { InventoryItemCard } from '../../components/inventory/InventoryItemCard';
import { ItemHistoryModal } from '../../components/inventory/ItemHistoryModal';
import { ItemEditorModal } from '../../components/inventory/ItemEditorModal';
import { useAuth } from '../../context/AuthContext';
import { useHousehold } from '../../context/HouseholdContext';
import { useInventory } from '../../hooks/useInventory';
import * as inventoryService from '../../services/firebase/inventoryService';
import * as shoppingService from '../../services/firebase/shoppingListService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { InventoryItem, ItemStatus } from '../../types/domain';
import { toUserMessage } from '../../utils/firebaseError';

export function InventoryScreen() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { items, loading, error } = useInventory(householdId);
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [initialBarcode, setInitialBarcode] = useState<string | undefined>(undefined);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | ItemStatus>('all');
  const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'price'>('name');

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(items.map((item) => item.categoryName))).sort()],
    [items],
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('en-IE');
    return items
      .filter(
        (item) =>
          (!term ||
            item.name.toLocaleLowerCase('en-IE').includes(term) ||
            item.categoryName.toLocaleLowerCase('en-IE').includes(term)) &&
          (categoryFilter === 'All' || item.categoryName === categoryFilter) &&
          (statusFilter === 'all' || item.status === statusFilter),
      )
      .sort((left, right) => {
        if (sortBy === 'quantity') {
          return left.quantity - right.quantity || left.name.localeCompare(right.name);
        }
        if (sortBy === 'price') {
          return left.currentPriceCents - right.currentPriceCents || left.name.localeCompare(right.name);
        }
        return left.name.localeCompare(right.name);
      });
  }, [categoryFilter, items, search, sortBy, statusFilter]);

  if (loading) {
    return <LoadingView label="Loading inventory…" />;
  }

  if (!householdId || !user) {
    return null;
  }

  function openAdd() {
    setEditingItem(null);
    setInitialBarcode(undefined);
    setEditorVisible(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setInitialBarcode(undefined);
    setEditorVisible(true);
  }

  async function handleBarcode(barcode: string) {
    try {
      const existing = await inventoryService.findInventoryItemByBarcode(householdId, barcode);
      setScannerVisible(false);
      if (existing) {
        openEdit(existing);
        return;
      }
      setEditingItem(null);
      setInitialBarcode(barcode);
      setEditorVisible(true);
    } catch (scanError) {
      setScannerVisible(false);
      Alert.alert('Barcode lookup failed', toUserMessage(scanError));
    }
  }

  async function saveItem(input: inventoryService.InventoryItemInput) {
    if (editingItem) {
      await inventoryService.updateItem(householdId, user.uid, editingItem.id, input);
      return;
    }
    await inventoryService.addItem(householdId, user.uid, input);
  }

  function confirmDelete() {
    if (!editingItem) {
      return;
    }
    const target = editingItem;
    Alert.alert('Delete item?', `${target.name} will be removed from household inventory.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void inventoryService
            .deleteItem(householdId, target.id)
            .then(() => {
              setEditorVisible(false);
              setEditingItem(null);
            })
            .catch((deleteError) => {
              Alert.alert('Could not delete item', toUserMessage(deleteError));
            });
        },
      },
    ]);
  }

  async function changeQuantity(item: InventoryItem, nextQuantity: number) {
    try {
      setBusyItemId(item.id);
      await inventoryService.setQuantity(householdId, user.uid, item, nextQuantity);
    } catch (quantityError) {
      Alert.alert('Could not update quantity', toUserMessage(quantityError));
    } finally {
      setBusyItemId(null);
    }
  }

  async function addToShopping(item: InventoryItem) {
    try {
      setBusyItemId(item.id);
      await shoppingService.addInventoryItemToShoppingList(householdId, user.uid, item);
    } catch (shoppingError) {
      Alert.alert('Could not update shopping list', toUserMessage(shoppingError));
    } finally {
      setBusyItemId(null);
    }
  }

  async function markFinished(item: InventoryItem) {
    try {
      setBusyItemId(item.id);
      await shoppingService.markFinishedAndAddToShoppingList(householdId, user.uid, item);
    } catch (finishError) {
      Alert.alert('Could not mark item finished', toUserMessage(finishError));
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Inventory</Text>
          <Text style={styles.subtitle}>{items.length} household items</Text>
        </View>
        <View style={styles.headerActions}>
          <AppButton
            title="Scan"
            variant="secondary"
            onPress={() => setScannerVisible(true)}
            style={styles.headerButton}
          />
          <AppButton title="+ Add" onPress={openAdd} style={styles.headerButton} />
        </View>
      </View>

      <AppInput
        label="Search"
        placeholder="Milk, cleaning, snacks…"
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={() => setCategoryFilter(category)}
              style={[styles.chip, categoryFilter === category && styles.chipActive]}
            >
              <Text style={[styles.chipText, categoryFilter === category && styles.chipTextActive]}>
                {category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[
            ['all', 'All stock'],
            ['available', 'Available'],
            ['low_stock', 'Low'],
            ['out_of_stock', 'Out'],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setStatusFilter(value as 'all' | ItemStatus)}
              style={[styles.chip, statusFilter === value && styles.chipActive]}
            >
              <Text style={[styles.chipText, statusFilter === value && styles.chipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.sortLabel}>Sort:</Text>
          {(['name', 'quantity', 'price'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setSortBy(value)}
              style={[styles.chip, sortBy === value && styles.sortChipActive]}
            >
              <Text style={[styles.chipText, sortBy === value && styles.sortChipTextActive]}>
                {value === 'name' ? 'Name' : value === 'quantity' ? 'Qty' : 'Price'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <InventoryItemCard
            item={item}
            busy={busyItemId === item.id}
            onEdit={() => openEdit(item)}
            onHistory={() => setHistoryItem(item)}
            onQuantityChange={(quantity) => void changeQuantity(item, quantity)}
            onAddToShopping={() => void addToShopping(item)}
            onFinished={() => void markFinished(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{search ? 'No matches' : 'No inventory yet'}</Text>
            <Text style={styles.emptyText}>
              {search ? 'Try another search.' : 'Add the first item used in your household.'}
            </Text>
          </View>
        }
      />

      <ItemEditorModal
        visible={editorVisible}
        item={editingItem}
        initialBarcode={initialBarcode}
        onClose={() => {
          setEditorVisible(false);
          setEditingItem(null);
          setInitialBarcode(undefined);
        }}
        onSave={saveItem}
        onDelete={editingItem ? async () => confirmDelete() : undefined}
      />

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={(barcode) => void handleBarcode(barcode)}
      />

      <ItemHistoryModal
        visible={historyItem !== null}
        householdId={householdId}
        item={historyItem}
        onClose={() => setHistoryItem(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerButton: { minHeight: 44, paddingHorizontal: spacing.md },
  filters: { gap: spacing.sm, marginTop: spacing.md },
  chips: { gap: spacing.sm, alignItems: 'center' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: '#E8EEFF', borderColor: colors.primary },
  sortChipActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  chipText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: colors.primary },
  sortChipTextActive: { color: '#FFFFFF' },
  sortLabel: { color: colors.textMuted, alignSelf: 'center', marginLeft: spacing.sm, fontSize: 12 },
  list: { gap: spacing.md, paddingVertical: spacing.lg, paddingBottom: 32, flexGrow: 1 },
  error: { color: colors.danger, marginTop: spacing.md },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
