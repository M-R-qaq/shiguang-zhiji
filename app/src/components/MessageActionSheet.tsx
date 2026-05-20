import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, radius, typography } from '../theme';

interface MessageActionSheetProps {
  visible: boolean;
  message: { id: string; role: string; content: string } | null;
  onClose: () => void;
  onDelete: (messageId: string) => void;
}

export default function MessageActionSheet({ visible, message, onClose, onDelete }: MessageActionSheetProps) {
  if (!message) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.content);
    Alert.alert('已复制');
    onClose();
  };

  const handleShare = async () => {
    const text = message.role === 'assistant'
      ? `苏怀真说："${message.content}" —— 来自食光知己`
      : `我说："${message.content}" —— 来自食光知己`;
    await Share.share({ message: text });
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      '确定要删除这条消息吗？',
      '此消息仅从本地删除，重新加载会话后将重新出现',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            onDelete(message.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.menuContainer} onStartShouldSetResponder={() => true}>
          <TouchableOpacity style={styles.menuItem} onPress={handleCopy}>
            <Text style={styles.menuItemText}>复制文字</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
            <Text style={styles.menuItemText}>分享消息</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
            <Text style={[styles.menuItemText, styles.deleteText]}>删除此条</Text>
          </TouchableOpacity>
          <View style={styles.cancelGap} />
          <TouchableOpacity style={[styles.menuItem, styles.cancelItem]} onPress={onClose}>
            <Text style={styles.menuItemText}>取消</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  menuItem: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  deleteText: {
    color: colors.error,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  cancelGap: {
    height: 8,
    backgroundColor: colors.background,
  },
  cancelItem: {
    backgroundColor: '#0a0a14',
  },
});
