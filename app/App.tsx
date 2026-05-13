import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import { apiService } from './src/services/api';

type AppState = 'idle' | 'listening' | 'speaking' | 'login' | 'register';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 登录表单
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      await apiService.login(username, password);
      const user = await apiService.getCurrentUser();
      setCurrentUser(user);
      setIsLoggedIn(true);
      setAppState('idle');
    } catch (e: any) {
      Alert.alert('登录失败', e.message || '请检查用户名密码');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      setIsLoading(true);
      await apiService.register(username, password, nickname);
      await handleLogin();
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      Alert.alert('注册失败', detail || e.message || '请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMessage = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    }]);

    setAppState('speaking');
    setIsLoading(true);

    try {
      const response = await apiService.chat(userMessage);
      const assistantText = response.response || response.message || '收到';
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
      }]);

      // 调用 TTS 播放回复
      await playTTS(assistantText);
    } catch (e: any) {
      const detail = e.response?.data?.detail || e.message || '发送失败';
      Alert.alert('错误', detail);
    } finally {
      setIsLoading(false);
      setAppState('idle');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setMessages([]);
    setAppState('login');
  };

  // 播放TTS音频
  const playTTS = async (text: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('[TTS] 开始播放:', text.substring(0, 30) + '...');

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });

        const ttsResponse = await apiService.synthesize(text);
        const audioBase64 = ttsResponse.audio;
        console.log('[TTS] 收到音频 base64, 长度:', audioBase64?.length || 0);

        if (!audioBase64 || audioBase64.length < 100) {
          throw new Error('音频数据为空或过小');
        }

        const tempFile = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(tempFile, audioBase64, {
          encoding: 'base64',
        });

        const fileInfo = await FileSystem.getInfoAsync(tempFile);
        console.log('[TTS] 文件信息:', fileInfo);

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: tempFile },
          { shouldPlay: true, volume: 1.0 }
        );
        console.log('[TTS] Sound 对象创建成功');

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          console.log('[TTS] 播放状态:', status.isPlaying, '位置:', status.positionMillis, '时长:', status.durationMillis);

          if (status.didJustFinish) {
            console.log('[TTS] 播放完成');
            newSound.unloadAsync();
            FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
            resolve();
          }
        });

      } catch (error: any) {
        console.error('[TTS] 播放失败:', error);
        Alert.alert('TTS 播放失败', error.message || '未知错误');
        reject(error);
      }
    });
  };

  // 视频源
  const getVideoSource = () => {
    switch (appState) {
      case 'idle': return require('./assets/videos/idle.mp4');
      case 'listening': return require('./assets/videos/listening.mp4');
      case 'speaking': return require('./assets/videos/speaking.mp4');
      default: return require('./assets/videos/idle.mp4');
    }
  };

  // 登录/注册页面
  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.header}>
          <Text style={styles.title}>🍜 食光知己</Text>
          <Text style={styles.subtitle}>你的虚拟陪伴助手</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="用户名"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="密码"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {appState === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="昵称（可选）"
              value={nickname}
              onChangeText={setNickname}
            />
          )}

          {isLoading ? (
            <ActivityIndicator size="large" color="#FF6B6B" />
          ) : (
            <>
              <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>登录</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.secondaryButton} 
                onPress={() => setAppState(appState === 'register' ? 'login' : 'register')}
              >
                <Text style={styles.secondaryButtonText}>
                  {appState === 'register' ? '返回登录' : '没有账号？去注册'}
                </Text>
              </TouchableOpacity>

              {appState === 'register' && (
                <TouchableOpacity style={styles.button} onPress={handleRegister}>
                  <Text style={styles.buttonText}>注册新账号</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    );
  }

  // 主界面
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      {/* 顶部栏 */}
      <View style={styles.topBar}>
        <Text style={styles.greeting}>
          你好，{currentUser?.nickname || currentUser?.username || '用户'}
        </Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>退出</Text>
        </TouchableOpacity>
      </View>

      {/* 视频区域 */}
      <View style={styles.videoContainer}>
        <Video
          source={getVideoSource()}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
        />
        <View style={styles.stateBadge}>
          <Text style={styles.stateText}>
            {appState === 'idle' ? '😴 待机中' : 
             appState === 'listening' ? '👂 聆听中' :
             appState === 'speaking' ? '🗣️ 回应中' : ''}
          </Text>
        </View>
      </View>

      {/* 对话区域 */}
      <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent}>
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>开始和我聊天吧！</Text>
          </View>
        ) : (
          messages.map((msg) => (
            <View 
              key={msg.id} 
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userMessage : styles.assistantMessage
              ]}
            >
              <Text style={styles.messageText}>{msg.content}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* 输入区域 */}
      <View style={styles.inputArea}>
        <TextInput
          style={styles.chatInput}
          placeholder="输入消息..."
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSendMessage}
          multiline
        />
        <TouchableOpacity 
          style={styles.sendButton} 
          onPress={handleSendMessage}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>发送</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#FFE66D',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  form: {
    padding: 24,
    gap: 16,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#FF6B6B',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 12,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#FFE66D',
  },
  greeting: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  logoutBtn: {
    padding: 8,
  },
  logoutText: {
    color: '#666',
    fontSize: 14,
  },
  videoContainer: {
    height: 300,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  stateBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  stateText: {
    color: '#fff',
    fontSize: 12,
  },
  chatArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  chatContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF6B6B',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 60,
    backgroundColor: '#FF6B6B',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});