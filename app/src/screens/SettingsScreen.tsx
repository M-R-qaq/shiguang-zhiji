import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { useAuth } from '../store/AuthContext';
import { useAppStore } from '../store/appStore';
import { apiService } from '../services/api';
import { wakeWordService } from '../services/wakeWordService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from '../components/AppButton';
import AppCard from '../components/AppCard';
import FeatureTip from '../components/FeatureTip';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, updateNickname } = useAuth();
  const { clearMessages, startNewSession, showChatText, setShowChatText, featureTips, markFeatureTip, resetOnboardingForNewUser } = useAppStore();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [wakeWordName, setWakeWordName] = useState('知己');
  const [wakeWordLoading, setWakeWordLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wakeWordTipVisible, setWakeWordTipVisible] = useState(false);

  useEffect(() => {
    loadWakeWordConfig();
  }, []);

  useEffect(() => {
    if (!featureTips.wake_word && wakeWordName === '知己') {
      setWakeWordTipVisible(true);
    }
  }, [featureTips.wake_word, wakeWordName]);

  const loadWakeWordConfig = async () => {
    try {
      const config = await apiService.getWakeWordConfig();
      setWakeWordName(config.wake_word_name || '知己');
    } catch (error) {
      console.error('加载唤醒词配置失败:', error);
    } finally {
      setWakeWordLoading(false);
    }
  };

  const handleSaveNickname = async () => {
    if (!nickname.trim()) {
      Alert.alert('错误', '昵称不能为空');
      return;
    }
    setSaving(true);
    try {
      await updateNickname(nickname.trim());
      Alert.alert('成功', '昵称已更新');
    } catch (error: any) {
      Alert.alert('错误', error.response?.data?.detail || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWakeWord = async () => {
    const name = wakeWordName.trim();
    if (name.length < 2 || name.length > 5) {
      Alert.alert('错误', '唤醒词名称必须在2-5个字之间');
      return;
    }
    setSaving(true);
    try {
      await apiService.updateWakeWordName(name);
      const fullKeyword = '你好' + name;
      await wakeWordService.updateKeyword(fullKeyword);
      Alert.alert('成功', `唤醒词已更新为"${fullKeyword}"`);
    } catch (error: any) {
      Alert.alert('错误', error.response?.data?.detail || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetWakeWord = async () => {
    Alert.alert(
      '重置唤醒词',
      '确定要重置为默认值"知己"吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: async () => {
          setSaving(true);
          try {
            await apiService.resetWakeWordName();
            setWakeWordName('知己');
            await wakeWordService.updateKeyword('你好知己');
            Alert.alert('成功', '唤醒词已重置为"你好知己"');
          } catch (error: any) {
            Alert.alert('错误', error.response?.data?.detail || '重置失败');
          } finally {
            setSaving(false);
          }
        }},
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      '清空对话历史',
      '此操作不可恢复！确定要清空所有对话历史吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定清空', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await apiService.clearHistory();
            clearMessages();
            startNewSession();
            Alert.alert('成功', '对话历史已清空');
          } catch (error: any) {
            Alert.alert('错误', error.response?.data?.detail || '清空失败');
          } finally {
            setSaving(false);
          }
        }},
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      '退出登录',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: async () => {
          try {
            await apiService.logout();
          } catch {}
          await logout();
        }},
      ]
    );
  };

  const handleReplayTutorial = () => {
    Alert.alert(
      '重温新手教程',
      '确定要重新观看新手引导吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => {
          navigation.navigate('Home');
          setTimeout(() => {
            resetOnboardingForNewUser();
          }, 300);
        }},
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '注销账户',
      '此操作不可恢复！确定要注销账户吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定注销', style: 'destructive', onPress: async () => {
          try {
            await apiService.deleteAccount();
            await logout();
          } catch (error: any) {
            Alert.alert('错误', error.response?.data?.detail || '注销失败');
          }
        }},
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 用户信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>用户信息</Text>
        <AppCard padding={spacing.lg}>
          <View style={styles.row}>
            <Text style={styles.label}>用户名</Text>
            <Text style={styles.value}>{user?.username}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.inputRow}>
            <Text style={styles.label}>昵称</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="输入昵称"
              placeholderTextColor="#666"
              maxLength={20}
            />
          </View>
          <AppButton
            title="保存昵称"
            onPress={handleSaveNickname}
            disabled={saving}
            loading={saving}
            style={{ marginTop: spacing.md }}
          />
        </AppCard>
      </View>

      {/* 唤醒词配置 */}
      <FeatureTip
        visible={wakeWordTipVisible}
        text="设置你的专属唤醒词"
        onDismiss={() => {
          setWakeWordTipVisible(false);
          markFeatureTip('wake_word');
        }}
        variant="bubble"
      />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>唤醒词配置</Text>
        <AppCard padding={spacing.lg}>
          {wakeWordLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.wakeWordPreview}>
                当前唤醒词：你好，{wakeWordName}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.label}>自定义名称（2-5个字）</Text>
              <View style={styles.wakeWordInputRow}>
                <Text style={styles.wakeWordPrefix}>你好，</Text>
                <TextInput
                  style={styles.wakeWordInput}
                  value={wakeWordName}
                  onChangeText={setWakeWordName}
                  placeholder="知己"
                  placeholderTextColor="#666"
                  maxLength={5}
                />
              </View>
              <View style={styles.buttonRow}>
                <AppButton
                  title="保存"
                  onPress={handleSaveWakeWord}
                  disabled={saving}
                  style={styles.flexButton}
                />
                <AppButton
                  title="重置"
                  onPress={handleResetWakeWord}
                  disabled={saving}
                  variant="secondary"
                  style={styles.flexButton}
                />
              </View>
            </>
          )}
        </AppCard>
      </View>

      {/* 数据管理 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>数据管理</Text>
        <AppCard padding={spacing.lg}>
          <AppButton
            title="清空对话历史"
            onPress={handleClearHistory}
            disabled={saving}
            variant="danger"
          />
        </AppCard>
      </View>

      {/* 对话显示 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>对话显示</Text>
        <AppCard padding={spacing.lg}>
          <View style={styles.row}>
            <Text style={styles.label}>显示对话文本</Text>
            <Switch
              value={showChatText}
              onValueChange={setShowChatText}
              trackColor={{ false: colors.surfaceLight, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </AppCard>
      </View>

      {/* 新手教程 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>新手教程</Text>
        <AppCard padding={spacing.lg}>
          <AppButton
            title="重温新手教程"
            onPress={handleReplayTutorial}
            variant="secondary"
          />
        </AppCard>
      </View>

      {/* 开发测试 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>开发测试</Text>
        <AppCard padding={spacing.lg}>
          <TouchableOpacity
            style={[styles.row, { justifyContent: 'space-between' }]}
            onPress={() => navigation.navigate('Diagnostics')}
          >
            <Text style={styles.label}>系统诊断</Text>
            <Text style={styles.value}>进入 {'>'}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={[styles.row, { justifyContent: 'space-between' }]}
            onPress={() => navigation.navigate('TestMode')}
          >
            <Text style={styles.label}>ASR 连续对话测试</Text>
            <Text style={styles.value}>进入 {'>'}</Text>
          </TouchableOpacity>
        </AppCard>
      </View>

      {/* 关于 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关于</Text>
        <AppCard padding={spacing.lg}>
          <View style={styles.row}>
            <Text style={styles.label}>版本</Text>
            <Text style={styles.value}>v0.8.0</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>应用名称</Text>
            <Text style={styles.value}>食光知己</Text>
          </View>
        </AppCard>
      </View>

      {/* 账户管理 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>账户管理</Text>
        <AppCard padding={spacing.lg}>
          <AppButton
            title="退出登录"
            onPress={handleLogout}
            variant="ghost"
          />
          <View style={styles.divider} />
          <AppButton
            title="注销账户"
            onPress={handleDeleteAccount}
            variant="danger"
          />
        </AppCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    fontSize: typography.h3,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.small,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: typography.small,
    color: colors.text,
    width: 180,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  wakeWordPreview: {
    fontSize: typography.h3,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  wakeWordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  wakeWordPrefix: {
    fontSize: typography.body,
    color: colors.textMuted,
  },
  wakeWordInput: {
    flex: 1,
    fontSize: typography.body,
    color: colors.text,
    padding: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
});
