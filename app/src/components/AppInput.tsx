import React from 'react';
import { TextInput, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface AppInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  onSubmitEditing?: () => void;
}

export default function AppInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  style,
  textStyle,
  keyboardType = 'default',
  autoCapitalize = 'none',
  maxLength,
  onSubmitEditing,
}: AppInputProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      maxLength={maxLength}
      onSubmitEditing={onSubmitEditing}
      style={[styles.input, multiline && styles.multiline, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multiline: {
    minHeight: 60,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
});
