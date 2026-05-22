import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

interface FeatureTipProps {
  visible: boolean;
  text: string;
  onDismiss: () => void;
  variant?: 'bubble' | 'banner';
  autoDismissMs?: number;
}

export default function FeatureTip({
  visible,
  text,
  onDismiss,
  variant = 'bubble',
  autoDismissMs = 3000,
}: FeatureTipProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(4)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateIn = () => {
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ];

    if (variant === 'bubble') {
      animations.push(
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      );
    }

    Animated.parallel(animations).start();

    if (variant === 'bubble' && autoDismissMs > 0) {
      timerRef.current = setTimeout(() => {
        animateOut();
      }, autoDismissMs);
    }
  };

  const animateOut = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  useEffect(() => {
    if (visible) {
      animateIn();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  if (variant === 'banner') {
    return (
      <Animated.View style={[styles.banner, { opacity }]}>
        <Text style={styles.bannerText}>{text}</Text>
        <TouchableOpacity onPress={animateOut} style={styles.closeButton}>
          <Text style={styles.closeIcon}>×</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={1} onPress={animateOut}>
      <Animated.View style={[styles.bubble, { opacity, transform: [{ translateY }] }]}>
        <Text style={styles.bubbleText}>{text}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: colors.surfaceLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: Dimensions.get('window').width * 0.7,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  banner: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  closeButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  closeIcon: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: 'bold',
  },
});
