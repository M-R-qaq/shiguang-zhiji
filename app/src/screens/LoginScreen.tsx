import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
      Alert.alert('错误', '请输入昵称（用于唤醒词）');
      return;
    }

    if (!isLogin && (nickname.length < 2 || nickname.length > 5)) {
      Alert.alert('错误', '昵称长度需要在2-5个字之间');
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

  const handleSetManualUrl = () => {
    if (!manualUrl.trim()) {
      Alert.alert('错误', '请输入后端地址');
      return;
    }
    let url = manualUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    setManualBackendUrl(url);
    setShowManualUrl(false);
    Alert.alert('成功', '后端地址已设置');
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
              <ActivityIndicator size="small" color="#e94560" />
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

        {!backendUrl && (
          <View style={styles.manualUrlSection}>
            {showManualUrl ? (
              <>
                <Text style={styles.manualUrlLabel}>手动输入后端地址</Text>
                <View style={styles.manualUrlRow}>
                  <TextInput
                    style={styles.manualUrlInput}
                    placeholder="192.168.x.x:8000"
                    placeholderTextColor="#666"
                    value={manualUrl}
                    onChangeText={setManualUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TouchableOpacity
                    style={styles.setUrlButton}
                    onPress={handleSetManualUrl}
                  >
                    <Text style={styles.setUrlButtonText}>设置</Text>
                  </TouchableOpacity>
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
        )}

        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {isLogin ? '欢迎回来' : '创建账号'}
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>用户名</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入用户名"
              placeholderTextColor="#999"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>密码</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入密码"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>昵称</Text>
              <TextInput
                style={styles.input}
                placeholder="2-5个字（用于唤醒词：你好，XX）"
                placeholderTextColor="#999"
                value={nickname}
                onChangeText={setNickname}
                maxLength={5}
              />
              <Text style={styles.hint}>
                唤醒词格式：你好，{nickname || 'XX'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading || !backendUrl}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? '登录' : '注册'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsLogin(!isLogin)}
          >
            <Text style={styles.switchText}>
              {isLogin ? '还没有账号？立即注册' : '已有账号？立即登录'}
            </Text>
          </TouchableOpacity>
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
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  connectionStatus: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotOnline: {
    backgroundColor: '#4caf50',
  },
  statusDotOffline: {
    backgroundColor: '#e94560',
  },
  statusText: {
    color: '#999',
    fontSize: 13,
    flex: 1,
  },
  statusErrorText: {
    color: '#e94560',
    fontSize: 13,
  },
  retryText: {
    color: '#e94560',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  manualUrlSection: {
    marginBottom: 16,
  },
  manualUrlLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
  },
  manualUrlRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualUrlInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#fff',
  },
  setUrlButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  setUrlButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  showManualUrlButton: {
    alignItems: 'center',
    padding: 8,
  },
  showManualUrlText: {
    color: '#666',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  form: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hint: {
    fontSize: 12,
    color: '#e94560',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    color: '#e94560',
    fontSize: 14,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 12,
  },
});
