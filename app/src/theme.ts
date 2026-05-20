import { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  background: '#0f0f1a',
  surface: 'rgba(255,255,255,0.06)',
  surfaceLight: 'rgba(255,255,255,0.1)',
  primary: '#e94560',
  primaryDark: '#c0392b',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.08)',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  gold: '#cdaa64',
  goldLight: '#e8d5a3',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  h1: 28,
  h2: 20,
  h3: 18,
  body: 15,
  small: 13,
  caption: 12,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  } as ViewStyle,
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  } as ViewStyle,
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  } as ViewStyle,
} as const;

export const textStyles: Record<string, TextStyle> = {
  h1: {
    fontSize: typography.h1,
    fontWeight: 'bold',
    color: colors.text,
  },
  h2: {
    fontSize: typography.h2,
    fontWeight: '600',
    color: colors.text,
  },
  h3: {
    fontSize: typography.h3,
    fontWeight: '600',
    color: colors.text,
  },
  body: {
    fontSize: typography.body,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 22,
  },
  small: {
    fontSize: typography.small,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  caption: {
    fontSize: typography.caption,
    fontWeight: '500',
    color: colors.textMuted,
  },
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  shadows,
  textStyles,
} as const;

export default theme;
