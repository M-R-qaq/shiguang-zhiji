import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore, Message } from '../store/appStore';
import { apiService } from '../services/api';
import { RootStackParamList } from '../../App';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from '../components/AppButton';
import MessageActionSheet from '../components/MessageActionSheet';

interface ConversationItem {
  id: number;
  role: string;
  content: string;
  timestamp: string | null;
  metadata: any;
}

export default function SessionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { sessionId: currentSessionId, setSessionId, setMessages } = useAppStore();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<{ session_id: string; title?: string; time_range?: string } | null>(null);
  const [actionSheetMessage, setActionSheetMessage] = useState<{ id: string; role: string; content: string } | null>(null);

  const { sessionId } = route.params as { sessionId: string };

  const loadSession = useCallback(async () => {
    try {
      const data = await apiService.getSessionDetail(sessionId);
      setConversations(data.conversations || []);
      setSessionInfo({ session_id: data.session_id, title: data.title });
      navigation.setOptions({ headerTitle: data.title || '会话详情' });
    } catch (error: any) {
      console.error('[会话详情] 加载失败:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleContinueSession = () => {
    const restoredMessages: Message[] = conversations.map((c) => ({
      id: c.id.toString(),
      role: c.role as Message['role'],
      content: c.content,
      timestamp: c.timestamp ? new Date(c.timestamp) : new Date(),
      sessionId,
    }));
    setMessages(restoredMessages);
    setSessionId(sessionId);
    navigation.navigate('Home');
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  const getBubbleStyle = (role: string) => {
    switch (role) {
      case 'user': return styles.userBubble;
      case 'assistant': return styles.assistantBubble;
      case 'system': return styles.systemBubble;
      default: return styles.assistantBubble;
    }
  };

  const getTextStyle = (role: string) => {
    switch (role) {
      case 'system': return styles.systemText;
      default: return styles.messageText;
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setConversations(prev => prev.filter(c => c.id.toString() !== messageId));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.conversationList}
        contentContainerStyle={styles.conversationContent}
      >
        {conversations.map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.8}
            onLongPress={() => setActionSheetMessage({ id: item.id.toString(), role: item.role, content: item.content })}
            style={[styles.messageBubble, getBubbleStyle(item.role)]}
          >
            <Text style={getTextStyle(item.role)}>{item.content}</Text>
            {item.timestamp && (
              <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton title="继续这个对话" onPress={handleContinueSession} size="lg" />
      </View>

      <MessageActionSheet
        visible={actionSheetMessage !== null}
        message={actionSheetMessage}
        onClose={() => setActionSheetMessage(null)}
        onDelete={handleDeleteMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationList: {
    flex: 1,
  },
  conversationContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginVertical: spacing.xs,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: 'rgba(233,69,96,0.2)',
    borderRadius: radius.md,
    maxWidth: '95%',
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.3)',
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  systemText: {
    color: colors.gold,
    fontSize: typography.small,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 20,
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  footer: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
