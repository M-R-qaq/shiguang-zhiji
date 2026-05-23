import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Platform,
  StatusBar,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from './AppButton';
import { Ionicons } from '@expo/vector-icons';

const STEPS = [
  { title: '欢迎来到食光知己', description: '我是苏怀真，一面食光鉴带我穿越千年，来到你的餐桌旁。让我带你了解这里的一切~', hasTarget: false },
  { title: '点击屏幕开始对话', description: '点击屏幕任意位置，就可以开始和苏怀真对话啦', hasTarget: true },
  { title: '语音唤醒', description: '说"你好知己"也可以唤醒苏怀真，开始语音对话', hasTarget: true },
  { title: '食光鉴', description: '苏怀真会通过食光鉴，为他推荐美食视频', hasTarget: false, isDemo: true },
  { title: '更多功能', description: '这里可以查看历史会话、管理记忆、修改设置', hasTarget: true },
];

const STEP_OFFSETS: Record<number, { dy: number; maxH?: number }> = {
  1: { dy: 0, maxH: SCREEN_HEIGHT * 0.42 },
  2: { dy: 12 },
  4: { dy: 12 },
};

const DEMO_VIDEO = {
  title: '示例：深夜食堂里的温暖拉面',
  author: '美食探店君',
  duration: '12:34',
  play_count: '2.3万',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPOT_PADDING = 8;
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.75)';
const STATUS_BAR_OFFSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

interface OnboardingOverlayProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
  targetRefs: React.RefObject<any>[];
}

export default function OnboardingOverlay({
  visible,
  onComplete,
  onSkip,
  targetRefs,
}: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetLayout, setTargetLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [measured, setMeasured] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const spotX = useRef(new Animated.Value(-SPOT_PADDING)).current;
  const spotY = useRef(new Animated.Value(-SPOT_PADDING)).current;
  const spotW = useRef(new Animated.Value(0)).current;
  const spotH = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  const measureTarget = useCallback(
    (step: number) => {
      const refIndex = step === 4 ? 2 : step - 1;
      if (refIndex < 0 || refIndex >= targetRefs.length) return;
      const ref = targetRefs[refIndex];
      if (!ref?.current) return;

      requestAnimationFrame(() => {
        try {
          (ref.current as any).measureInWindow(
            (x: number, y: number, width: number, height: number) => {
              if (x === undefined) return;

              const offset = STEP_OFFSETS[step] || { dy: 0 };
              let adjustedY = y + STATUS_BAR_OFFSET + offset.dy;
              let adjustedH = height - offset.dy;
              if (offset.maxH && adjustedH > offset.maxH) {
                adjustedY = adjustedY + (adjustedH - offset.maxH) / 2;
                adjustedH = offset.maxH;
              }

              const padded = {
                x: x - SPOT_PADDING,
                y: adjustedY - SPOT_PADDING,
                width: width + SPOT_PADDING * 2,
                height: adjustedH + SPOT_PADDING * 2,
              };
              setTargetLayout(padded);
              setMeasured(true);
              Animated.parallel([
                Animated.spring(spotX, { toValue: padded.x, useNativeDriver: false, overshootClamping: true }),
                Animated.spring(spotY, { toValue: padded.y, useNativeDriver: false, overshootClamping: true }),
                Animated.spring(spotW, { toValue: padded.width, useNativeDriver: false, overshootClamping: true }),
                Animated.spring(spotH, { toValue: padded.height, useNativeDriver: false, overshootClamping: true }),
              ]).start();
            },
          );
        } catch {}
      });
    },
    [targetRefs, spotX, spotY, spotW, spotH],
  );

  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      setMeasured(false);
      animating.current = false;
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      opacity.setValue(0);
    }
  }, [visible, opacity]);

  useEffect(() => {
    if (!visible) return;
    if (STEPS[currentStep].hasTarget) {
      measureTarget(currentStep);
    } else {
      setMeasured(false);
    }
  }, [currentStep, visible, measureTarget]);

  const dismiss = useCallback(
    (callback: () => void) => {
      if (animating.current) return;
      animating.current = true;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        animating.current = false;
        callback();
      });
    },
    [opacity],
  );

  const handleNext = useCallback(() => {
    if (animating.current) return;
    if (currentStep === STEPS.length - 1) {
      dismiss(onComplete);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, dismiss, onComplete]);

  const handleSkip = useCallback(() => {
    dismiss(onSkip);
  }, [dismiss, onSkip]);

  if (!visible) return null;

  const step = STEPS[currentStep];
  const isNearBottom = targetLayout.y + targetLayout.height > SCREEN_HEIGHT * 0.6;
  const isLastStep = currentStep === STEPS.length - 1;

  const renderDots = () => (
    <View style={styles.dots}>
      {STEPS.map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === currentStep ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );

  const renderSpotlight = () => {
    if (!step.hasTarget || !measured) {
      return <View style={styles.fullDim} />;
    }
    return (
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.dimBlock, { width: SCREEN_WIDTH, height: spotY }]} />
        <Animated.View style={{ flexDirection: 'row', height: spotH }}>
          <Animated.View style={[styles.dimBlock, { width: spotX }]} />
          <Animated.View
            style={{
              width: spotW,
              height: spotH,
              borderRadius: SPOT_PADDING + 4,
              borderWidth: 2,
              borderColor: colors.gold,
            }}
          />
          <Animated.View style={[styles.dimBlock, { flex: 1 }]} />
        </Animated.View>
        <Animated.View style={[styles.dimBlock, { width: SCREEN_WIDTH, flex: 1 }]} />
      </View>
    );
  };

  const renderWelcomeCard = () => (
    <View style={styles.welcomeWrap}>
      <View style={styles.welcomeCard}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={[styles.description, styles.descriptionCenter]}>{step.description}</Text>
        {renderDots()}
        <View style={styles.buttons}>
          <AppButton title="跳过" onPress={handleSkip} variant="ghost" size="md" />
          <AppButton title="下一步" onPress={handleNext} variant="primary" size="md" />
        </View>
      </View>
    </View>
  );

  const renderTooltipCard = () => {
    const tooltipPosition = isNearBottom
      ? { bottom: SCREEN_HEIGHT - targetLayout.y + spacing.md }
      : { top: targetLayout.y + targetLayout.height + spacing.md };
    return (
      <View style={[styles.tooltip, tooltipPosition]}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
        {renderDots()}
        <View style={styles.buttons}>
          <AppButton title="跳过" onPress={handleSkip} variant="ghost" size="sm" />
          <AppButton
            title={isLastStep ? '开始对话' : '下一步'}
            onPress={handleNext}
            variant="primary"
            size="sm"
          />
        </View>
      </View>
    );
  };

  const renderDemoShiguangjian = () => (
    <View style={styles.welcomeWrap}>
      <View style={styles.demoCard}>
        <View style={styles.demoHeader}>
          <Ionicons name="videocam-outline" size={20} color={colors.gold} />
          <Text style={styles.demoHeaderTitle}>食光鉴</Text>
        </View>
        <View style={styles.demoQueryBar}>
          <Text style={styles.demoQueryLabel}>推荐主题：</Text>
          <Text style={styles.demoQueryText}>深夜食堂</Text>
        </View>
        <View style={styles.demoVideoCard}>
          <Text style={styles.demoVideoTitle} numberOfLines={2}>{DEMO_VIDEO.title}</Text>
          <View style={styles.demoVideoMeta}>
            <Text style={styles.demoVideoMetaText}>{DEMO_VIDEO.author}</Text>
            <Text style={styles.demoVideoMetaDot}>·</Text>
            <Text style={styles.demoVideoMetaText}>{DEMO_VIDEO.duration}</Text>
            <Text style={styles.demoVideoMetaDot}>·</Text>
            <Text style={styles.demoVideoMetaText}>{DEMO_VIDEO.play_count}播放</Text>
          </View>
          <View style={styles.demoWatchButton}>
            <Text style={styles.demoWatchButtonText}>跳转观看</Text>
          </View>
        </View>
        <Text style={[styles.description, styles.descriptionCenter, { marginTop: spacing.md }]}>
          和苏怀真聊天时，她会通过食光鉴为你推荐美食视频
        </Text>
        {renderDots()}
        <View style={styles.buttons}>
          <AppButton title="跳过" onPress={handleSkip} variant="ghost" size="md" />
          <AppButton title="下一步" onPress={handleNext} variant="primary" size="md" />
        </View>
      </View>
    </View>
  );

  const renderContent = () => {
    if ((step as any).isDemo) {
      return renderDemoShiguangjian();
    }
    if (step.hasTarget && measured) {
      return renderTooltipCard();
    }
    return renderWelcomeCard();
  };

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.container, { opacity }]}>
        {renderSpotlight()}
        {renderContent()}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: OVERLAY_COLOR,
  },
  dimBlock: {
    backgroundColor: OVERLAY_COLOR,
  },
  welcomeWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: OVERLAY_COLOR,
  },
  welcomeCard: {
    width: SCREEN_WIDTH - 64,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: spacing.xl,
    alignItems: 'center',
  },
  demoCard: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.2)',
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  demoHeaderTitle: {
    color: colors.gold,
    fontSize: typography.h3,
    fontWeight: '700',
    letterSpacing: 3,
  },
  demoQueryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(139,105,20,0.15)',
    borderRadius: radius.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  demoQueryLabel: {
    color: 'rgba(205,175,100,0.7)',
    fontSize: typography.small,
  },
  demoQueryText: {
    color: colors.goldLight,
    fontSize: typography.small,
    fontWeight: '600',
  },
  demoVideoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.2)',
  },
  demoVideoTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  demoVideoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  demoVideoMetaText: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  demoVideoMetaDot: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  demoWatchButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(205,175,100,0.3)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.5)',
  },
  demoWatchButtonText: {
    color: colors.gold,
    fontSize: typography.small,
    fontWeight: '600',
  },
  tooltip: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.h3,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  descriptionCenter: {
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: colors.gold,
  },
  dotInactive: {
    backgroundColor: colors.textMuted,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
  },
});
