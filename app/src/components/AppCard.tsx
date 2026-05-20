import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface AppCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export default function AppCard({ children, style, padding = spacing.md }: AppCardProps) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
});
