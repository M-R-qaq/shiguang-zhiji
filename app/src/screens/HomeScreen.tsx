import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useAppStore, AppState } from '../store/appStore';
import { apiService } from '../services/api';

// 视频资源路径
const VIDEO_IDLE = require('../../assets/videos/idle.mp4');
const VIDEO_LISTENING = require('../../assets/videos/listening.mp4');
const VIDEO_SPEAKING = require('../../assets/videos/speaking.mp4');

export default function HomeScreen() {
  const navigation = useNavigation();
  const { logout, user } = useAuth();
  const {
    appState,
    isRecording,
    isPlaying,
    messages,
    isLoading,
    setIsLoading,
    addMessage,
    enterListeningState,
    enterSpeakingState,
    enterIdleState,
  } = useAppStore();

  const videoRef = useRef<Video>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  // 获取视频源
  const getVideoSource = () => {
    switch (appState) {
      case 'listening': return VIDEO_LISTENING;
      case 'speaking': return VIDEO_SPEAKING;
      default: return VIDEO_IDLE;
    }
  };

  // 开始录音
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要录音权限');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      enterListeningState();
      startListeningTimeout();
    } catch (error) {
      console.error('录音失败:', error);
    }
  };

  // 停止录音
  const stopRecording = async () => {
    try {
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        await processAudio(uri);
      }
    } catch (error) {
      console.error('停止录音失败:', error);
      enterIdleState();
    }
  };

  // 处理音频
  const processAudio = async (audioUri: string) => {
    setIsLoading(true);
    
    try {
      // 1. ASR 语音识别
      const audioBlob = await (await fetch(audioUri)).blob();
      const asrResponse = await apiService.transcribe(audioBlob);
      
      const userText = asrResponse.text.trim();
      
      if (!userText) {
        enterIdleState();
        return;
      }

      addMessage('user', userText);

      // 2. 检查是否退出
      const exitKeywords = ['不想聊了', '再见', '退下吧', '告辞', '拜拜'];
      const shouldExit = exitKeywords.some(keyword => userText.includes(keyword));
      
      if (shouldExit) {
        await sendGoodbye();
        return;
      }

      // 3. LLM 对话
      const llmResponse = await apiService.chat(userText);
      const assistantText = llmResponse.response;
      
      addMessage('assistant', assistantText);

      // 4. TTS 语音合成（等待播放完成）
      await playTTS(assistantText);
      
      // TTS播放完成后回到聆听状态
      console.log('[流程] TTS 播放完成，回到聆听状态');
      enterListeningState();
      startListeningTimeout();
      
    } catch (error: any) {
      console.error('处理音频失败:', error);
      const detail = error.response?.data?.detail || error.message || '处理失败，请重试';
      Alert.alert('错误', detail);
      enterIdleState();
    } finally {
      setIsLoading(false);
    }
  };

  // 发送告别语
  const sendGoodbye = async () => {
    const goodbyeMessage = '既然您要离开了，那我便不多留。愿君一路顺风，有缘再会！';
    addMessage('assistant', goodbyeMessage);
    await playTTS(goodbyeMessage);
    enterIdleState();
  };

  // 播放TTS音频（返回Promise，播放完成后resolve）
  const playTTS = async (text: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('[TTS] 开始播放:', text.substring(0, 30) + '...');
        enterSpeakingState();

        // 设置音频模式：允许播放、在静音模式也播放、不独占音频焦点
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

        // 将 base64 写入临时文件
        const tempFile = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
        console.log('[TTS] 写入临时文件:', tempFile);
        await FileSystem.writeAsStringAsync(tempFile, audioBase64, {
          encoding: 'base64',
        });

        // 验证文件存在
        const fileInfo = await FileSystem.getInfoAsync(tempFile);
        console.log('[TTS] 文件信息:', fileInfo);

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: tempFile },
          { shouldPlay: true, volume: 1.0 }
        );
        console.log('[TTS] Sound 对象创建成功');

        setSound(newSound);

        // 监听播放状态
        newSound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) {
            console.log('[TTS] Sound 未加载');
            return;
          }
          console.log('[TTS] 播放状态:', status.isPlaying, '位置:', status.positionMillis, '时长:', status.durationMillis);

          if (status.didJustFinish) {
            console.log('[TTS] 播放完成');
            newSound.unloadAsync();
            setSound(null);
            FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
            resolve();
          }
        });

      } catch (error: any) {
        console.error('[TTS] 播放失败:', error);
        Alert.alert('TTS 播放失败', error.message || '未知错误');
        enterIdleState();
        reject(error);
      }
    });
  };

  // 打断TTS播放
  const interruptTTS = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    enterIdleState();
  };

  // 聆听超时
  const startListeningTimeout = () => {
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
    listeningTimeoutRef.current = setTimeout(() => {
      if (appState === 'listening') {
        stopRecording();
      }
    }, 30000); // 30秒超时
  };

  // 处理屏幕点击
  const handleScreenTap = () => {
    if (appState === 'speaking') {
      // 打断TTS
      interruptTTS();
    } else if (appState === 'idle') {
      // 唤醒（模拟唤醒词检测）
      startRecording();
    }
  };

  // 登出
  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: async () => {
          await logout();
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' as never }],
          });
        }},
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={handleScreenTap}
    >
      {/* 视频背景 */}
      <Video
        ref={videoRef}
        source={getVideoSource()}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />

      {/* 状态指示器 */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {appState === 'idle' ? '点击屏幕开始对话' :
           appState === 'listening' ? '正在聆听...' :
           appState === 'speaking' ? '正在说话...' : ''}
        </Text>
        {isLoading && <ActivityIndicator color="#fff" style={styles.loader} />}
      </View>

      {/* 消息列表 */}
      <ScrollView style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
        {messages.map((msg) => (
          <View key={msg.id} style={[
            styles.messageBubble,
            msg.role === 'user' ? styles.userBubble : styles.assistantBubble
          ]}>
            <Text style={styles.messageText}>{msg.content}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 底部工具栏 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  statusBar: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  loader: {
    marginTop: 8,
  },
  messagesContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    maxHeight: 250,
  },
  messagesContent: {
    paddingVertical: 10,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#e94560',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  logoutButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
  },
});
