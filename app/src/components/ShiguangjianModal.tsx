import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Linking,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useAppStore, VideoResult } from '../store/appStore';
import { colors, spacing, radius, typography } from '../theme';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.7;
const HEADER_HEIGHT = 56;
const QUERY_BAR_HEIGHT = 38;
const FOOTER_HEIGHT = 36;
const LIST_HEIGHT = MODAL_HEIGHT - HEADER_HEIGHT - QUERY_BAR_HEIGHT - FOOTER_HEIGHT;

export default function ShiguangjianModal() {
  const { shiguangjianVisible, shiguangjianData, dismissShiguangjian } = useAppStore();
  const slideAnim = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shiguangjianVisible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shiguangjianVisible]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: MODAL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissShiguangjian();
    });
  }, [dismissShiguangjian, slideAnim, fadeAnim]);

  const handleOpenVideo = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  if (!shiguangjianVisible || !shiguangjianData) return null;

  return (
    <Modal
      visible={shiguangjianVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.modalContent,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="videocam-outline" size={20} color={colors.gold} />
              <Text style={styles.headerTitle}>食光鉴</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.queryBar}>
            <Text style={styles.queryLabel}>推荐主题：</Text>
            <Text style={styles.queryText}>{shiguangjianData.query}</Text>
          </View>

          <ScrollView
            style={[styles.resultsList, { height: LIST_HEIGHT }]}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {shiguangjianData.results.map((video, idx) => (
              <View key={idx} style={styles.videoCard}>
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {video.title}
                </Text>
                <View style={styles.videoMeta}>
                  <Text style={styles.videoMetaText}>{video.author}</Text>
                  <Text style={styles.videoMetaDot}>·</Text>
                  <Text style={styles.videoMetaText}>{video.duration}</Text>
                  <Text style={styles.videoMetaDot}>·</Text>
                  <Text style={styles.videoMetaText}>{video.play_count}播放</Text>
                </View>
                <TouchableOpacity
                  style={styles.watchButton}
                  onPress={() => handleOpenVideo(video.url)}
                >
                  <Text style={styles.watchButtonText}>跳转观看</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerHint}>点击关闭按钮或空白区域关闭</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(205,175,100,0.2)',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205,175,100,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    color: colors.gold,
    fontSize: typography.h3,
    fontWeight: '700',
    letterSpacing: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: typography.small,
    fontWeight: '600',
  },
  queryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(139,105,20,0.15)',
  },
  queryLabel: {
    color: 'rgba(205,175,100,0.7)',
    fontSize: typography.small,
  },
  queryText: {
    color: colors.goldLight,
    fontSize: typography.small,
    fontWeight: '600',
  },
  resultsList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  videoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.2)',
  },
  videoTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  videoMetaText: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  videoMetaDot: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  watchButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(205,175,100,0.3)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.5)',
  },
  watchButtonText: {
    color: colors.gold,
    fontSize: typography.small,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(205,175,100,0.1)',
    alignItems: 'center',
  },
  footerHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
});
