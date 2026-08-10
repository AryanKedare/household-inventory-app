import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

interface AppInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export const AppInput = forwardRef<TextInput, AppInputProps>(function AppInput(
  { label, error, style, ...props },
  ref,
) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? styles.inputError : undefined, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  label: { color: colors.text, fontWeight: '600', fontSize: 14 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
});
