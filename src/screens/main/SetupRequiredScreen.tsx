import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../../components/common/AppCard';
import { Screen } from '../../components/common/Screen';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const variables = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

export function SetupRequiredScreen() {
  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>DEVELOPER SETUP</Text>
      </View>
      <Text style={styles.title}>HomeStock foundation is running.</Text>
      <Text style={styles.subtitle}>
        Add a Firebase app configuration before authentication is enabled. The app intentionally
        stays usable enough to explain what is missing instead of crashing on startup.
      </Text>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Required environment variables</Text>
        {variables.map((variable) => (
          <Text key={variable} selectable style={styles.code}>
            {variable}
          </Text>
        ))}
      </AppCard>

      <Text style={styles.hint}>
        Copy .env.example to .env, add the Firebase values, then restart Expo.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: spacing.lg },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EEFF',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeText: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800', lineHeight: 38 },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 24 },
  card: { gap: spacing.md },
  cardTitle: { color: colors.text, fontSize: typography.subheading, fontWeight: '700' },
  code: { color: colors.dark, fontFamily: 'monospace', fontSize: 12 },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
