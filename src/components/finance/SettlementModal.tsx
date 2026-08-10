import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../common/AppButton';
import { AppInput } from '../common/AppInput';
import type {
  RecordExpenseSettlementInput,
  RecordExpenseSettlementResult,
} from '../../services/firebase/financeService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { ExpenseDebt, HouseholdExpense } from '../../types/domain';
import { centsToEuros, eurosToCents, formatMoney, parseDecimalInput } from '../../utils/money';

interface SettlementModalProps {
  visible: boolean;
  householdId: string;
  expense: HouseholdExpense | null;
  debt: ExpenseDebt | null;
  debtorName: string;
  payeeName: string;
  onClose: () => void;
  onSubmit: (input: RecordExpenseSettlementInput) => Promise<RecordExpenseSettlementResult>;
}

export function SettlementModal({
  visible,
  householdId,
  expense,
  debt,
  debtorName,
  payeeName,
  onClose,
  onSubmit,
}: SettlementModalProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstandingCents = debt ? Math.max(0, debt.amountCents - (debt.settledCents ?? 0)) : 0;

  useEffect(() => {
    if (!visible || !debt) {
      return;
    }
    const outstanding = Math.max(0, debt.amountCents - (debt.settledCents ?? 0));
    setAmount(centsToEuros(outstanding).toFixed(2));
    setNote('');
    setSaving(false);
    setError(null);
  }, [debt, visible]);

  if (!expense || !debt) {
    return null;
  }

  async function submit() {
    const parsed = parseDecimalInput(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a repayment amount greater than zero.');
      return;
    }
    const amountCents = eurosToCents(parsed);
    if (amountCents > outstandingCents) {
      setError(`The outstanding balance is ${formatMoney(outstandingCents)}.`);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSubmit({
        householdId,
        expenseId: expense.id,
        fromUserId: debt.fromUserId,
        amountCents,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to record repayment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>GO DUTCH REPAYMENT</Text>
          <Text style={styles.title}>{expense.title}</Text>
          <Text style={styles.subtitle}>
            {debtorName} owes {payeeName} {formatMoney(outstandingCents)} outstanding.
          </Text>
          <AppInput
            label="Amount repaid (€)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!saving}
          />
          <AppInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Revolut, bank transfer, cash…"
            editable={!saving}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <AppButton title="Cancel" variant="secondary" onPress={onClose} disabled={saving} style={styles.action} />
            <AppButton title="Record repayment" onPress={() => void submit()} loading={saving} style={styles.action} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11, 18, 32, 0.52)' },
  card: { width: '100%', maxWidth: 520, backgroundColor: colors.background, borderRadius: 24, padding: spacing.xl, gap: spacing.lg },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 20 },
  error: { color: colors.danger, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
