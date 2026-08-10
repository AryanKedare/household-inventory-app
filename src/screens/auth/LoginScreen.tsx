import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/common/AppButton';
import { AppInput } from '../../components/common/AppInput';
import { Screen } from '../../components/common/Screen';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { loginSchema, type LoginInput } from '../../schemas/auth';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toUserMessage } from '../../utils/firebaseError';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await signIn(email, password);
    } catch (error) {
      setError('root', { message: toUserMessage(error) });
    }
  });

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>HOMESTOCK</Text>
        <Text style={styles.title}>Everything at home, in one place.</Text>
        <Text style={styles.subtitle}>Sign in to your household inventory and shared shopping list.</Text>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onBlur, onChange, value } }) => (
            <AppInput
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value } }) => (
            <AppInput
              label="Password"
              secureTextEntry
              autoComplete="current-password"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />
        {errors.root?.message ? <Text style={styles.error}>{errors.root.message}</Text> : null}
        <AppButton title="Sign in" onPress={onSubmit} loading={isSubmitting} />
        <AppButton
          title="Create an account"
          variant="secondary"
          onPress={() => navigation.navigate('Signup')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: spacing.xxl },
  hero: { gap: spacing.md },
  eyebrow: { color: colors.primary, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  title: { color: colors.text, fontSize: typography.title, lineHeight: 38, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 24 },
  form: { gap: spacing.lg },
  error: { color: colors.danger, fontSize: 14 },
});
