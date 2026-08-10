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

import { AppButton } from '../common/AppButton';
import { AppInput } from '../common/AppInput';
import { EXPENSE_CATEGORIES } from '../../constants/expenseCategories';
import * as aiService from '../../services/firebase/aiService';
import type {
  CreateHouseholdExpenseInput,
  CreateHouseholdExpenseResult,
} from '../../services/firebase/financeService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { ExpenseCategoryId, HouseholdMember } from '../../types/domain';
import { formatDateInput, parseDateInput } from '../../utils/date';
import { toUserMessage } from '../../utils/firebaseError';
import { eurosToCents, formatMoney, parseDecimalInput } from '../../utils/money';

interface ExpenseModalProps {
  visible: boolean;
  householdId: string;
  currentUserId: string;
  members: HouseholdMember[];
  onClose: () => void;
  onSubmit: (input: CreateHouseholdExpenseInput) => Promise<CreateHouseholdExpenseResult>;
}

export function ExpenseModal({
  visible,
  householdId,
  currentUserId,
  members,
  onClose,
  onSubmit,
}: ExpenseModalProps) {
  const [title, setTitle] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [categoryId, setCategoryId] = useState<ExpenseCategoryId>('groceries');
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [expenseDate, setExpenseDate] = useState(formatDateInput());
  const [discount, setDiscount] = useState('0.00');
  const [fees, setFees] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [memberAmounts, setMemberAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<aiService.SuggestedCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setTitle('');
    setMerchantName('');
    setCategoryId('groceries');
    setPaidBy(currentUserId);
    setExpenseDate(formatDateInput());
    setDiscount('0.00');
    setFees('0.00');
    setNotes('');
    setMemberAmounts(Object.fromEntries(members.map((member) => [member.userId, ''])));
    setSaving(false);
    setAiBusy(false);
    setAiSuggestion(null);
    setError(null);
  }, [currentUserId, members, visible]);

  const preview = useMemo(() => {
    let subtotalCents = 0;
    for (const amount of Object.values(memberAmounts)) {
      const value = parseDecimalInput(amount);
      if (Number.isFinite(value) && value > 0) {
        subtotalCents += eurosToCents(value);
      }
    }
    const parsedDiscount = parseDecimalInput(discount);
    const parsedFees = parseDecimalInput(fees);
    const discountCents = Number.isFinite(parsedDiscount) && parsedDiscount > 0 ? eurosToCents(parsedDiscount) : 0;
    const feeCents = Number.isFinite(parsedFees) && parsedFees > 0 ? eurosToCents(parsedFees) : 0;
    return {
      subtotalCents,
      discountCents,
      feeCents,
      totalCents: Math.max(0, subtotalCents - discountCents + feeCents),
    };
  }, [discount, fees, memberAmounts]);

  function updateMemberAmount(userId: string, value: string) {
    setMemberAmounts((current) => ({ ...current, [userId]: value }));
  }

  async function suggestCategory() {
    if (!title.trim()) {
      setError('Enter the expense first so AI has something to categorize.');
      return;
    }
    try {
      setAiBusy(true);
      setError(null);
      const suggestion = await aiService.suggestExpenseCategory({
        householdId,
        title: title.trim(),
        merchantName: merchantName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setCategoryId(suggestion.categoryId);
      setAiSuggestion(suggestion);
    } catch (aiError) {
      setError(toUserMessage(aiError));
    } finally {
      setAiBusy(false);
    }
  }

  async function submit() {
    const dateIso = parseDateInput(expenseDate);
    const parsedDiscount = parseDecimalInput(discount);
    const parsedFees = parseDecimalInput(fees);

    if (!title.trim()) {
      setError('Enter a name for this expense.');
      return;
    }
    if (!dateIso) {
      setError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
      setError('Enter a valid discount.');
      return;
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0) {
      setError('Enter valid fees or tax.');
      return;
    }

    const participantSubtotals = members.flatMap((member) => {
      const parsed = parseDecimalInput(memberAmounts[member.userId] ?? '');
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return [];
      }
      return [{ userId: member.userId, subtotalCents: eurosToCents(parsed) }];
    });

    if (participantSubtotals.length === 0) {
      setError('Enter at least one person’s share before discount.');
      return;
    }
    const subtotalCents = participantSubtotals.reduce((sum, value) => sum + value.subtotalCents, 0);
    const discountCents = eurosToCents(parsedDiscount);
    if (discountCents > subtotalCents) {
      setError('The discount cannot be larger than the bill subtotal.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSubmit({
        householdId,
        title: title.trim(),
        merchantName: merchantName.trim() || undefined,
        categoryId,
        paidBy,
        expenseDate: dateIso,
        discountCents,
        feeCents: eurosToCents(parsedFees),
        participantSubtotals,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save expense.');
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
        <Pressable style={styles.backdrop} onPress={saving || aiBusy ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>HOUSEHOLD EXPENSE</Text>
            <Text style={styles.title}>Add expense / Go Dutch</Text>
            <Text style={styles.subtitle}>
              Enter each person’s amount before the bill-level discount. HomeStock applies discounts and fees proportionally and keeps the final cents exact.
            </Text>

            <AppInput label="Expense" value={title} onChangeText={setTitle} placeholder="Dinner, electricity bill, new TV…" editable={!saving && !aiBusy} />
            <AppInput label="Merchant / payee (optional)" value={merchantName} onChangeText={setMerchantName} placeholder="Restaurant, ESB, Amazon…" editable={!saving && !aiBusy} />
            <AppInput label="Date" value={expenseDate} onChangeText={setExpenseDate} placeholder="YYYY-MM-DD" autoCapitalize="none" editable={!saving && !aiBusy} />

            <View style={styles.group}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Category</Text>
                <AppButton
                  title="Suggest with AI"
                  variant="secondary"
                  loading={aiBusy}
                  disabled={saving}
                  onPress={() => void suggestCategory()}
                  style={styles.aiButton}
                />
              </View>
              {aiSuggestion ? (
                <View style={styles.aiNote}>
                  <Text style={styles.aiNoteTitle}>
                    AI suggestion · {Math.round(aiSuggestion.confidence * 100)}% confidence
                  </Text>
                  <Text style={styles.aiNoteText}>{aiSuggestion.reason}</Text>
                  <Text style={styles.aiDisclaimer}>Review AI suggestions before saving.</Text>
                </View>
              ) : null}
              <View style={styles.chips}>
                {EXPENSE_CATEGORIES.map((category) => (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category.id === categoryId }}
                    disabled={saving || aiBusy}
                    onPress={() => {
                      setCategoryId(category.id);
                      setAiSuggestion(null);
                    }}
                    style={[
                      styles.chip,
                      category.id === categoryId ? styles.chipSelected : undefined,
                    ]}
                  >
                    <Text style={styles.chipIcon}>{category.icon}</Text>
                    <Text style={category.id === categoryId ? styles.chipTextSelected : styles.chipText}>
                      {category.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Who paid?</Text>
              <View style={styles.chips}>
                {members.map((member) => (
                  <Pressable
                    key={member.userId}
                    accessibilityRole="button"
                    accessibilityState={{ selected: member.userId === paidBy }}
                    disabled={saving || aiBusy}
                    onPress={() => setPaidBy(member.userId)}
                    style={[
                      styles.chip,
                      member.userId === paidBy ? styles.chipSelected : undefined,
                    ]}
                  >
                    <Text style={member.userId === paidBy ? styles.chipTextSelected : styles.chipText}>
                      {member.displayName || member.email}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Each person’s pre-discount subtotal</Text>
              <Text style={styles.help}>Leave a person blank if they are not part of this expense.</Text>
              {members.map((member) => (
                <AppInput
                  key={member.userId}
                  label={`${member.displayName || member.email} (€)`}
                  value={memberAmounts[member.userId] ?? ''}
                  onChangeText={(value) => updateMemberAmount(member.userId, value)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  editable={!saving && !aiBusy}
                />
              ))}
            </View>

            <View style={styles.twoColumns}>
              <AppInput
                label="Bill discount (€)"
                value={discount}
                onChangeText={setDiscount}
                keyboardType="decimal-pad"
                editable={!saving && !aiBusy}
                style={styles.flexInput}
              />
              <AppInput
                label="Tax / fees (€)"
                value={fees}
                onChangeText={setFees}
                keyboardType="decimal-pad"
                editable={!saving && !aiBusy}
                style={styles.flexInput}
              />
            </View>

            <AppInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline editable={!saving && !aiBusy} />

            <View style={styles.preview}>
              <View style={styles.previewRow}><Text style={styles.previewLabel}>Subtotal</Text><Text style={styles.previewValue}>{formatMoney(preview.subtotalCents)}</Text></View>
              <View style={styles.previewRow}><Text style={styles.previewLabel}>Discount</Text><Text style={styles.discountValue}>− {formatMoney(preview.discountCents)}</Text></View>
              <View style={styles.previewRow}><Text style={styles.previewLabel}>Tax / fees</Text><Text style={styles.previewValue}>+ {formatMoney(preview.feeCents)}</Text></View>
              <View style={[styles.previewRow, styles.totalRow]}><Text style={styles.totalLabel}>Amount paid</Text><Text style={styles.totalValue}>{formatMoney(preview.totalCents)}</Text></View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <AppButton title="Cancel" variant="secondary" onPress={onClose} disabled={saving || aiBusy} style={styles.action} />
              <AppButton title="Calculate & save" onPress={() => void submit()} loading={saving} disabled={aiBusy} style={styles.action} />
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
  group: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  aiButton: { minHeight: 38, paddingHorizontal: spacing.md },
  aiNote: { backgroundColor: '#EEF3FF', borderRadius: 14, padding: spacing.md, gap: spacing.xs },
  aiNoteTitle: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  aiNoteText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  aiDisclaimer: { color: colors.textMuted, fontSize: 11 },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 9, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipIcon: { fontSize: 14 },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.white, fontSize: 12, fontWeight: '700' },
  twoColumns: { gap: spacing.md },
  flexInput: { flex: 1 },
  preview: { backgroundColor: colors.surfaceMuted, borderRadius: 18, padding: spacing.lg, gap: spacing.sm },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  previewLabel: { color: colors.textMuted },
  previewValue: { color: colors.text, fontWeight: '700' },
  discountValue: { color: colors.success, fontWeight: '700' },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.xs },
  totalLabel: { color: colors.text, fontWeight: '800' },
  totalValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  error: { color: colors.danger, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
