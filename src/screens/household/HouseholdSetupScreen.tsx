import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/common/AppButton';
import { AppCard } from '../../components/common/AppCard';
import { AppInput } from '../../components/common/AppInput';
import { Screen } from '../../components/common/Screen';
import { useAuth } from '../../context/AuthContext';
import { createHouseholdSchema, joinHouseholdSchema } from '../../schemas/household';
import * as householdService from '../../services/firebase/householdService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toUserMessage } from '../../utils/firebaseError';

export function HouseholdSetupScreen() {
  const { signOut } = useAuth();
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<'create' | 'join' | null>(null);

  async function create() {
    const parsed = createHouseholdSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a household name.');
      return;
    }

    try {
      setError(null);
      setWorking('create');
      await householdService.createHousehold(parsed.data.name);
    } catch (nextError) {
      setError(toUserMessage(nextError));
    } finally {
      setWorking(null);
    }
  }

  async function join() {
    const parsed = joinHouseholdSchema.safeParse({ inviteCode });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid invite code.');
      return;
    }

    try {
      setError(null);
      setWorking('join');
      await householdService.joinHousehold(parsed.data.inviteCode);
    } catch (nextError) {
      setError(toUserMessage(nextError));
    } finally {
      setWorking(null);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>ONE LAST STEP</Text>
      <Text style={styles.title}>Set up your household</Text>
      <Text style={styles.subtitle}>
        Create a new household or join people you live with using their invite code.
      </Text>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Create household</Text>
        <AppInput
          label="Household name"
          placeholder="Apartment B307"
          value={name}
          onChangeText={setName}
          maxLength={80}
        />
        <AppButton title="Create household" onPress={() => void create()} loading={working === 'create'} />
      </AppCard>

      <View style={styles.orRow}>
        <View style={styles.line} />
        <Text style={styles.or}>OR</Text>
        <View style={styles.line} />
      </View>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Join household</Text>
        <AppInput
          label="Invite code"
          placeholder="B307XY"
          autoCapitalize="characters"
          value={inviteCode}
          onChangeText={setInviteCode}
          maxLength={6}
        />
        <AppButton title="Join household" variant="secondary" onPress={() => void join()} loading={working === 'join'} />
      </AppCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 12, letterSpacing: 1.5, fontWeight: '800' },
  title: { marginTop: spacing.sm, color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  card: { marginTop: spacing.xl, gap: spacing.lg },
  cardTitle: { color: colors.text, fontSize: typography.subheading, fontWeight: '700' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  line: { height: 1, backgroundColor: colors.border, flex: 1 },
  or: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  error: { color: colors.danger, marginTop: spacing.lg, lineHeight: 20 },
});
