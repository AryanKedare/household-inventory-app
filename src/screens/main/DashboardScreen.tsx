import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../../components/common/AppCard';
import { LoadingView } from '../../components/common/LoadingView';
import { Screen } from '../../components/common/Screen';
import { useAuth } from '../../context/AuthContext';
import { useHousehold } from '../../context/HouseholdContext';
import { useDashboardInsights } from '../../hooks/useDashboardInsights';
import { useInventory } from '../../hooks/useInventory';
import { useShoppingList } from '../../hooks/useShoppingList';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { formatMoney } from '../../utils/money';

export function DashboardScreen() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const inventory = useInventory(householdId);
  const shopping = useShoppingList(householdId);
  const insights = useDashboardInsights(householdId);
  const name = user?.displayName?.split(' ')[0] ?? 'there';

  if (inventory.loading || shopping.loading || insights.loading) {
    return <LoadingView label="Loading your household…" />;
  }

  const metrics = [
    { label: 'Available', value: inventory.counts.available },
    { label: 'Low stock', value: inventory.counts.low_stock },
    { label: 'Out of stock', value: inventory.counts.out_of_stock },
    { label: 'Shopping', value: shopping.items.length },
  ];

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>YOUR HOUSEHOLD</Text>
      <Text style={styles.title}>Hi {name} 👋</Text>
      <Text style={styles.subtitle}>Here is what your household needs right now.</Text>

      <View style={styles.grid}>
        {metrics.map((metric) => (
          <AppCard key={metric.label} style={styles.metricCard}>
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </AppCard>
        ))}
      </View>

      <AppCard style={styles.shoppingCard}>
        <Text style={styles.cardTitle}>Shopping estimate</Text>
        <Text style={styles.total}>{formatMoney(shopping.estimatedTotalCents)}</Text>
        <Text style={styles.muted}>
          {shopping.items.length === 0
            ? 'No items on the shopping list yet.'
            : `${shopping.items.length} item${shopping.items.length === 1 ? '' : 's'} waiting to be bought.`}
        </Text>
      </AppCard>

      <View style={styles.insightGrid}>
        <AppCard style={styles.insightCard}>
          <Text style={styles.cardTitle}>This month</Text>
          <Text style={styles.insightValue}>{formatMoney(insights.monthlySpendCents)}</Text>
          <Text style={styles.muted}>Recorded household spending</Text>
        </AppCard>
        <AppCard style={styles.insightCard}>
          <Text style={styles.cardTitle}>Most used store</Text>
          <Text style={styles.insightValue}>{insights.mostUsedStore ?? '—'}</Text>
          <Text style={styles.muted}>Based on this month's purchases</Text>
        </AppCard>
      </View>

      {insights.biggestIncrease ? (
        <AppCard style={styles.priceAlert}>
          <Text style={styles.cardTitle}>Biggest price increase</Text>
          <Text style={styles.priceAlertTitle}>{insights.biggestIncrease.itemName}</Text>
          <Text style={styles.muted}>
            +{insights.biggestIncrease.percentageChange ?? 0}% · {formatMoney(
              insights.biggestIncrease.previousPriceCents,
              insights.biggestIncrease.currency,
            )} → {formatMoney(insights.biggestIncrease.newPriceCents, insights.biggestIncrease.currency)}
          </Text>
        </AppCard>
      ) : null}

      {inventory.error || shopping.error ? (
        <Text style={styles.error}>Some household data could not be refreshed.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 12, letterSpacing: 1.5, fontWeight: '800' },
  title: { marginTop: spacing.sm, color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  metricCard: { width: '47%', minHeight: 110, justifyContent: 'center' },
  metricValue: { color: colors.text, fontSize: 30, fontWeight: '800' },
  metricLabel: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 14 },
  shoppingCard: { marginTop: spacing.lg, gap: spacing.sm },
  insightGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  insightCard: { flex: 1, minHeight: 132, gap: spacing.sm },
  insightValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  priceAlert: { marginTop: spacing.md, gap: spacing.sm },
  priceAlertTitle: { color: colors.danger, fontSize: 20, fontWeight: '800' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  total: { color: colors.primary, fontSize: 28, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14 },
  error: { color: colors.danger, marginTop: spacing.lg },
});
