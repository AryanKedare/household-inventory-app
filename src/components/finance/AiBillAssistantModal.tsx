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
import {
  centsToEuros,
  eurosToCents,
  formatMoney,
  parseDecimalInput,
} from '../../utils/money';

interface EditableLine {
  key: string;
  description: string;
  amount: string;
  participantIds: string[];
}

interface AiBillAssistantModalProps {
  visible: boolean;
  householdId: string;
  currentUserId: string;
  members: HouseholdMember[];
  onClose: () => void;
  onSubmit: (input: CreateHouseholdExpenseInput) => Promise<CreateHouseholdExpenseResult>;
}

export function AiBillAssistantModal({
  visible,
  householdId,
  currentUserId,
  members,
  onClose,
  onSubmit,
}: AiBillAssistantModalProps) {
  const [billText, setBillText] = useState('');
  const [draft, setDraft] = useState<aiService.BillDraft | null>(null);
  const [title, setTitle] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [categoryId, setCategoryId] = useState<ExpenseCategoryId>('other');
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [expenseDate, setExpenseDate] = useState(formatDateInput());
  const [discount, setDiscount] = useState('0.00');
  const [fees, setFees] = useState('0.00');
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setBillText('');
    setDraft(null);
    setTitle('');
    setMerchantName('');
    setCategoryId('other');
    setPaidBy(currentUserId);
    setExpenseDate(formatDateInput());
    setDiscount('0.00');
    setFees('0.00');
    setLines([]);
    setAnalyzing(false);
    setSaving(false);
    setError(null);
  }, [currentUserId, visible]);

  async function analyze() {
    if (billText.trim().length < 5) {
      setError('Paste or type the bill details first.');
      return;
    }
    try {
      setAnalyzing(true);
      setError(null);
      const result = await aiService.analyzeHouseholdBillText({
        householdId,
        billText: billText.trim(),
      });
      setDraft(result);
      setTitle(result.title);
      setMerchantName(result.merchantName);
      setCategoryId(result.categoryId);
      setDiscount(centsToEuros(result.discountCents).toFixed(2));
      setFees(centsToEuros(result.feeCents).toFixed(2));
      setLines(
        result.lineItems.map((line, index) => ({
          key: `${index}-${line.description}`,
          description: line.description,
          amount: centsToEuros(line.totalCents).toFixed(2),
          participantIds: line.participantIds,
        })),
      );
    } catch (aiError) {
      setError(toUserMessage(aiError));
    } finally {
      setAnalyzing(false);
    }
  }

  function updateLine(index: number, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function toggleParticipant(index: number, userId: string) {
    setLines((current) =>
      current.map((line, currentIndex) => {
        if (currentIndex !== index) {
          return line;
        }
        return {
          ...line,
          participantIds: line.participantIds.includes(userId)
            ? line.participantIds.filter((id) => id !== userId)
            : [...line.participantIds, userId],
        };
      }),
    );
  }

  async function saveReviewedDraft() {
    const dateIso = parseDateInput(expenseDate);
    const parsedDiscount = parseDecimalInput(discount);
    const parsedFees = parseDecimalInput(fees);
    if (!title.trim()) {
      setError('Enter an expense name.');
      return;
    }
    if (!dateIso) {
      setError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
      setError('Enter a valid bill discount.');
      return;
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0) {
      setError('Enter valid tax or fees.');
      return;
    }
    if (lines.length === 0) {
      setError('The reviewed bill needs at least one line item.');
      return;
    }

    const lineItems: NonNullable<CreateHouseholdExpenseInput['lineItems']> = [];
    for (const [index, line] of lines.entries()) {
      const amount = parseDecimalInput(line.amount);
      if (!line.description.trim()) {
        setError(`Line ${index + 1} needs a description.`);
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(`Line ${index + 1} needs a valid amount.`);
        return;
      }
      if (line.participantIds.length === 0) {
        setError(`Choose who should share line ${index + 1}.`);
        return;
      }
      lineItems.push({
        description: line.description.trim(),
        totalCents: eurosToCents(amount),
        participantIds: [...new Set(line.participantIds)],
      });
    }

    const subtotalCents = lineItems.reduce((sum, line) => sum + line.totalCents, 0);
    const discountCents = eurosToCents(parsedDiscount);
    if (discountCents > subtotalCents) {
      setError('The bill discount cannot exceed the reviewed line-item subtotal.');
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
        lineItems,
        notes: 'Created from an AI-assisted bill draft after user review.',
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save the reviewed bill.');
    } finally {
      setSaving(false);
    }
  }

  const reviewedSubtotal = lines.reduce((sum, line) => {
    const amount = parseDecimalInput(line.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + eurosToCents(amount) : sum;
  }, 0);
  const parsedDiscount = parseDecimalInput(discount);
  const parsedFees = parseDecimalInput(fees);
  const reviewedTotal = Math.max(
    0,
    reviewedSubtotal -
      (Number.isFinite(parsedDiscount) && parsedDiscount > 0 ? eurosToCents(parsedDiscount) : 0) +
      (Number.isFinite(parsedFees) && parsedFees > 0 ? eurosToCents(parsedFees) : 0),
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={saving || analyzing ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>AI BILL ASSISTANT</Text>
            <Text style={styles.title}>Turn bill text into a Dutch split</Text>
            <Text style={styles.subtitle}>
              Paste a receipt, restaurant breakdown, utility bill or free-form note. AI extracts a draft; you review every amount and participant before HomeStock calculates the real split.
            </Text>

            {!draft ? (
              <>
                <AppInput
                  label="Bill / receipt text"
                  value={billText}
                  onChangeText={setBillText}
                  multiline
                  placeholder={'Example:\nAryan burger €15\nSam pasta €10\nShared dessert €8\nDiscount €5\nTotal €28'}
                  editable={!analyzing}
                  style={styles.billInput}
                />
                <View style={styles.privacyNote}>
                  <Text style={styles.privacyTitle}>AI privacy</Text>
                  <Text style={styles.privacyText}>
                    The text you submit is sent to the configured Groq model for extraction. Do not paste card numbers, bank details or other unnecessary sensitive information.
                  </Text>
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.actions}>
                  <AppButton title="Cancel" variant="secondary" onPress={onClose} disabled={analyzing} style={styles.action} />
                  <AppButton title="Analyze with AI" onPress={() => void analyze()} loading={analyzing} style={styles.action} />
                </View>
              </>
            ) : (
              <>
                {draft.warnings.length > 0 ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningTitle}>Review required</Text>
                    {draft.warnings.map((warning, index) => (
                      <Text key={`${warning}-${index}`} style={styles.warningText}>• {warning}</Text>
                    ))}
                  </View>
                ) : null}

                <AppInput label="Expense" value={title} onChangeText={setTitle} editable={!saving} />
                <AppInput label="Merchant / payee" value={merchantName} onChangeText={setMerchantName} editable={!saving} />
                <AppInput label="Date" value={expenseDate} onChangeText={setExpenseDate} placeholder="YYYY-MM-DD" autoCapitalize="none" editable={!saving} />

                <View style={styles.group}>
                  <Text style={styles.label}>Category</Text>
                  <View style={styles.chips}>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <Pressable
                        key={category.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: category.id === categoryId }}
                        onPress={() => setCategoryId(category.id)}
                        disabled={saving}
                        style={[styles.chip, category.id === categoryId ? styles.chipSelected : undefined]}
                      >
                        <Text style={category.id === categoryId ? styles.chipTextSelected : styles.chipText}>
                          {category.icon} {category.label}
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
                        onPress={() => setPaidBy(member.userId)}
                        disabled={saving}
                        style={[styles.chip, member.userId === paidBy ? styles.chipSelected : undefined]}
                      >
                        <Text style={member.userId === paidBy ? styles.chipTextSelected : styles.chipText}>
                          {member.displayName || member.email}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.group}>
                  <Text style={styles.sectionTitle}>Review every line</Text>
                  {lines.map((line, index) => (
                    <View key={line.key} style={styles.lineCard}>
                      <Text style={styles.lineNumber}>LINE {index + 1}</Text>
                      <AppInput
                        label="Description"
                        value={line.description}
                        onChangeText={(value) => updateLine(index, { description: value })}
                        editable={!saving}
                      />
                      <AppInput
                        label="Amount (€)"
                        value={line.amount}
                        onChangeText={(value) => updateLine(index, { amount: value })}
                        keyboardType="decimal-pad"
                        editable={!saving}
                      />
                      <Text style={styles.label}>Who shared this?</Text>
                      <View style={styles.chips}>
                        {members.map((member) => {
                          const selected = line.participantIds.includes(member.userId);
                          return (
                            <Pressable
                              key={member.userId}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              disabled={saving}
                              onPress={() => toggleParticipant(index, member.userId)}
                              style={[styles.chip, selected ? styles.chipSelected : undefined]}
                            >
                              <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                                {member.displayName || member.email}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>

                <AppInput label="Bill discount (€)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" editable={!saving} />
                <AppInput label="Tax / service / delivery fees (€)" value={fees} onChangeText={setFees} keyboardType="decimal-pad" editable={!saving} />

                <View style={styles.summaryBox}>
                  <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Reviewed item subtotal</Text><Text style={styles.summaryValue}>{formatMoney(reviewedSubtotal)}</Text></View>
                  <View style={styles.summaryRow}><Text style={styles.summaryLabel}>AI-parsed bill total</Text><Text style={styles.summaryValue}>{formatMoney(draft.calculatedTotalCents)}</Text></View>
                  {draft.statedTotalCents > 0 ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total stated in bill</Text><Text style={styles.summaryValue}>{formatMoney(draft.statedTotalCents)}</Text></View> : null}
                  <View style={[styles.summaryRow, styles.summaryTotal]}><Text style={styles.totalLabel}>Reviewed total to split</Text><Text style={styles.totalValue}>{formatMoney(reviewedTotal)}</Text></View>
                </View>

                <Text style={styles.disclaimer}>
                  AI does not calculate the final debts. After you save this reviewed draft, HomeStock’s deterministic backend allocates the discount/fees and calculates who owes the payer.
                </Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.actions}>
                  <AppButton title="Start over" variant="secondary" onPress={() => setDraft(null)} disabled={saving} style={styles.action} />
                  <AppButton title="Save reviewed bill" onPress={() => void saveReviewedDraft()} loading={saving} style={styles.action} />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11, 18, 32, 0.52)' },
  sheet: { maxHeight: '96%', backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handle: { width: 42, height: 5, borderRadius: 99, backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.md },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 44 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  billInput: { minHeight: 180, textAlignVertical: 'top', paddingTop: spacing.md },
  privacyNote: { borderRadius: 14, backgroundColor: '#EEF3FF', padding: spacing.md, gap: spacing.xs },
  privacyTitle: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  privacyText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  warningBox: { borderRadius: 14, backgroundColor: '#FFF4E5', padding: spacing.md, gap: spacing.xs },
  warningTitle: { color: '#8A4B00', fontWeight: '900' },
  warningText: { color: '#6B3C00', fontSize: 12, lineHeight: 18 },
  group: { gap: spacing.sm },
  label: { color: colors.text, fontWeight: '700', fontSize: 14 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 9, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.white, fontSize: 12, fontWeight: '700' },
  lineCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.md },
  lineNumber: { color: colors.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1.1 },
  summaryBox: { backgroundColor: colors.surfaceMuted, borderRadius: 18, padding: spacing.lg, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { color: colors.textMuted, flex: 1 },
  summaryValue: { color: colors.text, fontWeight: '700' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.xs },
  totalLabel: { color: colors.text, fontWeight: '900' },
  totalValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  disclaimer: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
