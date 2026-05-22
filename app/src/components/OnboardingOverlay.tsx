import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from './AppButton';

const STEPS = [
  { title: '欢迎来到食光知己', description: '我是苏怀真，一面食光鉴带我穿越千年，来到你的餐桌旁。让我带你了解这里的一切~', hasTarget: false },
  { title: '语音对话', description: '点击麦克风按钮，就可以用语音和苏怀真对话啦', hasTarget: true },
  { title: '文字输入', description: '也可以在这里输入文字消息，和苏怀真聊天', hasTarget: true },
  { title: '食光鉴', description: '苏怀真会通过食光鉴，为你推荐美食视频', hasTarget: true },
  { title: '更多功能', description: '这里可以查看历史会话、管理记忆、修改设置', hasTarget: true },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPOT_PADDING = 8;
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.75)';

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
      const refIndex = step - 1;
      if (refIndex < 0 || refIndex >= targetRefs.length) return;
      const ref = targetRefs[refIndex];
      if (!ref?.current) return;

      requestAnimationFrame(() => {
        try {
          (ref.current as any).measureInWindow(
            (x: number, y: number, width: number, height: number) => {
              if (x === undefined) return;
              const padded = {
                x: x - SPOT_PADDING,
                y: y - SPOT_PADDING,
                width: width + SPOT_PADDING * 2,
                height: height + SPOT_PADDING * 2,
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

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.container, { opacity }]}>
        {renderSpotlight()}
        {step.hasTarget && measured ? renderTooltipCard() : renderWelcomeCard()}
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
