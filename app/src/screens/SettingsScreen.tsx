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
} from 'react-native';
import { useAuth } from '../store/AuthContext';
import { apiService } from '../services/api';

export default function SettingsScreen() {
  const { user, logout, updateNickname } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [wakeWordName, setWakeWordName] = useState('知己');
  const [wakeWordLoading, setWakeWordLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWakeWordConfig();
  }, []);

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
      Alert.alert('成功', `唤醒词已更新为"你好，${name}"`);
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
            const result = await apiService.resetWakeWordName();
            setWakeWordName('知己');
            Alert.alert('成功', '唤醒词已重置');
          } catch (error: any) {
            Alert.alert('错误', error.response?.data?.detail || '重置失败');
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
        <View style={styles.card}>
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
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveNickname}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.saveButtonText}>保存昵称</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 唤醒词配置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>唤醒词配置</Text>
        <View style={styles.card}>
          {wakeWordLoading ? (
            <ActivityIndicator color="#e94560" />
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
                <TouchableOpacity
                  style={[styles.saveButton, styles.flexButton]}
                  onPress={handleSaveWakeWord}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resetButton, styles.flexButton]}
                  onPress={handleResetWakeWord}
                  disabled={saving}
                >
                  <Text style={styles.resetButtonText}>重置</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* 账户管理 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>账户管理</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>退出登录</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteButtonText}>注销账户</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
  },
  value: {
    fontSize: 14,
    color: '#fff',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#fff',
    width: 180,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  saveButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  wakeWordPreview: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  wakeWordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  wakeWordPrefix: {
    fontSize: 16,
    color: '#888',
  },
  wakeWordInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    padding: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  flexButton: {
    flex: 1,
  },
  resetButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButton: {
    padding: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#666',
    fontSize: 14,
  },
});
