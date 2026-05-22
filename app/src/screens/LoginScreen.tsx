import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { RootStackParamList } from '../../App';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import AppCard from '../components/AppCard';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    login,
    register,
    backendUrl,
    backendDetecting,
    setManualBackendUrl,
    retryDetectBackend
  } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [manualUrl, setManualUrl] = useState('');

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('错误', '请输入用户名和密码');
      return;
    }

    if (!isLogin && !nickname.trim()) {
      Alert.alert('错误', '请输入昵称，让苏怀真知道怎么称呼你');
      return;
    }

    if (!isLogin && (nickname.length < 2 || nickname.length > 10)) {
      Alert.alert('错误', '昵称长度需要在2-10个字之间');
      return;
    }

    if (!backendUrl) {
      Alert.alert('错误', '未连接到后端服务，请检查网络或手动设置后端地址');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password, nickname);
      }
      navigation.replace('Home');
    } catch (error: any) {
      const message = error.response?.data?.detail || '操作失败，请重试';
      Alert.alert('错误', message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetManualUrl = async () => {
    if (!manualUrl.trim()) {
      Alert.alert('错误', '请输入后端地址');
      return;
    }
    let url = manualUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    const isAvailable = await setManualBackendUrl(url);
    if (isAvailable) {
      setShowManualUrl(false);
      Alert.alert('成功', '后端地址已设置并连接成功');
    } else {
      Alert.alert('连接失败', `无法连接到 ${url}，请检查地址是否正确以及后端是否已启动`);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>食</Text>
          </View>
          <Text style={styles.title}>食光知己</Text>
          <Text style={styles.subtitle}>跨越千年的知己相逢</Text>
        </View>

        <View style={styles.connectionStatus}>
          {backendDetecting ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>正在检测后端服务...</Text>
            </View>
          ) : backendUrl ? (
            <View style={styles.statusRow}>
              <Text style={[styles.statusDot, styles.statusDotOnline]} />
              <Text style={styles.statusText}>已连接: {backendUrl}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.statusRow}
              onPress={() => {
                retryDetectBackend();
              }}
            >
              <Text style={[styles.statusDot, styles.statusDotOffline]} />
              <Text style={styles.statusErrorText}>未检测到后端服务</Text>
              <Text style={styles.retryText}>点击重试</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.manualUrlSection}>
          {showManualUrl ? (
            <>
              <Text style={styles.manualUrlLabel}>手动输入后端地址</Text>
              <View style={styles.manualUrlRow}>
                <AppInput
                  placeholder="192.168.x.x:8000"
                  value={manualUrl}
                  onChangeText={setManualUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  style={{ flex: 1 }}
                />
                <AppButton
                  title="设置"
                  onPress={handleSetManualUrl}
                  variant="primary"
                  size="sm"
                />
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={styles.showManualUrlButton}
              onPress={() => setShowManualUrl(true)}
            >
              <Text style={styles.showManualUrlText}>手动设置后端地址</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {isLogin ? '欢迎回来' : '创建账号'}
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>用户名</Text>
            <AppInput
              placeholder="请输入用户名"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>密码</Text>
            <AppInput
              placeholder="请输入密码"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>苏怀真怎么称呼你</Text>
              <AppInput
                placeholder="2-10个字，如：小明、阿华"
                value={nickname}
                onChangeText={setNickname}
                maxLength={10}
              />

            </View>
          )}

          <AppButton
            title={isLogin ? '登录' : '注册'}
            onPress={handleSubmit}
            variant="primary"
            loading={loading}
            disabled={loading || !backendUrl}
            style={{ marginTop: spacing.sm }}
          />

          <AppButton
            title={isLogin ? '还没有账号？立即注册' : '已有账号？立即登录'}
            onPress={() => setIsLogin(!isLogin)}
            variant="ghost"
            size="sm"
            style={{ marginTop: spacing.lg }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            登录即表示同意我们的服务条款
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 40,
    color: colors.text,
    fontWeight: 'bold',
  },
  title: {
    fontSize: typography.h1,
    color: colors.text,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.small,
    color: colors.textMuted,
  },
  connectionStatus: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotOnline: {
    backgroundColor: colors.success,
  },
  statusDotOffline: {
    backgroundColor: colors.primary,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: typography.small,
    flex: 1,
  },
  statusErrorText: {
    color: colors.primary,
    fontSize: typography.small,
  },
  retryText: {
    color: colors.primary,
    fontSize: typography.small,
    textDecorationLine: 'underline',
  },
  manualUrlSection: {
    marginBottom: spacing.lg,
  },
  manualUrlLabel: {
    color: colors.textMuted,
    fontSize: typography.caption,
    marginBottom: spacing.sm,
  },
  manualUrlRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  showManualUrlButton: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  showManualUrlText: {
    color: colors.textMuted,
    fontSize: typography.small,
    textDecorationLine: 'underline',
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing['2xl'],
    marginBottom: spacing['2xl'],
  },
  formTitle: {
    fontSize: typography.h2,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: typography.caption,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
});
