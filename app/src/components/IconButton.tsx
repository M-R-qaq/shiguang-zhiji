import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

type IconSize = 'sm' | 'md' | 'lg';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  size?: IconSize;
  style?: ViewStyle;
}

const sizeMap: Record<IconSize, number> = {
  sm: 36,
  md: 44,
  lg: 52,
};

export default function IconButton({ icon, onPress, size = 'md', style }: IconButtonProps) {
  const dim = sizeMap[size];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.button,
        { width: dim, height: dim, borderRadius: dim / 2 },
        style,
      ]}
    >
      {typeof icon === 'string' ? (
        <Text style={styles.iconText}>{icon}</Text>
      ) : (
        icon
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
});
