import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../common/AppButton';
import { AppCard } from '../common/AppCard';
import { SettlementModal } from './SettlementModal';
import * as financeService from '../../services/firebase/financeService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { ExpenseDebt, HouseholdExpense, HouseholdMember } from '../../types/domain';
import { toUserMessage } from '../../utils/firebaseError';
import { formatMoney } from '../../utils/money';

interface DebtSelection {
  expense: HouseholdExpense;
  debt: ExpenseDebt;
}

interface DebtSettlementSectionProps {
  householdId: string;
  currentUserId: string;
  members: HouseholdMember[];
  expenses: HouseholdExpense[];
}

export function DebtSettlementSection({
  householdId,
  currentUserId,
  members,
  expenses,
}: DebtSettlementSectionProps) {
  const [selected, setSelected] = useState<DebtSelection | null>(null);
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.userId, member.displayName || member.email])),
    [members],
  );

  const relevantDebts = useMemo(
    () =>
      expenses.flatMap((expense) =>
        expense.debts.flatMap((debt) => {
          const outstandingCents = Math.max(0, debt.amountCents - (debt.settledCents ?? 0));
          if (
            outstandingCents <= 0 ||
            (debt.fromUserId !== currentUserId && debt.toUserId !== currentUserId)
          ) {
            return [];
          }
          return [{ expense, debt, outstandingCents }];
        }),
      ),
    [currentUserId, expenses],
  );

  if (relevantDebts.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Go Dutch balances</Text>
        <AppCard>
          <Text style={styles.clearTitle}>You’re settled up</Text>
          <Text style={styles.muted}>No outstanding shared-expense balances involve you.</Text>
        </AppCard>
      </View>
    );
  }

  async function recordSettlement(input: financeService.RecordExpenseSettlementInput) {
    try {
      const result = await financeService.recordExpenseSettlement(input);
      Alert.alert(
        result.remainingCents > 0 ? 'Repayment recorded' : 'Debt settled',
        result.remainingCents > 0
          ? `${formatMoney(result.remainingCents)} remains outstanding.`
          : 'This shared-expense balance is fully settled.',
      );
      return result;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Go Dutch balances</Text>
      <View style={styles.list}>
        {relevantDebts.map(({ expense, debt, outstandingCents }) => {
          const youOwe = debt.fromUserId === currentUserId;
          const otherUserId = youOwe ? debt.toUserId : debt.fromUserId;
          const otherName = memberNames.get(otherUserId) ?? 'Household member';
          return (
            <AppCard key={`${expense.id}-${debt.fromUserId}`} style={styles.debtCard}>
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.expenseTitle}>{expense.title}</Text>
                  <Text style={styles.relationship}>
                    {youOwe ? `You owe ${otherName}` : `${otherName} owes you`}
                  </Text>
                  {(debt.settledCents ?? 0) > 0 ? (
                    <Text style={styles.muted}>
                      {formatMoney(debt.settledCents ?? 0)} already repaid of {formatMoney(debt.amountCents)}
                    </Text>
                  ) : null}
                </View>
                <Text style={youOwe ? styles.oweAmount : styles.receiveAmount}>
                  {formatMoney(outstandingCents)}
                </Text>
              </View>
              <AppButton
                title={youOwe ? 'Record payment' : 'Record payment received'}
                variant="secondary"
                onPress={() => setSelected({ expense, debt })}
              />
            </AppCard>
          );
        })}
      </View>

      <SettlementModal
        visible={selected !== null}
        householdId={householdId}
        expense={selected?.expense ?? null}
        debt={selected?.debt ?? null}
        debtorName={selected ? memberNames.get(selected.debt.fromUserId) ?? 'Household member' : ''}
        payeeName={selected ? memberNames.get(selected.debt.toUserId) ?? 'Household member' : ''}
        onClose={() => setSelected(null)}
        onSubmit={recordSettlement}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
  list: { gap: spacing.md },
  debtCard: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  copy: { flex: 1 },
  expenseTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  relationship: { color: colors.text, marginTop: spacing.xs, fontSize: 13, fontWeight: '700' },
  muted: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 12, lineHeight: 18 },
  oweAmount: { color: colors.danger, fontSize: 18, fontWeight: '900' },
  receiveAmount: { color: colors.success, fontSize: 18, fontWeight: '900' },
  clearTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
