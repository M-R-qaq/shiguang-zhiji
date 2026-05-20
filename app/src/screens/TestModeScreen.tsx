import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { apiService } from '../services/api';
import { RootStackParamList } from '../../App';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from '../components/AppButton';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const VAD_CONFIG = {
  SILENCE_THRESHOLD: 5,
  SILENCE_DB_THRESHOLD: -38,
  VAD_INTERVAL: 300,
  MAX_RECORDING_DURATION: 30000,
  ASR_WAIT_TIMEOUT: 15000,
};

interface TestRecord {
  id: string;
  round: number;
  timestamp: string;
  userSpeech: string;
  asrText: string;
  asrCorrect: boolean;
  recordingDurationMs: number;
  asrResponseTimeMs: number;
  llmFirstChunkTimeMs: number;
  llmTotalTimeMs: number;
  ttsDurationMs: number;
  firstResponseTimeMs: number;
  ttsNormal: boolean;
  stateFlow: string;
  issueDesc: string;
  networkType: string;
}

interface TestConfig {
  deviceName: string;
  networkType: string;
  noiseLevel: '安静' | '普通' | '嘈杂';
  testCase: string;
  totalRounds: number;
}

const TEST_CASES = {
  'A': '基础连续陪餐对话',
  'B': '美食专有词与近音词',
  'C': '个人偏好与记忆提取',
  'D': '长句、停顿与口语化',
  'E': '推荐内容触发',
  'F': '退出语与会话结束',
  '冒烟': '快速冒烟测试',
  '自由': '自由对话',
};

export default function TestModeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();

  const [isTesting, setIsTesting] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [currentStatus, setCurrentStatus] = useState('待机');
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [config, setConfig] = useState<TestConfig>({
    deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android',
    networkType: 'Wi-Fi',
    noiseLevel: '安静',
    testCase: 'A',
    totalRounds: 5,
  });
  const [showConfigModal, setShowConfigModal] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceCountRef = useRef(0);
  const hasSpeechRef = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const timersRef = useRef({
    recordingStart: 0,
    recordingEnd: 0,
    asrSend: 0,
    asrReceive: 0,
    llmSend: 0,
    llmFirstChunk: 0,
    llmDone: 0,
    ttsStart: 0,
    ttsEnd: 0,
  });

  const isStoppingRef = useRef(false);

  const addRecord = (partial: Partial<TestRecord>) => {
    const newRecord: TestRecord = {
      id: Date.now().toString(),
      round: currentRound + 1,
      timestamp: new Date().toISOString(),
      userSpeech: currentUserText,
      asrText: '',
      asrCorrect: true,
      recordingDurationMs: 0,
      asrResponseTimeMs: 0,
      llmFirstChunkTimeMs: 0,
      llmTotalTimeMs: 0,
      ttsDurationMs: 0,
      firstResponseTimeMs: 0,
      ttsNormal: true,
      stateFlow: 'idle→listening→speaking→idle',
      issueDesc: '',
      networkType: config.networkType,
      ...partial,
    };
    setRecords(prev => [...prev, newRecord]);
  };

  const updateLastRecord = (partial: Partial<TestRecord>) => {
    setRecords(prev => {
      if (prev.length === 0) return prev;
      const last = { ...prev[prev.length - 1], ...partial };
      return [...prev.slice(0, -1), last];
    });
  };

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
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setCurrentStatus('监听中...');
      timersRef.current.recordingStart = Date.now();
      silenceCountRef.current = 0;
      hasSpeechRef.current = false;
      isStoppingRef.current = false;

      vadIntervalRef.current = setInterval(async () => {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            const db = status.metering;
            if (db > VAD_CONFIG.SILENCE_DB_THRESHOLD) {
              silenceCountRef.current = 0;
              hasSpeechRef.current = true;
            } else {
              if (hasSpeechRef.current) {
                silenceCountRef.current++;
              }
              if (silenceCountRef.current >= VAD_CONFIG.SILENCE_THRESHOLD && hasSpeechRef.current) {
                stopRecording();
              }
            }
          }
        } catch (e) {}
      }, VAD_CONFIG.VAD_INTERVAL);

    } catch (e: any) {
      Alert.alert('录音启动失败', e.message);
    }
  };

  const stopRecording = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    setIsRecording(false);
    setCurrentStatus('识别中...');
    timersRef.current.recordingEnd = Date.now();

    let audioUri: string | null = null;
    if (recordingRef.current) {
      try {
        const rec = recordingRef.current;
        const s = await rec.getStatusAsync();
        if (s.isRecording) {
          await new Promise(r => setTimeout(r, 100));
          await rec.stopAndUnloadAsync();
        } else {
          await rec.stopAndUnloadAsync();
        }
        audioUri = rec.getURI();
      } catch (e) {}
      recordingRef.current = null;
    }

    if (!audioUri) {
      setCurrentStatus('待机');
      return;
    }

    await processAudio(audioUri);
  };

  const processAudio = async (audioUri: string) => {
    try {
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      timersRef.current.asrSend = Date.now();
      const asrResponse = await Promise.race([
        apiService.transcribeBase64(base64Audio),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ASR超时')), VAD_CONFIG.ASR_WAIT_TIMEOUT)
        ),
      ]);
      timersRef.current.asrReceive = Date.now();

      const text = asrResponse.text?.trim() || '';
      setCurrentUserText(text);
      setCurrentStatus(`识别结果: ${text || '(空)'}`);

      const recordingMs = timersRef.current.recordingEnd - timersRef.current.recordingStart;
      const asrMs = timersRef.current.asrReceive - timersRef.current.asrSend;

      if (text) {
        await processDialog(text, recordingMs, asrMs);
      } else {
        addRecord({
          round: currentRound + 1,
          asrText: '(空)',
          asrCorrect: false,
          recordingDurationMs: recordingMs,
          asrResponseTimeMs: asrMs,
          stateFlow: 'idle→listening→idle',
          issueDesc: 'ASR识别为空',
        });
        setCurrentRound(r => r + 1);
        setCurrentStatus('待机');
      }
    } catch (e: any) {
      setCurrentStatus('识别失败');
      addRecord({
        round: currentRound + 1,
        asrText: '(失败)',
        asrCorrect: false,
        recordingDurationMs: timersRef.current.recordingEnd - timersRef.current.recordingStart,
        asrResponseTimeMs: 0,
        stateFlow: 'idle→listening→idle',
        issueDesc: `ASR错误: ${e.message}`,
      });
      setCurrentRound(r => r + 1);
    }
  };

  const processDialog = async (userText: string, recordingMs: number, asrMs: number) => {
    setCurrentStatus('LLM思考中...');
    timersRef.current.llmSend = Date.now();

    let firstChunkReceived = false;
    let responseText = '';
    let ttsQueue: string[] = [];

    try {
      await apiService.chatStreamSSE(
        userText,
        (event) => {
          if (event.type === 'text_chunk' || event.type === 'sentence') {
            responseText += event.content;
            setCurrentResponse(responseText);
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              timersRef.current.llmFirstChunk = Date.now();
            }
          } else if (event.type === 'text_done') {
            responseText = event.full_text || responseText;
            setCurrentResponse(responseText);
          } else if (event.type === 'done') {
            timersRef.current.llmDone = Date.now();
          }
        },
        [],
      );

      if (!timersRef.current.llmDone) {
        timersRef.current.llmDone = Date.now();
      }

      const llmFirstChunkMs = timersRef.current.llmFirstChunk - timersRef.current.llmSend;
      const llmTotalMs = timersRef.current.llmDone - timersRef.current.llmSend;
      const firstResponseMs = timersRef.current.llmFirstChunk - timersRef.current.recordingStart;

      setCurrentStatus('TTS播放中...');
      timersRef.current.ttsStart = Date.now();

      if (responseText) {
        await playTTS(responseText);
      }

      timersRef.current.ttsEnd = Date.now();
      const ttsMs = timersRef.current.ttsEnd - timersRef.current.ttsStart;

      addRecord({
        round: currentRound + 1,
        userSpeech: userText,
        asrText: userText,
        asrCorrect: true,
        recordingDurationMs: recordingMs,
        asrResponseTimeMs: asrMs,
        llmFirstChunkTimeMs: llmFirstChunkMs,
        llmTotalTimeMs: llmTotalMs,
        ttsDurationMs: ttsMs,
        firstResponseTimeMs: firstResponseMs,
        ttsNormal: true,
        stateFlow: 'idle→listening→speaking→idle',
      });

      setCurrentRound(r => r + 1);
      setCurrentStatus('待机');

    } catch (e: any) {
      timersRef.current.llmDone = Date.now();
      const llmTotalMs = timersRef.current.llmDone - timersRef.current.llmSend;

      addRecord({
        round: currentRound + 1,
        userSpeech: userText,
        asrText: userText,
        asrCorrect: true,
        recordingDurationMs: recordingMs,
        asrResponseTimeMs: asrMs,
        llmFirstChunkTimeMs: 0,
        llmTotalTimeMs: llmTotalMs,
        ttsDurationMs: 0,
        firstResponseTimeMs: 0,
        ttsNormal: false,
        stateFlow: 'idle→listening→speaking→idle',
        issueDesc: `LLM/TTS错误: ${e.message}`,
      });
      setCurrentRound(r => r + 1);
      setCurrentStatus('待机');
    }
  };

  const playTTS = async (text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const ttsResponse = await apiService.synthesize(text);
        const audioBase64 = ttsResponse.audio;

        if (!audioBase64 || audioBase64.length < 100) {
          resolve();
          return;
        }

        const tempFile = FileSystem.cacheDirectory + `tts_test_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(tempFile, audioBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: tempFile },
          { shouldPlay: true, volume: 1.0 }
        );

        soundRef.current = sound;
        setIsPlaying(true);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            sound.unloadAsync();
            setIsPlaying(false);
            soundRef.current = null;
            FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
            resolve();
          }
        });
      } catch (e) {
        setIsPlaying(false);
        resolve();
      }
    });
  };

  const stopTTS = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
      setIsPlaying(false);
    }
  };

  const handleStartTest = () => {
    setIsTesting(true);
    setCurrentRound(0);
    setRecords([]);
    setCurrentUserText('');
    setCurrentResponse('');
    setCurrentStatus('待机');
    setShowConfigModal(false);
  };

  const handleEndTest = () => {
    setIsTesting(false);
    stopTTS();
    if (recordingRef.current) {
      try { recordingRef.current.stopAndUnloadAsync(); } catch (e) {}
      recordingRef.current = null;
    }
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    setIsRecording(false);
    setCurrentStatus('测试结束');
    Alert.alert('测试结束', `共完成 ${currentRound} 轮对话`);
  };

  const generateCSV = () => {
    const headers = [
      '日期', '设备', '网络', '环境噪声', '用例', '轮次',
      '用户原话', 'ASR文本', '是否正确', '录音耗时(ms)', 'ASR反应时间(ms)',
      'LLM首句耗时(ms)', 'LLM总耗时(ms)', 'TTS耗时(ms)', '首响耗时(ms)',
      'TTS是否正常', '状态流转', '问题描述',
    ];

    const rows = records.map(r => [
      r.timestamp,
      config.deviceName,
      r.networkType,
      config.noiseLevel,
      config.testCase,
      r.round,
      r.userSpeech,
      r.asrText,
      r.asrCorrect ? '是' : '否',
      r.recordingDurationMs,
      r.asrResponseTimeMs,
      r.llmFirstChunkTimeMs,
      r.llmTotalTimeMs,
      r.ttsDurationMs,
      r.firstResponseTimeMs,
      r.ttsNormal ? '是' : '否',
      r.stateFlow,
      r.issueDesc || '',
    ]);

    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    return csv;
  };

  const handleShare = async () => {
    try {
      const csv = generateCSV();
      const fileName = `食光知己测试报告_${new Date().toISOString().slice(0, 10)}.csv`;
      const filePath = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: '导出测试报告',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('导出成功', `文件已保存: ${fileName}`);
      }
    } catch (e: any) {
      Alert.alert('导出失败', e.message);
    }
  };

  const toggleRecord = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>测试模式</Text>
        <Text style={styles.headerSubtitle}>{TEST_CASES[config.testCase as keyof typeof TEST_CASES]} | 第 {currentRound}/{config.totalRounds} 轮</Text>
      </View>

      <View style={styles.mainArea}>
        <View style={styles.dialogArea}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogLabel}>用户:</Text>
            <Text style={styles.dialogText}>{currentUserText || '等待语音输入...'}</Text>
          </View>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogLabel}>苏怀真:</Text>
            <Text style={styles.dialogText}>{currentResponse || '等待回复...'}</Text>
          </View>
        </View>

        <View style={styles.statusArea}>
          <Text style={styles.statusText}>状态: {currentStatus}</Text>
          {isRecording && <ActivityIndicator color={colors.primary} />}
        </View>

        <AppButton
          title={isRecording ? '结束录音' : '开始录音'}
          onPress={toggleRecord}
          variant={isRecording ? 'danger' : 'primary'}
        />
      </View>

      <View style={styles.dataPanel}>
        <View style={styles.dataPanelHeader}>
          <Text style={styles.dataPanelTitle}>测试数据 ({records.length} 条)</Text>
          <View style={styles.dataPanelActions}>
            <AppButton title="导出" onPress={handleShare} variant="secondary" size="sm" />
            {isTesting ? (
              <AppButton title="结束" onPress={handleEndTest} variant="secondary" size="sm" />
            ) : (
              <AppButton title="配置" onPress={() => setShowConfigModal(true)} variant="secondary" size="sm" />
            )}
          </View>
        </View>

        <ScrollView style={styles.dataTable}>
          {records.length === 0 ? (
            <Text style={styles.emptyText}>暂无数据</Text>
          ) : (
            records.map((r, idx) => (
              <View key={r.id} style={styles.dataRow}>
                <View style={styles.dataRowHeader}>
                  <Text style={styles.dataRowTitle}>第 {r.round} 轮</Text>
                  <Text style={[styles.dataRowBadge, r.issueDesc ? styles.badgeError : styles.badgeOk]}>
                    {r.issueDesc ? '异常' : '正常'}
                  </Text>
                </View>
                <View style={styles.dataRowDetail}>
                  <Text style={styles.dataRowText}>用户: {r.userSpeech}</Text>
                  <Text style={styles.dataRowText}>ASR: {r.asrText}</Text>
                  <View style={styles.metricsRow}>
                    <Metric label="录音" value={`${r.recordingDurationMs}ms`} />
                    <Metric label="ASR" value={`${r.asrResponseTimeMs}ms`} />
                    <Metric label="LLM首句" value={`${r.llmFirstChunkTimeMs}ms`} />
                    <Metric label="LLM总" value={`${r.llmTotalTimeMs}ms`} />
                    <Metric label="TTS" value={`${r.ttsDurationMs}ms`} />
                    <Metric label="首响" value={`${r.firstResponseTimeMs}ms`} />
                  </View>
                  {r.issueDesc ? (
                    <Text style={styles.issueText}>⚠ {r.issueDesc}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <Modal visible={showConfigModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>测试配置</Text>

            <ConfigRow label="用例">
              <View style={styles.configButtons}>
                {Object.entries(TEST_CASES).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.configChip, config.testCase === key && styles.configChipActive]}
                    onPress={() => setConfig(c => ({ ...c, testCase: key }))}
                  >
                    <Text style={[styles.configChipText, config.testCase === key && styles.configChipTextActive]}>
                      {key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ConfigRow>

            <ConfigRow label="环境噪声">
              <View style={styles.configButtons}>
                {(['安静', '普通', '嘈杂'] as const).map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.configChip, config.noiseLevel === level && styles.configChipActive]}
                    onPress={() => setConfig(c => ({ ...c, noiseLevel: level }))}
                  >
                    <Text style={[styles.configChipText, config.noiseLevel === level && styles.configChipTextActive]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ConfigRow>

            <ConfigRow label="网络类型">
              <TextInput
                style={styles.textInput}
                value={config.networkType}
                onChangeText={v => setConfig(c => ({ ...c, networkType: v }))}
                placeholder="Wi-Fi / 4G / 5G"
                placeholderTextColor="#666"
              />
            </ConfigRow>

            <ConfigRow label="设备名称">
              <TextInput
                style={styles.textInput}
                value={config.deviceName}
                onChangeText={v => setConfig(c => ({ ...c, deviceName: v }))}
                placeholder="设备型号"
                placeholderTextColor="#666"
              />
            </ConfigRow>

            <ConfigRow label="目标轮数">
              <TextInput
                style={styles.textInput}
                value={String(config.totalRounds)}
                onChangeText={v => setConfig(c => ({ ...c, totalRounds: parseInt(v) || 5 }))}
                keyboardType="numeric"
                placeholderTextColor="#666"
              />
            </ConfigRow>

            <AppButton title="开始测试" onPress={handleStartTest} variant="primary" />
            <AppButton title="返回" onPress={() => navigation.goBack()} variant="secondary" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.configRow}>
      <Text style={styles.configRowLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(233,69,96,0.3)',
  },
  headerTitle: {
    fontSize: typography.h2,
    fontWeight: '700',
    color: colors.primary,
  },
  headerSubtitle: {
    fontSize: typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  mainArea: {
    flex: 1,
    padding: spacing.lg,
  },
  dialogArea: {
    flex: 1,
    gap: spacing.md,
  },
  dialogCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(233,69,96,0.5)',
  },
  dialogLabel: {
    fontSize: typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  dialogText: {
    fontSize: typography.small,
    color: colors.text,
    lineHeight: 20,
  },
  statusArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: spacing.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(233,69,96,0.08)',
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  dataPanel: {
    height: SCREEN_H * 0.35,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dataPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dataPanelTitle: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dataPanelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dataTable: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    fontSize: typography.small,
  },
  dataRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    marginVertical: 4,
  },
  dataRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dataRowTitle: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dataRowBadge: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeOk: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    color: colors.success,
  },
  badgeError: {
    backgroundColor: 'rgba(244,67,54,0.2)',
    color: colors.error,
  },
  dataRowDetail: {
    gap: 4,
  },
  dataRowText: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  metricItem: {
    alignItems: 'center',
    minWidth: 50,
  },
  metricLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  metricValue: {
    fontSize: 11,
    color: '#ccc',
    fontWeight: '600',
  },
  issueText: {
    fontSize: typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  configRow: {
    marginBottom: spacing.md,
  },
  configRowLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 6,
  },
  configButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  configChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  configChipActive: {
    backgroundColor: 'rgba(233,69,96,0.3)',
  },
  configChipText: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  configChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    color: '#fff',
    fontSize: typography.small,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
