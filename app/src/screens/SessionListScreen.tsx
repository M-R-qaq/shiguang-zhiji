import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useAppStore } from '../store/appStore';
import { apiService } from '../services/api';
import { RootStackParamList } from '../../App';
import { colors, spacing, radius } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import FeatureTip from '../components/FeatureTip';

interface SessionInfo {
  session_id: string;
  last_message_time: string;
  message_count: number;
  preview: string;
  title?: string;
}

export default function SessionListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { featureTips, markFeatureTip } = useAppStore();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionsTipVisible, setSessionsTipVisible] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiService.getSessions(50);
      setSessions(data.sessions || []);
    } catch (error: any) {
      console.error('[会话列表] 加载失败:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!featureTips.sessions) {
      setSessionsTipVisible(true);
    }
  }, [featureTips.sessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      '删除会话',
      '确定要删除这个会话吗？删除后不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteSession(sessionId);
              setSessions(prev => prev.filter(s => s.session_id !== sessionId));
            } catch (error: any) {
              Alert.alert('错误', '删除会话失败');
            }
          },
        },
      ]
    );
  };

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffMin < 1) return '刚刚';
      if (diffMin < 60) return `${diffMin}分钟前`;
      if (diffHour < 24) return `${diffHour}小时前`;
      if (diffDay < 7) return `${diffDay}天前`;
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return '';
    }
  };

  const renderItem = ({ item }: { item: SessionInfo }) => (
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={() => navigation.navigate('SessionDetail', { sessionId: item.session_id })}
      onLongPress={() => handleDeleteSession(item.session_id)}
      activeOpacity={0.7}
    >
      <View style={styles.sessionContent}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {item.title || (item.preview?.slice(0, 20) || '（无预览）')}
        </Text>
        {item.title ? (
          <Text style={styles.sessionPreview} numberOfLines={1}>
            {item.preview?.slice(0, 40) || ''}
          </Text>
        ) : null}
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionTime}>{formatTime(item.last_message_time)}</Text>
          <Text style={styles.sessionCount}>{item.message_count} 条消息</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
      <Text style={styles.emptyText}>暂无历史会话</Text>
      <Text style={styles.emptySubtext}>与苏怀真对话后，会话将自动保存</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.session_id}
        renderItem={renderItem}
        ListHeaderComponent={
          <FeatureTip
            visible={sessionsTipVisible}
            text="这里保存了你和苏怀真的所有对话"
            onDismiss={() => {
              setSessionsTipVisible(false);
              markFeatureTip('sessions');
            }}
            variant="banner"
          />
        }
        ListEmptyComponent={!loading ? renderEmpty : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={sessions.length === 0 ? styles.emptyList : styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  emptyList: {
    flexGrow: 1,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: spacing.xs,
  },
  sessionPreview: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  sessionMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sessionTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  sessionCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  sessionArrow: {
    color: colors.textMuted,
    fontSize: 24,
    marginLeft: spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
    opacity: 0.6,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
