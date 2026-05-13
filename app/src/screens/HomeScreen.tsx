import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useAppStore } from '../store/appStore';
import { apiService } from '../services/api';
import { RootStackParamList } from '../../App';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const VIDEO_IDLE = require('../../assets/videos/idle.mp4');
const VIDEO_LISTENING = require('../../assets/videos/listening.mp4');
const VIDEO_SPEAKING = require('../../assets/videos/speaking.mp4');

const STREAM_CONFIG = {
  CHUNK_INTERVAL: 2000,
  SILENCE_THRESHOLD: 3,
  SILENCE_DB_THRESHOLD: -40,
  VAD_INTERVAL: 200,
  MAX_RECORDING_DURATION: 30000,
};

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { logout, user } = useAuth();
  const {
    appState,
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
  const ttsResolverRef = useRef<(() => void) | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);
  const ttsTempFileRef = useRef<string>('');
  const scrollViewRef = useRef<ScrollView>(null);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceCountRef = useRef<number>(0);
  const localSilenceCountRef = useRef<number>(0);
  const recordingStartRef = useRef<number | null>(null);
  const detectedTextRef = useRef<string>('');
  const [detectionStatus, setDetectionStatus] = useState<string>('');
  const [detectionProgress, setDetectionProgress] = useState<number>(0);
  const chunkIndexRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const asrPromiseRef = useRef<Promise<void> | null>(null);
  const hasSpeechRef = useRef<boolean>(false);
  const currentRecordingRef = useRef<Audio.Recording | null>(null);

  const getVideoSource = () => {
    switch (appState) {
      case 'listening': return VIDEO_LISTENING;
      case 'speaking': return VIDEO_SPEAKING;
      default: return VIDEO_IDLE;
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const stopStreamingDetection = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    silenceCountRef.current = 0;
    localSilenceCountRef.current = 0;
  };

  const checkVAD = async (recordingInstance: Audio.Recording): Promise<boolean> => {
    try {
      const status = await recordingInstance.getStatusAsync();
      if (status.isRecording && status.metering !== undefined) {
        const db = status.metering;
        
        if (db > STREAM_CONFIG.SILENCE_DB_THRESHOLD) {
          localSilenceCountRef.current = 0;
          hasSpeechRef.current = true;
          return false;
        } else {
          localSilenceCountRef.current++;
          
          if (hasSpeechRef.current) {
            const progress = Math.min(100, (localSilenceCountRef.current / STREAM_CONFIG.SILENCE_THRESHOLD) * 100);
            setDetectionProgress(progress);
            setDetectionStatus(`静音中 ${Math.round(progress)}%...`);
            console.log(`[VAD] 本地静音检测 ${localSilenceCountRef.current}/${STREAM_CONFIG.SILENCE_THRESHOLD}, dB: ${db.toFixed(1)}`);
          }
          
          if (localSilenceCountRef.current >= STREAM_CONFIG.SILENCE_THRESHOLD && hasSpeechRef.current) {
            console.log('[VAD] 本地检测到说话结束');
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('[VAD] 检测失败:', error);
      return false;
    }
  };

  const processAudioChunk = async (audioUri: string): Promise<void> => {
    try {
      chunkIndexRef.current++;
      console.log(`[ASR] 后台处理第 ${chunkIndexRef.current} 个分片...`);

      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const asrResponse = await apiService.transcribeBase64(base64Audio);
      const text = asrResponse.text?.trim() || '';

      if (text) {
        console.log(`[ASR] 识别文本: "${text}"`);
        detectedTextRef.current += (detectedTextRef.current ? ' ' : '') + text;
        silenceCountRef.current = 0;
        localSilenceCountRef.current = 0;
        setDetectionStatus(`检测中...`);
        setDetectionProgress(0);
      } else {
        silenceCountRef.current++;
      }
    } catch (error) {
      console.error('[ASR] 分片处理失败:', error);
    }
  };

  const startRecordingSession = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        meteringEnabled: true,
      });

      return newRecording;
    } catch (error) {
      console.error('[录音] 创建录音失败:', error);
      return null;
    }
  };

  const stopRecordingSession = async (recInstance: Audio.Recording): Promise<string | null> => {
    try {
      const status = await recInstance.getStatusAsync();
      if (status.isRecording) {
        await new Promise(r => setTimeout(r, 100));
        await recInstance.stopAndUnloadAsync();
      } else {
        try { await recInstance.unloadAsync(); } catch {}
      }
      const uri = recInstance.getURI();
      return uri || null;
    } catch (error) {
      console.error('[录音] 停止录音失败:', error);
      try { await recInstance.unloadAsync(); } catch {}
      return null;
    }
  };

  const startStreamingDetection = async () => {
    stopStreamingDetection();
    recordingStartRef.current = Date.now();
    detectedTextRef.current = '';
    silenceCountRef.current = 0;
    localSilenceCountRef.current = 0;
    chunkIndexRef.current = 0;
    isProcessingRef.current = false;
    isStoppingRef.current = false;
    hasSpeechRef.current = false;
    asrPromiseRef.current = null;
    currentRecordingRef.current = null;

    setDetectionStatus('开始聆听...');
    setDetectionProgress(0);

    const initialRecording = await startRecordingSession();
    if (!initialRecording) {
      return;
    }
    currentRecordingRef.current = initialRecording;
    setRecording(initialRecording);

    console.log('[ASR] 流式检测启动，本地VAD已启用');

    vadIntervalRef.current = setInterval(async () => {
      if (isStoppingRef.current || !currentRecordingRef.current) {
        return;
      }

      try {
        const shouldStop = await checkVAD(currentRecordingRef.current);
        
        if (shouldStop) {
          isStoppingRef.current = true;
          stopStreamingDetection();
          
          if (currentRecordingRef.current) {
            await stopRecordingSession(currentRecordingRef.current);
            currentRecordingRef.current = null;
          }
          setRecording(null);
          
          if (asrPromiseRef.current) {
            console.log('[ASR] 等待最后一个ASR处理完成...');
            await asrPromiseRef.current;
          }
          
          await handleRecordingComplete();
        }
      } catch (error) {
        console.error('[VAD] 检测错误:', error);
      }
    }, STREAM_CONFIG.VAD_INTERVAL);

    streamIntervalRef.current = setInterval(async () => {
      if (isProcessingRef.current || isStoppingRef.current || !currentRecordingRef.current) {
        return;
      }

      try {
        const now = Date.now();
        const elapsed = now - (recordingStartRef.current || now);

        if (elapsed >= STREAM_CONFIG.MAX_RECORDING_DURATION) {
          console.log('[ASR] 达到最大录音时长，自动停止');
          isStoppingRef.current = true;
          stopStreamingDetection();
          
          if (currentRecordingRef.current) {
            await stopRecordingSession(currentRecordingRef.current);
            currentRecordingRef.current = null;
          }
          setRecording(null);
          
          if (asrPromiseRef.current) {
            await asrPromiseRef.current;
          }
          
          await handleRecordingComplete();
          return;
        }

        isProcessingRef.current = true;

        const status = await currentRecordingRef.current.getStatusAsync();
        if (status.isRecording) {
          const oldRecording = currentRecordingRef.current;
          const uri = await stopRecordingSession(oldRecording);
          currentRecordingRef.current = null;
          
          if (uri) {
            asrPromiseRef.current = processAudioChunk(uri);
          }
          
          const newRecording = await startRecordingSession();
          if (newRecording) {
            currentRecordingRef.current = newRecording;
            setRecording(newRecording);
          }
        }

        isProcessingRef.current = false;
      } catch (error) {
        console.error('[ASR] 分片上传错误:', error);
        isProcessingRef.current = false;
      }
    }, STREAM_CONFIG.CHUNK_INTERVAL);
  };

  const handleRecordingComplete = async () => {
    const finalText = detectedTextRef.current.trim();
    console.log('[录音] 最终识别结果:', finalText);

    if (finalText) {
      await processFinalText(finalText);
    } else {
      console.log('[ASR] 没有识别到任何语音内容');
      enterIdleState();
    }
  };

  const startRecording = async () => {
    try {
      console.log('[录音] 请求权限...');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要录音权限');
        return;
      }

      enterListeningState();
      startListeningTimeout();
      startStreamingDetection();
      console.log('[录音] 开始录音，流式ASR检测已启动');
    } catch (error) {
      console.error('[录音] 失败:', error);
    }
  };

  const stopRecording = async () => {
    try {
      console.log('[录音] 停止录音...');
      isStoppingRef.current = true;
      stopStreamingDetection();

      if (currentRecordingRef.current) {
        const uri = await stopRecordingSession(currentRecordingRef.current);
        currentRecordingRef.current = null;
        if (uri) {
          await processAudioChunk(uri);
        }
      }

      if (asrPromiseRef.current) {
        console.log('[ASR] 等待所有ASR处理完成...');
        await asrPromiseRef.current;
      }

      setRecording(null);
      await handleRecordingComplete();
    } catch (error) {
      console.error('[录音] 停止失败:', error);
      currentRecordingRef.current = null;
      setRecording(null);
      enterIdleState();
    }
  };

  const processFinalText = async (userText: string) => {
    setIsLoading(true);

    try {
      addMessage('user', userText);

      const exitKeywords = ['不想聊了', '再见', '退下吧', '告辞', '拜拜'];
      const shouldExit = exitKeywords.some(keyword => userText.includes(keyword));

      if (shouldExit) {
        await sendGoodbye();
        return;
      }

      const llmResponse = await apiService.chat(userText);
      const assistantText = llmResponse.response;

      addMessage('assistant', assistantText);

      if (llmResponse.memories_added > 0) {
        addMessage('system', `已记住 ${llmResponse.memories_added} 条关于你的信息`);
      }
      if (llmResponse.memories_updated > 0) {
        addMessage('system', `已更新 ${llmResponse.memories_updated} 条记忆`);
      }
      if (llmResponse.memories_deleted > 0) {
        addMessage('system', `已删除 ${llmResponse.memories_deleted} 条过时记忆`);
      }

      await playTTS(assistantText);

      console.log('[流程] TTS 播放完成，开始聆听');
      startRecording();

    } catch (error: any) {
      console.error('[流程] 处理失败:', error);
      const detail = error.message || '处理失败，请重试';
      Alert.alert('错误', detail);
      enterIdleState();
    } finally {
      setIsLoading(false);
    }
  };

  const sendGoodbye = async () => {
    const goodbyeMessage = '既然您要离开了，那我便不多留。愿君一路顺风，有缘再会！';
    addMessage('assistant', goodbyeMessage);
    await playTTS(goodbyeMessage);
    enterIdleState();
  };

  const playTTS = async (text: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      ttsResolverRef.current = resolve;
      ttsTempFileRef.current = '';

      try {
        console.log('[TTS] 开始播放:', text.substring(0, 30) + '...');
        enterSpeakingState();

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
        ttsTempFileRef.current = tempFile;
        await FileSystem.writeAsStringAsync(tempFile, audioBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: tempFile },
          { shouldPlay: true, volume: 1.0 }
        );

        setSound(newSound);
        ttsSoundRef.current = newSound;

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;

          if (status.didJustFinish) {
            console.log('[TTS] 播放完成');
            newSound.unloadAsync();
            setSound(null);
            ttsSoundRef.current = null;
            ttsResolverRef.current = null;
            if (ttsTempFileRef.current) {
              FileSystem.deleteAsync(ttsTempFileRef.current, { idempotent: true }).catch(() => {});
              ttsTempFileRef.current = '';
            }
            resolve();
          }
        });

      } catch (error: any) {
        console.error('[TTS] 播放失败:', error);
        ttsResolverRef.current = null;
        ttsSoundRef.current = null;
        if (ttsTempFileRef.current) {
          FileSystem.deleteAsync(ttsTempFileRef.current, { idempotent: true }).catch(() => {});
          ttsTempFileRef.current = '';
        }
        Alert.alert('TTS 播放失败', error.message || '未知错误');
        enterIdleState();
        reject(error);
      }
    });
  };

  const interruptTTS = async () => {
    console.log('[TTS] 打断播放');

    if (ttsSoundRef.current) {
      try {
        await ttsSoundRef.current.stopAsync();
        await ttsSoundRef.current.unloadAsync();
        ttsSoundRef.current = null;
      } catch (e) {
        console.error('[TTS] 停止播放出错:', e);
      }
    }
    setSound(null);

    if (ttsTempFileRef.current) {
      FileSystem.deleteAsync(ttsTempFileRef.current, { idempotent: true }).catch(() => {});
      ttsTempFileRef.current = '';
    }

    if (ttsResolverRef.current) {
      ttsResolverRef.current();
      ttsResolverRef.current = null;
    }

    enterIdleState();
    console.log('[TTS] 已打断，回到空闲状态');
  };

  const startListeningTimeout = () => {
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
    listeningTimeoutRef.current = setTimeout(() => {
      if (appState === 'listening') {
        console.log('[超时] 30秒无操作，自动停止录音');
        stopRecording();
      }
    }, STREAM_CONFIG.MAX_RECORDING_DURATION + 5000);
  };

  const handleScreenTap = () => {
    console.log('[屏幕点击] 当前状态:', appState);
    if (appState === 'speaking') {
      interruptTTS();
    } else if (appState === 'idle') {
      startRecording();
    } else if (appState === 'listening') {
      stopRecording();
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: async () => {
          await logout();
          navigation.replace('Login');
        }},
      ]
    );
  };

  const getStatusText = () => {
    if (appState === 'listening') {
      return detectionStatus || '正在聆听...';
    }
    return '';
  };

  const getDetectionProgress = () => {
    if (appState === 'listening' && detectionProgress > 0) {
      return detectionProgress;
    }
    return 0;
  };

  return (
    <TouchableWithoutFeedback onPress={handleScreenTap}>
      <View style={styles.container}>
        <Video
          ref={videoRef}
          source={getVideoSource()}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
        />

        <View style={styles.topBar}>
          <TouchableWithoutFeedback onPress={() => navigation.navigate('Memory')}>
            <View style={styles.iconButton}>
              <Text style={styles.iconText}>🧠</Text>
            </View>
          </TouchableWithoutFeedback>

          <View style={styles.statusIndicator}>
            <Text style={styles.statusText}>
              {appState === 'idle' ? '点击屏幕开始对话' :
               appState === 'listening' ? getStatusText() :
               appState === 'speaking' ? '点击打断' : ''}
            </Text>
            {isLoading && <ActivityIndicator color="#fff" size="small" style={styles.loader} />}
          </View>

          <View style={styles.topBarRight}>
            <TouchableWithoutFeedback onPress={() => navigation.navigate('Diagnostics')}>
              <View style={styles.iconButton}>
                <Text style={styles.iconText}>🔬</Text>
              </View>
            </TouchableWithoutFeedback>
            <TouchableWithoutFeedback onPress={() => navigation.navigate('Settings')}>
              <View style={styles.iconButton}>
                <Text style={styles.iconText}>⚙️</Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </View>

        {appState === 'listening' && getDetectionProgress() > 0 && (
          <View style={styles.detectionContainer}>
            <View style={styles.detectionBar}>
              <View style={[styles.detectionProgress, { width: `${getDetectionProgress()}%` }]} />
            </View>
            <Text style={styles.detectionHint}>检测语音结束中...</Text>
          </View>
        )}

        <View style={styles.messagesWrapper}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={true}
            indicatorStyle="white"
            persistentScrollbar={true}
            scrollIndicatorInsets={{ right: 1 }}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✨</Text>
                <Text style={styles.emptyText}>点击屏幕开始对话</Text>
                <Text style={styles.emptySubtext}>我是苏怀真，一位充满智慧的文人</Text>
              </View>
            ) : (
              messages.map((msg) => (
                <View key={msg.id} style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userBubble :
                  msg.role === 'system' ? styles.systemBubble :
                  styles.assistantBubble
                ]}>
                  <Text style={[
                    styles.messageText,
                    msg.role === 'system' && styles.systemMessageText
                  ]}>{msg.content}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>

        <View style={styles.bottomBar}>
          <TouchableWithoutFeedback onPress={handleLogout}>
            <View style={styles.logoutButton}>
              <Text style={styles.logoutText}>退出登录</Text>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </TouchableWithoutFeedback>
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
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconText: {
    fontSize: 20,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  loader: {
    marginLeft: 8,
  },
  detectionContainer: {
    position: 'absolute',
    top: 110,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  detectionBar: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  detectionProgress: {
    height: '100%',
    backgroundColor: '#e94560',
    borderRadius: 2,
  },
  detectionHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
  messagesWrapper: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.45, 280),
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
    opacity: 0.8,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
  },
  messageBubble: {
    padding: 14,
    borderRadius: 18,
    marginVertical: 5,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#e94560',
    borderBottomRightRadius: 6,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: 'rgba(233,69,96,0.25)',
    borderRadius: 14,
    maxWidth: '95%',
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.3)',
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  systemMessageText: {
    fontSize: 13,
    textAlign: 'center',
    color: '#ffd700',
    fontWeight: '600',
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
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});