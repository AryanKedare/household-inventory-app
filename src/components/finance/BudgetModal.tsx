import { useEffect, useState } from 'react';
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

import { AppButton } from '../common/AppButton';
import { AppInput } from '../common/AppInput';
import { EXPENSE_CATEGORIES } from '../../constants/expenseCategories';
import type { UpsertMonthlyBudgetInput } from '../../services/firebase/financeService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { MonthlyBudget } from '../../types/domain';
import { centsToEuros, eurosToCents, parseDecimalInput } from '../../utils/money';

interface BudgetModalProps {
  visible: boolean;
  householdId: string;
  period: string;
  budget: MonthlyBudget | null;
  onClose: () => void;
  onSubmit: (input: UpsertMonthlyBudgetInput) => Promise<void>;
}

export function BudgetModal({ visible, householdId, period, budget, onClose, onSubmit }: BudgetModalProps) {
  const [totalLimit, setTotalLimit] = useState('');
  const [categoryLimits, setCategoryLimits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setTotalLimit(budget ? centsToEuros(budget.totalLimitCents).toFixed(2) : '');
    setCategoryLimits(
      Object.fromEntries(
        EXPENSE_CATEGORIES.map((category) => {
          const value = budget?.categoryLimitsCents[category.id];
          return [category.id, typeof value === 'number' ? centsToEuros(value).toFixed(2) : ''];
        }),
      ),
    );
    setSaving(false);
    setError(null);
  }, [budget, visible]);

  async function submit() {
    const parsedTotal = parseDecimalInput(totalLimit);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      setError('Enter a valid monthly household budget.');
      return;
    }

    const parsedCategories: UpsertMonthlyBudgetInput['categoryLimits'] = [];
    for (const category of EXPENSE_CATEGORIES) {
      const raw = categoryLimits[category.id]?.trim() ?? '';
      if (!raw) {
        continue;
      }
      const parsed = parseDecimalInput(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(`Enter a valid ${category.label} budget.`);
        return;
      }
      parsedCategories.push({ categoryId: category.id, limitCents: eurosToCents(parsed) });
    }

    try {
      setSaving(true);
      setError(null);
      await onSubmit({
        householdId,
        period,
        totalLimitCents: eurosToCents(parsedTotal),
        categoryLimits: parsedCategories,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save budget.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>BUDGET · {period}</Text>
            <Text style={styles.title}>Monthly household budget</Text>
            <Text style={styles.subtitle}>
              Set one overall limit and optional category limits. Categories include all household spending, not only groceries.
            </Text>

            <AppInput
              label="Overall monthly budget (€)"
              value={totalLimit}
              onChangeText={setTotalLimit}
              keyboardType="decimal-pad"
              placeholder="0.00"
              editable={!saving}
            />

            <Text style={styles.sectionLabel}>OPTIONAL CATEGORY LIMITS</Text>
            {EXPENSE_CATEGORIES.map((category) => (
              <AppInput
                key={category.id}
                label={`${category.icon} ${category.label} (€)`}
                value={categoryLimits[category.id] ?? ''}
                onChangeText={(value) =>
                  setCategoryLimits((current) => ({ ...current, [category.id]: value }))
                }
                keyboardType="decimal-pad"
                placeholder="No limit"
                editable={!saving}
              />
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <AppButton title="Cancel" variant="secondary" onPress={onClose} disabled={saving} style={styles.action} />
              <AppButton title="Save budget" onPress={() => void submit()} loading={saving} style={styles.action} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11, 18, 32, 0.52)' },
  sheet: { maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handle: { width: 42, height: 5, borderRadius: 99, backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.md },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 40 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  sectionLabel: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginTop: spacing.sm },
  error: { color: colors.danger, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
