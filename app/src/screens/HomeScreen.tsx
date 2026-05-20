﻿import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Linking,
  TouchableOpacity,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useAppStore, VideoResult } from '../store/appStore';
import { apiService } from '../services/api';
import { wakeWordService } from '../services/wakeWordService';
import ShiguangjianModal from '../components/ShiguangjianModal';
import MessageActionSheet from '../components/MessageActionSheet';
import IconButton from '../components/IconButton';
import { colors, spacing, radius, typography } from '../theme';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const VIDEO_IDLE = require('../../assets/videos/idle.mp4');
const VIDEO_EATING = require('../../assets/videos/eating.mp4');
const VIDEO_LISTENING = require('../../assets/videos/listening.mp4');
const VIDEO_SPEAKING = require('../../assets/videos/speaking.mp4');

const VAD_CONFIG = {
  SILENCE_THRESHOLD: 5,
  SILENCE_DB_THRESHOLD: -30,
  SPEECH_ONSET_THRESHOLD: 3,
  VAD_INTERVAL: 250,
  MAX_RECORDING_DURATION: 30000,
  ASR_WAIT_TIMEOUT: 15000,
  NO_SPEECH_TIMEOUT: 10000,
};

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { logout, user } = useAuth();
  const {
    appState,
    shiguangjianVisible,
    messages,
    isLoading,
    sessionId,
    setIsLoading,
    addMessage,
    finalizeLastAssistantMessage,
    deleteMessage,
    updateMessageWebSearch,
    clearMessages,
    setSessionId,
    startNewSession,
    setMessages,
    enterListeningState,
    enterSpeakingState,
    enterIdleState,
    initializeStore,
    showShiguangjian,
    dismissShiguangjian,
  } = useAppStore();

  const videoRef = useRef<Video>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const ttsResolverRef = useRef<(() => void) | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);
  const ttsTempFileRef = useRef<string>('');
  const scrollViewRef = useRef<ScrollView>(null);

  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localSilenceCountRef = useRef<number>(0);
  const hasSpeechRef = useRef<boolean>(false);
  const speechOnsetCountRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);
  const currentRecordingRef = useRef<Audio.Recording | null>(null);
  const isStoppingRef = useRef<boolean>(false);
  const skipPlaybackRef = useRef<boolean>(false);
  const [detectionStatus, setDetectionStatus] = useState<string>('');
  const [detectionProgress, setDetectionProgress] = useState<number>(0);
  const [expandedWebSearch, setExpandedWebSearch] = useState<Set<string>>(new Set());
  const [actionSheetMessage, setActionSheetMessage] = useState<{ id: string; role: string; content: string } | null>(null);

  const toggleWebSearchExpand = (msgId: string) => {
    setExpandedWebSearch(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const idleVideoRef = useRef<typeof VIDEO_IDLE>(VIDEO_IDLE);

  const selectIdleVideo = () => {
    const selected = Math.random() < 0.2 ? VIDEO_EATING : VIDEO_IDLE;
    const changed = idleVideoRef.current !== selected;
    idleVideoRef.current = selected;
    if (changed && videoRef.current) {
      videoRef.current.loadAsync(selected, {
        shouldPlay: true,
        isLooping: true,
        isMuted: true,
      }).catch(() => {});
    }
  };

  const getVideoSource = () => {
    switch (appState) {
      case 'listening': return VIDEO_LISTENING;
      case 'speaking': return VIDEO_SPEAKING;
      default: return idleVideoRef.current;
    }
  };

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        console.log('[视频] 应用回到前台，恢复视频播放');
        if (videoRef.current) {
          videoRef.current.playAsync().catch((e: any) => {
            console.warn('[视频] 恢复播放失败，尝试重新加载:', e.message);
            const source = getVideoSource();
            videoRef.current!.unloadAsync().then(() => {
              return videoRef.current!.loadAsync(source, {
                shouldPlay: true,
                isLooping: true,
                isMuted: true,
              });
            }).catch(() => {});
          });
        }
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (appState === 'idle') {
      selectIdleVideo();
    }
  }, [appState]);

  useEffect(() => {
    initializeStore();

    if (Platform.OS === 'android') {
      (async () => {
        try {
          const { status } = await Audio.requestPermissionsAsync();
          if (status !== 'granted') {
            console.log('[WakeWord] 麦克风权限未授予');
            return;
          }
          const config = await apiService.getWakeWordConfig();
          const keyword = config.wake_word || '你好知己';
          const ok = await wakeWordService.initialize(keyword);
          if (ok) {
            console.log('[WakeWord] 初始化成功，准备启动监听');
            const started = await wakeWordService.startListening(async (detectedKeyword) => {
              console.log('[唤醒词] 检测到:', detectedKeyword);
              await wakeWordService.stopListening();
              enterListeningState();
              startRecording();
            });
            console.log('[WakeWord] 监听启动结果:', started);
          }
        } catch (e: any) {
          console.error('[WakeWord] 初始化异常:', e?.message || e);
          await wakeWordService.initialize('你好知己');
        }
      })();
    }

    return () => {
      wakeWordService.release();
    };
  }, []);

  useEffect(() => {
    if (appState === 'idle' && Platform.OS === 'android' && wakeWordService.isInitialized() && !wakeWordService.isListening()) {
      console.log('[WakeWord] 进入idle，启动监听');
      wakeWordService.startListening(async (keyword) => {
        console.log('[唤醒词] 检测到:', keyword);
        await wakeWordService.stopListening();
        enterListeningState();
        startRecording();
      }).then(ok => {
        console.log('[WakeWord] idle监听启动结果:', ok);
      });
    } else if (appState !== 'idle' && wakeWordService.isListening()) {
      console.log('[WakeWord] 离开idle，停止监听');
      wakeWordService.stopListening();
    }
  }, [appState]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      stopVAD();
      if (currentRecordingRef.current) {
        try { currentRecordingRef.current.stopAndUnloadAsync(); } catch {}
      }
      if (ttsSoundRef.current) {
        try { ttsSoundRef.current.stopAsync(); ttsSoundRef.current.unloadAsync(); } catch {}
      }
      if (ttsTempFileRef.current) {
        FileSystem.deleteAsync(ttsTempFileRef.current, { idempotent: true }).catch(() => {});
      }
    };
  }, []);

  const stopVAD = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    localSilenceCountRef.current = 0;
    hasSpeechRef.current = false;
    speechOnsetCountRef.current = 0;
  };

  const checkVAD = async (recordingInstance: Audio.Recording): Promise<boolean> => {
    try {
      const status = await recordingInstance.getStatusAsync();
      if (status.isRecording && status.metering !== undefined) {
        const db = status.metering;

        if (db > VAD_CONFIG.SILENCE_DB_THRESHOLD) {
          if (!hasSpeechRef.current) {
            speechOnsetCountRef.current++;
            if (speechOnsetCountRef.current >= VAD_CONFIG.SPEECH_ONSET_THRESHOLD) {
              hasSpeechRef.current = true;
              speechOnsetCountRef.current = 0;
              setDetectionStatus('检测到说话...');
            }
          }
          localSilenceCountRef.current = 0;
          return false;
        } else {
          speechOnsetCountRef.current = 0;
          if (hasSpeechRef.current) {
            localSilenceCountRef.current++;
            const progress = Math.min(100, (localSilenceCountRef.current / VAD_CONFIG.SILENCE_THRESHOLD) * 100);
            setDetectionProgress(progress);
            setDetectionStatus(`静音中 ${Math.round(progress)}%...`);
          }
          if (localSilenceCountRef.current >= VAD_CONFIG.SILENCE_THRESHOLD && hasSpeechRef.current) {
            console.log('[VAD] 检测到说话结束');
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

  const forceCleanupRecording = async () => {
    try {
      if (currentRecordingRef.current) {
        try { await currentRecordingRef.current.stopAndUnloadAsync(); } catch {}
        currentRecordingRef.current = null;
      }
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch {}
      }
      setRecording(null);
    } catch (error) {
      console.error('[录音] 强制清理失败:', error);
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

      if (ttsSoundRef.current) {
        try { await ttsSoundRef.current.stopAsync(); } catch {}
        try { await ttsSoundRef.current.unloadAsync(); } catch {}
        ttsSoundRef.current = null;
        setSound(null);
      }

      if (ttsTempFileRef.current) {
        FileSystem.deleteAsync(ttsTempFileRef.current, { idempotent: true }).catch(() => {});
        ttsTempFileRef.current = '';
      }

      await forceCleanupRecording();

      await new Promise(r => setTimeout(r, 500));

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: true,
        staysActiveInBackground: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      currentRecordingRef.current = newRecording;
      setRecording(newRecording);
      isStoppingRef.current = false;
      hasSpeechRef.current = false;
      localSilenceCountRef.current = 0;
      speechOnsetCountRef.current = 0;
      recordingStartTimeRef.current = Date.now();

      enterListeningState();
      startListeningTimeout();
      setDetectionStatus('正在聆听...');
      setDetectionProgress(0);

      console.log('[录音] 录音已启动，VAD检测已启用');

      vadIntervalRef.current = setInterval(async () => {
        if (isStoppingRef.current || !currentRecordingRef.current) {
          return;
        }

        try {
          if (!hasSpeechRef.current && recordingStartTimeRef.current > 0) {
            const elapsed = Date.now() - recordingStartTimeRef.current;
            if (elapsed >= VAD_CONFIG.NO_SPEECH_TIMEOUT) {
              console.log('[VAD] 10秒无声音，退出聆听状态');
              recordingStartTimeRef.current = 0;
              stopVAD();
              if (currentRecordingRef.current) {
                try { await currentRecordingRef.current.stopAndUnloadAsync(); } catch {}
                currentRecordingRef.current = null;
                setRecording(null);
              }
              enterIdleState();
              return;
            }
          }

          const shouldStop = await checkVAD(currentRecordingRef.current);
          if (shouldStop) {
            await finishRecording();
          }
        } catch (error) {
          console.error('[VAD] 检测错误:', error);
        }
      }, VAD_CONFIG.VAD_INTERVAL);

    } catch (error) {
      console.error('[录音] 启动失败:', error);
      await forceCleanupRecording();
      enterIdleState();
    }
  };

  const isHallucination = (text: string): boolean => {
    const tokens = text.split(/[\s,，。！？、；：]+/).filter(t => t.length > 0);
    if (tokens.length < 4) return false;
    const freq: Record<string, number> = {};
    for (const t of tokens) {
      freq[t] = (freq[t] || 0) + 1;
    }
    const maxCount = Math.max(...Object.values(freq));
    return maxCount / tokens.length > 0.7;
  };

  const asrEmptyCountRef = useRef<number>(0);
  const MAX_ASR_EMPTY = 3;

  const finishRecording = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }

    console.log('[录音] 停止录音，开始识别...');
    stopVAD();
    setDetectionStatus('识别中...');
    setDetectionProgress(0);

    let audioUri: string | null = null;
    if (currentRecordingRef.current) {
      try {
        const rec = currentRecordingRef.current;
        const status = await rec.getStatusAsync();
        if (status.isRecording) {
          await new Promise(r => setTimeout(r, 100));
          await rec.stopAndUnloadAsync();
        } else {
          try { await rec.stopAndUnloadAsync(); } catch {}
        }
        audioUri = rec.getURI();
      } catch (error) {
        console.error('[录音] 停止录音失败:', error);
        try { await currentRecordingRef.current?.stopAndUnloadAsync(); } catch {}
      }
      currentRecordingRef.current = null;
      setRecording(null);
    }

    if (videoRef.current) {
      try { await videoRef.current.playAsync(); } catch {}
    }

    if (!audioUri) {
      console.log('[录音] 无录音文件');
      enterIdleState();
      return;
    }

    try {
      console.log('[ASR] 发送完整录音识别...');
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const asrResponse = await Promise.race([
        apiService.transcribeBase64(base64Audio),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ASR超时')), VAD_CONFIG.ASR_WAIT_TIMEOUT)
        ),
      ]);

      const text = asrResponse.text?.trim() || '';
      console.log('[ASR] 识别结果:', text || '(空)');

      if (text && isHallucination(text)) {
        console.log('[ASR] 检测到幻觉输出，丢弃:', text.substring(0, 50));
        asrEmptyCountRef.current++;
        if (asrEmptyCountRef.current >= MAX_ASR_EMPTY) {
          console.log('[ASR] 连续空识别达到上限，回退idle');
          asrEmptyCountRef.current = 0;
          enterIdleState();
        } else {
          await startRecording();
        }
      } else if (text) {
        asrEmptyCountRef.current = 0;
        await processFinalText(text);
      } else {
        asrEmptyCountRef.current++;
        console.log(`[ASR] 没有识别到语音内容 (${asrEmptyCountRef.current}/${MAX_ASR_EMPTY})`);
        if (asrEmptyCountRef.current >= MAX_ASR_EMPTY) {
          console.log('[ASR] 连续空识别达到上限，回退idle');
          asrEmptyCountRef.current = 0;
          enterIdleState();
        } else {
          await startRecording();
        }
      }
    } catch (error: any) {
      console.error('[ASR] 识别失败:', error);
      asrEmptyCountRef.current++;
      if (asrEmptyCountRef.current >= MAX_ASR_EMPTY) {
        console.log('[ASR] 连续识别失败达到上限，回退idle');
        asrEmptyCountRef.current = 0;
        enterIdleState();
      } else {
        await startRecording();
      }
    }
  };

  const stopRecording = async () => {
    if (isStoppingRef.current) return;
    await finishRecording();
  };

  const processFinalText = async (userText: string) => {
    if (useAppStore.getState().isLoading) {
      console.log('[流程] 正在处理中，忽略重复请求');
      return;
    }

    setIsLoading(true);

    try {
      addMessage('user', userText);

      if (shiguangjianVisible) {
        const refreshKeywords = ['换一批', '换一个', '还有别的', '再推荐', '再来', '别的', '其他的', '换个'];
        if (refreshKeywords.some(k => userText.includes(k))) {
          console.log('[食光鉴] 用户请求换一批，关闭当前弹窗，等待新推荐');
        }
        dismissShiguangjian();
      }

      const exitKeywords = ['退出', '结束', '再见', '拜拜', '不聊了', '不想聊了', '退下吧', '告辞', '停'];
      const shouldExit = exitKeywords.some(keyword => userText.includes(keyword));

      if (shouldExit) {
        await sendGoodbye();
        return;
      }

      let assistantText = '';
      let usedStream = false;
      let careInjected = false;
      let searchQuery: string | null = null;
      let searchResults: any[] | null = null;
      let responseSessionId: string | null = null;
      let pendingSearchQuery: string | null = null;
      let pendingSearchResults: any[] | null = null;
      let streamPlaybackQueued = false;
      let playbackChain: Promise<void> = Promise.resolve();
      skipPlaybackRef.current = false;

      try {
        addMessage('assistant', '');
        const currentAssistantMsgId = useAppStore.getState().messages[useAppStore.getState().messages.length - 1]?.id || '';
        let accumulatedText = '';
        let displayedText = '';
        let webSearchData: { query: string; results: Array<{title: string; content: string; url: string}> } | null = null;

        const enqueueSentencePlayback = (sentence: string) => {
          const cleaned = sentence.replace(/【食光鉴[|｜].*?】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
          if (!cleaned) return;

          accumulatedText += cleaned;
          streamPlaybackQueued = true;

          const preloadPromise = preloadTTS(cleaned);
          playbackChain = playbackChain.then(async () => {
            try {
              if (skipPlaybackRef.current) return;
              displayedText += cleaned;
              finalizeLastAssistantMessage(displayedText);
              const currentFile = await preloadPromise;
              if (skipPlaybackRef.current) return;
              await playTTS(cleaned, currentFile);
            } catch (error) {
              console.error('[播放链] 播放失败:', error);
            }
          });
        };

        await apiService.chatStreamSSE(
          userText,
          (event) => {
            if (event.type === 'text_chunk') {
            } else if (event.type === 'sentence') {
              enqueueSentencePlayback(event.content);
            } else if (event.type === 'text_done') {
              assistantText = event.full_text || accumulatedText;
            } else if (event.type === 'care') {
              careInjected = event.care_injected || false;
            } else if (event.type === 'search') {
              searchQuery = event.search_query;
              searchResults = event.search_results;
              console.log('[食光鉴] 收到搜索事件:', searchQuery, '结果数:', searchResults?.length || 0);
            } else if (event.type === 'web_search') {
              const wsResults: Array<{title: string; content: string; url: string}> = (event.web_search_results || []).map((r: any) => ({
                title: r.title || '',
                content: r.content || '',
                url: r.url || '',
              }));
              webSearchData = { query: event.web_search_query || '', results: wsResults };
              if (currentAssistantMsgId) {
                updateMessageWebSearch(currentAssistantMsgId, webSearchData);
              }
            } else if (event.type === 'done') {
              responseSessionId = event.session_id || null;
            }
          },
          [],
          sessionId || undefined
        );

        usedStream = true;

        if (responseSessionId && !sessionId) {
          setSessionId(responseSessionId);
        }

        pendingSearchQuery = searchQuery;
        pendingSearchResults = searchResults;

        await playbackChain;

        if (displayedText !== assistantText && assistantText) {
          finalizeLastAssistantMessage(assistantText);
        }

      } catch (streamError: any) {
        console.warn('[流程] 流式对话失败，降级为非流式:', streamError.message);

        if (!usedStream && !streamPlaybackQueued) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content) {
            setMessages(messages.slice(0, -1));
          }

          const llmResponse = await apiService.chat(userText, [], sessionId || undefined);
          assistantText = llmResponse.response;

          if (llmResponse.session_id && !sessionId) {
            setSessionId(llmResponse.session_id);
          }

          addMessage('assistant', assistantText, {
            careInjected: llmResponse.care_injected || false,
          });

          if (llmResponse.web_search_query && llmResponse.web_search_results && llmResponse.web_search_results.length > 0) {
            const fallbackMsgId = useAppStore.getState().messages[useAppStore.getState().messages.length - 1]?.id || '';
            const wsResults: Array<{title: string; content: string; url: string}> = llmResponse.web_search_results.map((r: any) => ({
              title: r.title || '',
              content: r.content || '',
              url: r.url || '',
            }));
            if (fallbackMsgId) {
              updateMessageWebSearch(fallbackMsgId, { query: llmResponse.web_search_query, results: wsResults });
            }
          }

          if (llmResponse.memories_added > 0) {
            addMessage('system', `已记住 ${llmResponse.memories_added} 条关于你的信息`);
          }
          if (llmResponse.memories_updated > 0) {
            addMessage('system', `已更新 ${llmResponse.memories_updated} 条记忆`);
          }
          if (llmResponse.memories_deleted > 0) {
            addMessage('system', `已删除 ${llmResponse.memories_deleted} 条过时记忆`);
          }

          if (llmResponse.search_query && llmResponse.search_results && llmResponse.search_results.length > 0) {
            pendingSearchQuery = llmResponse.search_query;
            pendingSearchResults = llmResponse.search_results.map((r: any) => ({
              title: r.title,
              bvid: r.bvid || '',
              cover: r.cover || '',
              author: r.author || '',
              duration: r.duration || '',
              play_count: r.play_count || '',
              url: r.url || '',
            }));
          }

          await playTTS(assistantText);
        } else if (streamPlaybackQueued) {
          await playbackChain;
        } else {
          if (!assistantText) {
            enterIdleState();
            return;
          }
          await playTTS(assistantText);
        }
      }

      console.log('[流程] TTS播放完成，5秒后开始聆听');

      if (shouldExit) {
        console.log('[流程] 用户请求退出，回到空闲状态');
        enterIdleState();
        return;
      }

      if (pendingSearchQuery && pendingSearchResults && pendingSearchResults.length > 0) {
        console.log('[食光鉴] 显示弹窗:', pendingSearchQuery, pendingSearchResults.length, '条结果');
        showShiguangjian(
          pendingSearchQuery,
          pendingSearchResults.map((r: any) => ({
            title: r.title,
            bvid: r.bvid || '',
            cover: r.cover || '',
            author: r.author || '',
            duration: r.duration || '',
            play_count: r.play_count || '',
            url: r.url || '',
          }))
        );
      } else {
        console.log('[食光鉴] 未弹出: query=', pendingSearchQuery, 'results=', pendingSearchResults?.length || 0);
      }

      await startRecording();

    } catch (error: any) {
      console.error('[流程] 处理失败:', error);
      const detail = error.message || '处理失败，请重试';
      Alert.alert('错误', detail);
      enterIdleState();
    } finally {
      setIsLoading(false);
      if (videoRef.current) {
        try { await videoRef.current.playAsync(); } catch {}
      }
    }
  };

  const sendGoodbye = async () => {
    const goodbyeMessage = '既然您要离开了，那我便不多留。愿君一路顺风，有缘再会！';
    addMessage('assistant', goodbyeMessage);
    await playTTS(goodbyeMessage);
    enterIdleState();
  };

  const ttsRetryCountRef = useRef<number>(0);
  const MAX_TTS_RETRIES = 1;

  const preloadTTS = async (text: string): Promise<string | null> => {
    try {
      const ttsResponse = await apiService.synthesize(text);
      const audioBase64 = ttsResponse.audio;

      if (!audioBase64 || audioBase64.length < 100) {
        return null;
      }

      const tempFile = FileSystem.cacheDirectory + `tts_pre_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tempFile, audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return tempFile;
    } catch (error: any) {
      console.error('[TTS] 预加载失败:', error.message);
      return null;
    }
  };

  const playTTS = async (rawText: string, preloadedFile?: string | null): Promise<void> => {
    return new Promise(async (resolve) => {
      const text = rawText.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
      if (!text) { resolve(); return; }

      ttsResolverRef.current = resolve;
      ttsTempFileRef.current = '';

      try {
        console.log('[TTS] 开始播放:', text.substring(0, 30) + '...');

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        let tempFile = preloadedFile || null;

        if (!tempFile) {
          const ttsResponse = await apiService.synthesize(text);
          const audioBase64 = ttsResponse.audio;
          console.log('[TTS] 收到音频 base64, 长度:', audioBase64?.length || 0);

          if (!audioBase64 || audioBase64.length < 100) {
            throw new Error('音频数据为空或过小');
          }

          tempFile = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
          await FileSystem.writeAsStringAsync(tempFile, audioBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } else {
          console.log('[TTS] 使用预加载文件:', tempFile);
        }

        ttsTempFileRef.current = tempFile;

        enterSpeakingState();

        if (videoRef.current) {
          try { await videoRef.current.playAsync(); } catch {}
        }

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: tempFile },
          { shouldPlay: true, volume: 1.0 }
        );

        setSound(newSound);
        ttsSoundRef.current = newSound;
        ttsRetryCountRef.current = 0;

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

        if (ttsRetryCountRef.current < MAX_TTS_RETRIES) {
          ttsRetryCountRef.current++;
          console.log(`[TTS] 重试播放 (${ttsRetryCountRef.current}/${MAX_TTS_RETRIES})`);
          const retryFile = await preloadTTS(text);
          if (retryFile) {
            ttsTempFileRef.current = retryFile;
            enterSpeakingState();
            if (videoRef.current) {
              try { await videoRef.current.playAsync(); } catch {}
            }
            const { sound: retrySound } = await Audio.Sound.createAsync(
              { uri: retryFile },
              { shouldPlay: true, volume: 1.0 }
            );
            setSound(retrySound);
            ttsSoundRef.current = retrySound;
            retrySound.setOnPlaybackStatusUpdate((status) => {
              if (!status.isLoaded) return;
              if (status.didJustFinish) {
                console.log('[TTS] 播放完成');
                retrySound.unloadAsync();
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
            return;
          }
        }

        ttsRetryCountRef.current = 0;
        console.log('[TTS] 降级为纯文本模式，跳过语音播放');
        resolve();
      }
    });
  };

  const interruptTTS = async () => {
    console.log('[TTS] 打断播放，跳过后续');
    skipPlaybackRef.current = true;

    stopVAD();

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

    await forceCleanupRecording();
    await startRecording();
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
    }, VAD_CONFIG.MAX_RECORDING_DURATION + 5000);
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

  const handleNewConversation = () => {
    Alert.alert(
      '新对话',
      '确定要开始新对话吗？当前对话记录会保留。',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => {
          clearMessages();
          startNewSession();
        }},
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: async () => {
          skipPlaybackRef.current = true;
          if (ttsSoundRef.current) {
            try { await ttsSoundRef.current.stopAsync(); await ttsSoundRef.current.unloadAsync(); } catch {}
            ttsSoundRef.current = null;
          }
          if (ttsResolverRef.current) {
            ttsResolverRef.current();
            ttsResolverRef.current = null;
          }
          await forceCleanupRecording();
          await wakeWordService.stopListening();
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

      <TouchableWithoutFeedback onPress={handleScreenTap}>
        <View style={styles.tapArea} />
      </TouchableWithoutFeedback>

      <View style={styles.topBar}>
          <IconButton
            icon={<Ionicons name="library-outline" size={18} color={colors.text} />}
            onPress={() => navigation.navigate('Memory')}
            size="sm"
          />

          <View style={styles.statusIndicator}>
            <Text style={styles.statusText}>
              {appState === 'idle' ? '点击屏幕开始对话' :
               appState === 'listening' ? getStatusText() :
               appState === 'speaking' ? '点击打断' : ''}
            </Text>
            {isLoading && <ActivityIndicator color={colors.text} size="small" style={styles.loader} />}
          </View>

          <View style={styles.topBarRight}>
            <IconButton
              icon={<Ionicons name="time-outline" size={18} color={colors.text} />}
              onPress={() => navigation.navigate('SessionList')}
              size="sm"
            />
            <IconButton
              icon={<Ionicons name="add-circle-outline" size={18} color={colors.text} />}
              onPress={handleNewConversation}
              size="sm"
            />
            <IconButton
              icon={<Ionicons name="medical-outline" size={18} color={colors.text} />}
              onPress={() => navigation.navigate('Diagnostics')}
              size="sm"
            />
            <IconButton
              icon={<Ionicons name="settings-outline" size={18} color={colors.text} />}
              onPress={() => navigation.navigate('Settings')}
              size="sm"
            />
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
                <Text style={styles.emptyText}>点击屏幕开始对话</Text>
                <Text style={styles.emptySubtext}>我是苏怀真，愿在这食光中陪伴你</Text>
              </View>
            ) : (
              messages.map((msg) => (
                <TouchableOpacity
                  key={msg.id}
                  activeOpacity={0.8}
                  onLongPress={() => setActionSheetMessage({ id: msg.id, role: msg.role, content: msg.content })}
                  style={[
                    styles.messageBubble,
                    msg.role === 'user' ? styles.userBubble :
                    msg.role === 'system' ? styles.systemBubble :
                    msg.role === 'recommend' ? styles.recommendBubble :
                    styles.assistantBubble
                  ]}
                >
                  {msg.role === 'recommend' && msg.recommendData ? (
                    <View>
                      <Text style={styles.recommendHeader}>食光鉴</Text>
                      <Text style={styles.recommendTitle}>{msg.content}</Text>
                      {msg.recommendData.results.map((video, idx) => (
                        <View key={idx} style={styles.videoCard}>
                          <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
                          <View style={styles.videoMeta}>
                            <Text style={styles.videoMetaText}>{video.author}</Text>
                            <Text style={styles.videoMetaText}>{video.duration}</Text>
                            <Text style={styles.videoMetaText}>{video.play_count}播放</Text>
                          </View>
                          <View style={styles.videoActions}>
                            <TouchableOpacity
                              style={styles.videoButton}
                              onPress={() => Linking.openURL(video.url).catch(() => {})}
                            >
                              <Text style={styles.videoButtonText}>跳转观看</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View>
                      <Text style={[
                        styles.messageText,
                        msg.role === 'system' && styles.systemMessageText
                      ]}>{msg.content}</Text>
                      {msg.role === 'assistant' && msg.webSearchData && (
                        <View style={styles.webSearchContainer}>
                          <TouchableOpacity
                            style={styles.webSearchBadge}
                            onPress={() => toggleWebSearchExpand(msg.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="globe-outline" size={12} color={colors.textMuted} />
                            <Text style={styles.webSearchBadgeText}>已确认</Text>
                          </TouchableOpacity>
                          {expandedWebSearch.has(msg.id) && (
                            <View style={styles.webSearchCard}>
                              <Text style={styles.webSearchQuery}>{msg.webSearchData.query}</Text>
                              {msg.webSearchData.results.filter(r => r.title === 'AI摘要').map((r, idx) => (
                                <Text key={idx} style={styles.webSearchSummary}>{r.content}</Text>
                              ))}
                              {msg.webSearchData.results.filter(r => r.title !== 'AI摘要' && r.url).slice(0, 3).map((r, idx) => (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => Linking.openURL(r.url).catch(() => {})}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.webSearchLink} numberOfLines={1}>{r.title || r.url}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        <ShiguangjianModal />

        <MessageActionSheet
          visible={actionSheetMessage !== null}
          message={actionSheetMessage}
          onClose={() => setActionSheetMessage(null)}
          onDelete={(messageId) => {
            deleteMessage(messageId);
            setExpandedWebSearch(prev => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
          }}
        />
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  tapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.5,
    zIndex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 10,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
  },
  loader: {
    marginLeft: spacing.sm,
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
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  detectionProgress: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  detectionHint: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontWeight: '500',
  },
  messagesWrapper: {
    position: 'absolute',
    bottom: 100,
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.45, 280),
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    zIndex: 2,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    color: colors.text,
    fontSize: typography.h3,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginVertical: spacing.xs,
    maxWidth: '85%',
    elevation: 2,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceLight,
    borderBottomLeftRadius: spacing.xs,
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: 'rgba(233,69,96,0.15)',
    borderRadius: radius.md,
    maxWidth: '95%',
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.25)',
  },
  messageText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
    fontWeight: '500',
  },
  systemMessageText: {
    fontSize: typography.small,
    textAlign: 'center',
    color: colors.gold,
    fontWeight: '600',
    lineHeight: 20,
  },
  recommendBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139,105,20,0.2)',
    borderBottomLeftRadius: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.3)',
    maxWidth: '90%',
  },
  recommendHeader: {
    color: colors.gold,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205,175,100,0.2)',
  },
  recommendTitle: {
    color: colors.goldLight,
    fontSize: typography.small,
    fontWeight: '500',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  videoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.15)',
  },
  videoTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  videoMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  videoMetaText: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  videoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  videoButton: {
    backgroundColor: 'rgba(205,175,100,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(205,175,100,0.4)',
  },
  videoButtonText: {
    color: colors.gold,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  webSearchContainer: {
    marginTop: spacing.xs,
  },
  webSearchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  webSearchBadgeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  webSearchCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(205,170,100,0.4)',
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  webSearchQuery: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  webSearchSummary: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  webSearchLink: {
    color: '#6ab0f3',
    fontSize: typography.caption,
    lineHeight: 18,
    marginBottom: 2,
  },
});
