import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useItemHistory } from '../../hooks/useItemHistory';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { InventoryItem, PriceHistory, Purchase } from '../../types/domain';
import { formatMoney } from '../../utils/money';

interface ItemHistoryModalProps {
  visible: boolean;
  householdId: string | null;
  item: InventoryItem | null;
  onClose: () => void;
}

function dateLabel(value: { toDate(): Date } | undefined): string {
  if (!value) {
    return 'Unknown date';
  }
  try {
    return new Intl.DateTimeFormat('en-IE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(value.toDate());
  } catch {
    return 'Unknown date';
  }
}

function PurchaseRow({ purchase }: { purchase: Purchase }) {
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyCopy}>
        <Text style={styles.rowTitle}>{purchase.storeName}</Text>
        <Text style={styles.rowMeta}>
          {purchase.quantityPurchased} {purchase.unit ?? ''} · {dateLabel(purchase.purchasedAt)}
        </Text>
      </View>
      <View style={styles.rowPriceWrap}>
        <Text style={styles.rowPrice}>{formatMoney(purchase.unitPriceCents, purchase.currency)}</Text>
        <Text style={styles.rowMeta}>{formatMoney(purchase.totalPriceCents, purchase.currency)} total</Text>
      </View>
    </View>
  );
}

function PriceRow({ price }: { price: PriceHistory }) {
  const positive = price.differenceCents > 0;
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyCopy}>
        <Text style={styles.rowTitle}>{price.storeName}</Text>
        <Text style={styles.rowMeta}>{dateLabel(price.createdAt)}</Text>
      </View>
      <View style={styles.rowPriceWrap}>
        <Text style={[styles.rowPrice, positive ? styles.increase : styles.decrease]}>
          {positive ? '↑ ' : '↓ '}
          {formatMoney(Math.abs(price.differenceCents), price.currency)}
        </Text>
        <Text style={styles.rowMeta}>
          {formatMoney(price.previousPriceCents, price.currency)} → {formatMoney(price.newPriceCents, price.currency)}
        </Text>
      </View>
    </View>
  );
}

export function ItemHistoryModal({ visible, householdId, item, onClose }: ItemHistoryModalProps) {
  const history = useItemHistory(householdId, item?.id ?? null);

  if (!item) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.subtitle}>Purchase & price history</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>Current price</Text>
              <Text style={styles.summaryPrice}>{formatMoney(item.currentPriceCents, item.currency)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryLabel}>Last store</Text>
              <Text style={styles.summaryStore}>{item.lastPurchase?.storeName ?? 'No purchase yet'}</Text>
            </View>
          </View>

          {history.error ? <Text style={styles.error}>{history.error}</Text> : null}
          {history.loading ? <Text style={styles.loading}>Loading history…</Text> : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PURCHASES</Text>
            {history.purchases.length === 0 && !history.loading ? (
              <Text style={styles.empty}>No purchases recorded yet.</Text>
            ) : (
              history.purchases.map((purchase) => <PurchaseRow key={purchase.id} purchase={purchase} />)
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PRICE CHANGES</Text>
            {history.priceHistory.length === 0 && !history.loading ? (
              <Text style={styles.empty}>No price changes recorded yet.</Text>
            ) : (
              history.priceHistory.map((price) => <PriceRow key={price.id} price={price} />)
            )}
          </View>
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
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
  close: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: 48 },
  summaryCard: {
    backgroundColor: colors.dark,
    borderRadius: 20,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  summaryLabel: { color: '#B8C3D7', fontSize: 12, marginBottom: spacing.xs },
  summaryPrice: { color: colors.white, fontSize: 24, fontWeight: '900' },
  summaryRight: { alignItems: 'flex-end', flex: 1 },
  summaryStore: { color: colors.white, fontWeight: '800', textAlign: 'right' },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.lg,
  },
  historyCopy: { flex: 1 },
  rowTitle: { color: colors.text, fontWeight: '800' },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  rowPriceWrap: { alignItems: 'flex-end' },
  rowPrice: { color: colors.text, fontWeight: '900' },
  increase: { color: colors.danger },
  decrease: { color: colors.success },
  loading: { color: colors.textMuted },
  empty: { color: colors.textMuted, paddingVertical: spacing.md },
  error: { color: colors.danger },
});
