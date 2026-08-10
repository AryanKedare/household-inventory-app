import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../../components/common/AppCard';
import { LoadingView } from '../../components/common/LoadingView';
import { Screen } from '../../components/common/Screen';
import { useHousehold } from '../../context/HouseholdContext';
import { useActivities } from '../../hooks/useActivities';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { Activity } from '../../types/domain';
import { formatMoney } from '../../utils/money';

function activityCopy(activity: Activity): { title: string; detail: string; icon: string } {
  const metadata = activity.metadata ?? {};
  const itemName = typeof metadata.itemName === 'string' ? metadata.itemName : 'Item';

  switch (activity.type) {
    case 'item_created':
      return { title: `${itemName} added`, detail: 'Added to household inventory', icon: '＋' };
    case 'quantity_changed': {
      const from = typeof metadata.from === 'number' ? metadata.from : '?';
      const to = typeof metadata.to === 'number' ? metadata.to : '?';
      return { title: `${itemName} quantity changed`, detail: `${from} → ${to}`, icon: '↕' };
    }
    case 'item_finished':
      return { title: `${itemName} finished`, detail: 'Inventory is now out of stock', icon: '!' };
    case 'item_updated':
      return { title: `${itemName} updated`, detail: 'Item details changed', icon: '✎' };
    case 'shopping_item_added':
      return { title: `${itemName} added to shopping`, detail: 'Ready for the next shop', icon: '🛒' };
    case 'shopping_item_removed':
      return { title: `${itemName} removed`, detail: 'Removed from the shopping list', icon: '−' };
    case 'item_purchased': {
      const store = typeof metadata.storeName === 'string' ? metadata.storeName : 'a store';
      const total = typeof metadata.totalPriceCents === 'number' ? formatMoney(metadata.totalPriceCents) : null;
      return {
        title: `${itemName} purchased`,
        detail: total ? `${store} · ${total}` : store,
        icon: '✓',
      };
    }
    case 'member_joined': {
      const displayName = typeof metadata.displayName === 'string' ? metadata.displayName : 'A member';
      return { title: `${displayName} joined`, detail: 'Joined the household', icon: '👤' };
    }
    case 'member_removed':
      return { title: 'Member removed', detail: 'Household membership changed', icon: '👤' };
    case 'member_left': {
      const displayName = typeof metadata.displayName === 'string' ? metadata.displayName : 'A member';
      return { title: `${displayName} left`, detail: 'Left the household', icon: '↗' };
    }
    case 'ownership_transferred': {
      const newOwnerName =
        typeof metadata.newOwnerName === 'string' ? metadata.newOwnerName : 'A household member';
      const previousOwnerName =
        typeof metadata.previousOwnerName === 'string' ? metadata.previousOwnerName : null;
      return {
        title: `${newOwnerName} is now owner`,
        detail: previousOwnerName
          ? `Ownership transferred by ${previousOwnerName}`
          : 'Household ownership transferred',
        icon: '★',
      };
    }
    default:
      return { title: 'Household updated', detail: 'A household action was recorded', icon: '•' };
  }
}

function formatActivityTime(activity: Activity): string {
  try {
    const date = activity.createdAt.toDate();
    return new Intl.DateTimeFormat('en-IE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return 'Just now';
  }
}

export function ActivityScreen() {
  const { householdId } = useHousehold();
  const { activities, loading, error } = useActivities(householdId);

  if (loading) {
    return <LoadingView label="Loading activity…" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <Text style={styles.title}>Activity</Text>
      <Text style={styles.subtitle}>The latest changes across your household.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const copy = activityCopy(item);
          return (
            <AppCard style={styles.activityCard}>
              <View style={styles.iconBubble}>
                <Text style={styles.icon}>{copy.icon}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.activityTitle}>{copy.title}</Text>
                <Text style={styles.detail}>{copy.detail}</Text>
                <Text style={styles.time}>{formatActivityTime(item)}</Text>
              </View>
            </AppCard>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyText}>Inventory and shopping activity will appear here.</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.md },
  list: { gap: spacing.md, paddingVertical: spacing.lg, paddingBottom: 32, flexGrow: 1 },
  activityCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  copy: { flex: 1 },
  activityTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  detail: { color: colors.textMuted, marginTop: spacing.xs },
  time: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 12 },
  empty: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
