import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/common/AppButton';
import { AppCard } from '../../components/common/AppCard';
import { LoadingView } from '../../components/common/LoadingView';
import { Screen } from '../../components/common/Screen';
import { BudgetModal } from '../../components/finance/BudgetModal';
import { ExpenseModal } from '../../components/finance/ExpenseModal';
import { expenseCategoryLabel } from '../../constants/expenseCategories';
import { useAuth } from '../../context/AuthContext';
import { useHousehold } from '../../context/HouseholdContext';
import { useHouseholdDetails } from '../../hooks/useHouseholdDetails';
import { useHouseholdFinance } from '../../hooks/useHouseholdFinance';
import * as financeService from '../../services/firebase/financeService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { ExpenseCategoryId, HouseholdExpense } from '../../types/domain';
import { toUserMessage } from '../../utils/firebaseError';
import { formatMoney } from '../../utils/money';

function expenseDateLabel(expense: HouseholdExpense): string {
  try {
    return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      expense.expenseDate.toDate(),
    );
  } catch {
    return 'Recent';
  }
}

export function FinanceScreen() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const householdDetails = useHouseholdDetails(householdId, user?.uid);
  const finance = useHouseholdFinance(householdId);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const memberNames = useMemo(
    () => new Map(householdDetails.members.map((member) => [member.userId, member.displayName || member.email])),
    [householdDetails.members],
  );
  const categoryRows = useMemo(
    () =>
      Object.entries(finance.categorySpendCents)
        .filter((entry): entry is [ExpenseCategoryId, number] => typeof entry[1] === 'number' && entry[1] > 0)
        .sort((left, right) => right[1] - left[1]),
    [finance.categorySpendCents],
  );

  if (finance.loading || householdDetails.loading) {
    return <LoadingView label="Loading household finances…" />;
  }
  if (!householdId || !user) {
    return null;
  }

  const activeHouseholdId = householdId;
  const activeUser = user;
  const canEditBudget =
    householdDetails.currentRole === 'owner' || householdDetails.currentRole === 'admin';
  const budgetLimit = finance.budget?.totalLimitCents ?? 0;
  const budgetRemaining = budgetLimit - finance.monthSpendCents;
  const budgetPercent = budgetLimit > 0 ? Math.min(100, (finance.monthSpendCents / budgetLimit) * 100) : 0;

  async function createExpense(input: financeService.CreateHouseholdExpenseInput) {
    try {
      const result = await financeService.createHouseholdExpense(input);
      const currentUserDebt = result.debts.find((debt) => debt.fromUserId === activeUser.uid);
      const owedToCurrentUser = result.debts
        .filter((debt) => debt.toUserId === activeUser.uid)
        .reduce((sum, debt) => sum + debt.amountCents, 0);
      if (currentUserDebt) {
        Alert.alert('Expense saved', `Your share is ${formatMoney(currentUserDebt.amountCents)} owed to ${memberNames.get(currentUserDebt.toUserId) ?? 'the payer'}.`);
      } else if (owedToCurrentUser > 0) {
        Alert.alert('Expense saved', `${formatMoney(owedToCurrentUser)} is owed back to you by the other participants.`);
      }
      return result;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async function saveBudget(input: financeService.UpsertMonthlyBudgetInput) {
    try {
      await financeService.upsertMonthlyBudget(input);
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  function personalDebtCopy(expense: HouseholdExpense): string | null {
    const debt = expense.debts.find(
      (value) => value.fromUserId === activeUser.uid && value.amountCents > (value.settledCents ?? 0),
    );
    if (debt) {
      const outstanding = debt.amountCents - (debt.settledCents ?? 0);
      return `You owe ${formatMoney(outstanding)} to ${memberNames.get(debt.toUserId) ?? 'the payer'}`;
    }
    if (expense.paidBy === activeUser.uid) {
      const outstanding = expense.debts.reduce(
        (sum, value) => sum + Math.max(0, value.amountCents - (value.settledCents ?? 0)),
        0,
      );
      if (outstanding > 0) {
        return `${formatMoney(outstanding)} owed back to you`;
      }
    }
    return null;
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Finance</Text>
          <Text style={styles.subtitle}>All household spending · {finance.period}</Text>
        </View>
        <AppButton title="Add expense" onPress={() => setExpenseOpen(true)} style={styles.headerButton} />
      </View>

      {finance.error || householdDetails.error ? (
        <Text style={styles.error}>{finance.error ?? householdDetails.error}</Text>
      ) : null}

      <AppCard style={styles.heroCard}>
        <Text style={styles.heroLabel}>SPENT THIS MONTH</Text>
        <Text style={styles.heroValue}>{formatMoney(finance.monthSpendCents)}</Text>
        {budgetLimit > 0 ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${budgetPercent}%` as `${number}%` }]} />
            </View>
            <View style={styles.heroFooter}>
              <Text style={styles.heroMeta}>Budget {formatMoney(budgetLimit)}</Text>
              <Text style={budgetRemaining >= 0 ? styles.remaining : styles.overBudget}>
                {budgetRemaining >= 0
                  ? `${formatMoney(budgetRemaining)} left`
                  : `${formatMoney(Math.abs(budgetRemaining))} over`}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.heroMeta}>No monthly budget set yet.</Text>
        )}
        {canEditBudget ? (
          <AppButton
            title={finance.budget ? 'Edit budget' : 'Set monthly budget'}
            variant="secondary"
            onPress={() => setBudgetOpen(true)}
          />
        ) : null}
      </AppCard>

      <Text style={styles.sectionTitle}>Spending by category</Text>
      <AppCard style={styles.card}>
        {categoryRows.length === 0 ? (
          <Text style={styles.emptyText}>No household expenses have been recorded this month.</Text>
        ) : (
          categoryRows.map(([categoryId, spend], index) => {
            const limit = finance.budget?.categoryLimitsCents[categoryId];
            const percent = typeof limit === 'number' && limit > 0 ? Math.round((spend / limit) * 100) : null;
            return (
              <View key={categoryId} style={[styles.categoryRow, index > 0 ? styles.divider : undefined]}>
                <View style={styles.categoryCopy}>
                  <Text style={styles.categoryName}>{expenseCategoryLabel(categoryId)}</Text>
                  {percent !== null ? <Text style={styles.categoryMeta}>{percent}% of {formatMoney(limit ?? 0)} budget</Text> : null}
                </View>
                <Text style={styles.categoryAmount}>{formatMoney(spend)}</Text>
              </View>
            );
          })
        )}
      </AppCard>

      <Text style={styles.sectionTitle}>Recent expenses</Text>
      {finance.expenses.length === 0 ? (
        <AppCard style={styles.card}>
          <Text style={styles.emptyTitle}>No shared spending yet</Text>
          <Text style={styles.emptyText}>Add groceries, rent, dining out, commute, electronics or any other household expense.</Text>
        </AppCard>
      ) : (
        finance.expenses.slice(0, 20).map((expense) => {
          const debtCopy = personalDebtCopy(expense);
          return (
            <AppCard key={expense.id} style={styles.expenseCard}>
              <View style={styles.expenseHeader}>
                <View style={styles.expenseCopy}>
                  <Text style={styles.expenseTitle}>{expense.title}</Text>
                  <Text style={styles.expenseMeta}>
                    {expenseCategoryLabel(expense.categoryId)} · {expenseDateLabel(expense)}
                  </Text>
                  <Text style={styles.expenseMeta}>
                    Paid by {expense.paidByName || memberNames.get(expense.paidBy) || 'Household member'}
                    {expense.merchantName ? ` · ${expense.merchantName}` : ''}
                  </Text>
                </View>
                <Text style={styles.expenseAmount}>{formatMoney(expense.totalPaidCents)}</Text>
              </View>
              {expense.discountCents > 0 ? (
                <Text style={styles.discount}>Bill discount applied: −{formatMoney(expense.discountCents)}</Text>
              ) : null}
              {debtCopy ? <Text style={styles.debt}>{debtCopy}</Text> : null}
            </AppCard>
          );
        })
      )}

      <ExpenseModal
        visible={expenseOpen}
        householdId={activeHouseholdId}
        currentUserId={activeUser.uid}
        members={householdDetails.members}
        onClose={() => setExpenseOpen(false)}
        onSubmit={createExpense}
      />
      <BudgetModal
        visible={budgetOpen}
        householdId={activeHouseholdId}
        period={finance.period}
        budget={finance.budget}
        onClose={() => setBudgetOpen(false)}
        onSubmit={saveBudget}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
  headerButton: { minHeight: 44, paddingHorizontal: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.md },
  heroCard: { backgroundColor: colors.dark, borderColor: colors.dark, gap: spacing.md, marginBottom: spacing.xl },
  heroLabel: { color: '#B8C3D7', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  heroValue: { color: colors.white, fontSize: 34, fontWeight: '900' },
  heroMeta: { color: '#B8C3D7', fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 99, backgroundColor: '#34425D', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: '#7FE0A3' },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  remaining: { color: '#7FE0A3', fontWeight: '700' },
  overBudget: { color: '#FF9C9C', fontWeight: '700' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
  card: { marginBottom: spacing.xl },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.xs },
  categoryCopy: { flex: 1 },
  categoryName: { color: colors.text, fontWeight: '700' },
  categoryMeta: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  categoryAmount: { color: colors.text, fontWeight: '800' },
  expenseCard: { marginBottom: spacing.md, gap: spacing.sm },
  expenseHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  expenseCopy: { flex: 1 },
  expenseTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  expenseMeta: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs, lineHeight: 17 },
  expenseAmount: { color: colors.text, fontSize: 17, fontWeight: '900' },
  discount: { color: colors.success, fontSize: 12, fontWeight: '700' },
  debt: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  emptyText: { color: colors.textMuted, lineHeight: 20 },
});
