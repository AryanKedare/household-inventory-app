import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/common/AppButton';
import { AppInput } from '../../components/common/AppInput';
import { Screen } from '../../components/common/Screen';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { signupSchema, type SignupInput } from '../../schemas/auth';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toUserMessage } from '../../utils/firebaseError';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    try {
      await signUp(name, email, password);
    } catch (error) {
      setError('root', { message: toUserMessage(error) });
    }
  });

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Your household can be created or joined after signup.</Text>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onBlur, onChange, value } }) => (
            <AppInput
              label="Name"
              autoComplete="name"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.name?.message}
            />
          )}
        />
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
              autoComplete="new-password"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onBlur, onChange, value } }) => (
            <AppInput
              label="Confirm password"
              secureTextEntry
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.confirmPassword?.message}
            />
          )}
        />
        {errors.root?.message ? <Text style={styles.error}>{errors.root.message}</Text> : null}
        <AppButton title="Create account" onPress={onSubmit} loading={isSubmitting} />
        <AppButton title="Back to sign in" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: spacing.xxl },
  hero: { gap: spacing.md },
  title: { color: colors.text, fontSize: typography.title, lineHeight: 38, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 24 },
  form: { gap: spacing.lg },
  error: { color: colors.danger, fontSize: 14 },
});
