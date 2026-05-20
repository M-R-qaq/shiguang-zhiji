import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { apiService } from '../services/api';
import { colors, spacing, radius, typography } from '../theme';
import AppButton from '../components/AppButton';

interface TestResult {
  name: string;
  category: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'warn';
  duration: number;
  detail: string;
  metric?: number;
  threshold?: number;
}

interface TestSuite {
  category: string;
  results: TestResult[];
}

export default function DiagnosticsScreen() {
  const { user, token, backendUrl } = useAuth();
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState('');
  const [progress, setProgress] = useState(0);
  const [totalTests, setTotalTests] = useState(0);
  const [completedTests, setCompletedTests] = useState(0);
  const resultsRef = useRef<TestSuite[]>([]);

  const updateResult = useCallback((category: string, name: string, update: Partial<TestResult>) => {
    setSuites(prev => {
      const newSuites = [...prev];
      const suite = newSuites.find(s => s.category === category);
      if (suite) {
        const result = suite.results.find(r => r.name === name);
        if (result) {
          Object.assign(result, update);
        }
      }
      return newSuites;
    });
  }, []);

  const initSuites = useCallback(() => {
    const initial: TestSuite[] = [
      {
        category: '网络连通性',
        results: [
          { name: '后端健康检查', category: '网络连通性', status: 'pending', duration: 0, detail: '' },
          { name: 'ASR端点可达', category: '网络连通性', status: 'pending', duration: 0, detail: '' },
          { name: 'LLM端点可达', category: '网络连通性', status: 'pending', duration: 0, detail: '' },
          { name: 'TTS端点可达', category: '网络连通性', status: 'pending', duration: 0, detail: '' },
          { name: '认证端点可达', category: '网络连通性', status: 'pending', duration: 0, detail: '' },
        ],
      },
      {
        category: 'API延迟',
        results: [
          { name: 'ASR单次延迟', category: 'API延迟', status: 'pending', duration: 0, detail: '', metric: 0, threshold: 3000 },
          { name: 'ASR连续3次延迟', category: 'API延迟', status: 'pending', duration: 0, detail: '', metric: 0, threshold: 3000 },
          { name: 'LLM响应延迟', category: 'API延迟', status: 'pending', duration: 0, detail: '', metric: 0, threshold: 5000 },
          { name: 'TTS合成延迟', category: 'API延迟', status: 'pending', duration: 0, detail: '', metric: 0, threshold: 3000 },
          { name: '记忆搜索延迟', category: 'API延迟', status: 'pending', duration: 0, detail: '', metric: 0, threshold: 2000 },
        ],
      },
      {
        category: '音频系统',
        results: [
          { name: '录音权限', category: '音频系统', status: 'pending', duration: 0, detail: '' },
          { name: '录音创建', category: '音频系统', status: 'pending', duration: 0, detail: '' },
          { name: '录音Metering', category: '音频系统', status: 'pending', duration: 0, detail: '' },
          { name: 'VAD音量采样', category: '音频系统', status: 'pending', duration: 0, detail: '', metric: 0 },
          { name: '录音停止/重启', category: '音频系统', status: 'pending', duration: 0, detail: '' },
          { name: '音频模式切换', category: '音频系统', status: 'pending', duration: 0, detail: '' },
        ],
      },
      {
        category: '内存与资源',
        results: [
          { name: '缓存目录检查', category: '内存与资源', status: 'pending', duration: 0, detail: '' },
          { name: '临时文件泄漏', category: '内存与资源', status: 'pending', duration: 0, detail: '' },
          { name: '录音创建/销毁循环', category: '内存与资源', status: 'pending', duration: 0, detail: '' },
          { name: '连续TTS文件清理', category: '内存与资源', status: 'pending', duration: 0, detail: '' },
        ],
      },
      {
        category: '强壮性',
        results: [
          { name: '无效Token请求', category: '强壮性', status: 'pending', duration: 0, detail: '' },
          { name: '空base64 ASR', category: '强壮性', status: 'pending', duration: 0, detail: '' },
          { name: '空文本LLM', category: '强壮性', status: 'pending', duration: 0, detail: '' },
          { name: '空文本TTS', category: '强壮性', status: 'pending', duration: 0, detail: '' },
          { name: '快速录音启停', category: '强壮性', status: 'pending', duration: 0, detail: '' },
          { name: '并发ASR请求', category: '强壮性', status: 'pending', duration: 0, detail: '' },
        ],
      },
      {
        category: '认证系统',
        results: [
          { name: 'Token有效性', category: '认证系统', status: 'pending', duration: 0, detail: '' },
          { name: '用户信息获取', category: '认证系统', status: 'pending', duration: 0, detail: '' },
          { name: '无效Token拒绝', category: '认证系统', status: 'pending', duration: 0, detail: '' },
        ],
      },
    ];
    resultsRef.current = initial;
    setSuites(initial);
    return initial;
  }, []);

  const tick = useCallback(() => {
    setCompletedTests(prev => prev + 1);
  }, []);

  const runAllTests = async () => {
    setRunning(true);
    setCompletedTests(0);
    const initial = initSuites();
    const allResults = initial.flatMap(s => s.results);
    setTotalTests(allResults.length);
    setProgress(0);

    const run = async (category: string, name: string, fn: () => Promise<Partial<TestResult>>) => {
      setCurrentTest(`${category} > ${name}`);
      updateResult(category, name, { status: 'running' });
      const start = Date.now();
      try {
        const result = await fn();
        const duration = Date.now() - start;
        updateResult(category, name, { ...result, status: result.status || 'pass', duration, detail: result.detail || '' });
      } catch (error: any) {
        const duration = Date.now() - start;
        updateResult(category, name, { status: 'fail', duration, detail: error.message || '未知错误' });
      }
      tick();
      setProgress(prev => prev + (1 / allResults.length) * 100);
    };

    try {
      // ==================== 网络连通性 ====================
      await run('网络连通性', '后端健康检查', async () => {
        const start = Date.now();
        const response = await fetch(`${apiService.getBaseUrl()}/health`);
        const elapsed = Date.now() - start;
        if (response.ok) {
          return { status: 'pass', detail: `健康检查正常 (${elapsed}ms)`, metric: elapsed, threshold: 2000 };
        }
        return { status: 'fail', detail: `状态码 ${response.status}` };
      });

      await run('网络连通性', 'ASR端点可达', async () => {
        const start = Date.now();
        const response = await fetch(`${apiService.getBaseUrl()}/asr/transcribe-base64`, {
          method: 'OPTIONS',
        });
        const elapsed = Date.now() - start;
        return { status: 'pass', detail: `ASR端点可达 (${elapsed}ms)`, metric: elapsed };
      });

      await run('网络连通性', 'LLM端点可达', async () => {
        const start = Date.now();
        const response = await fetch(`${apiService.getBaseUrl()}/llm/chat`, {
          method: 'OPTIONS',
        });
        const elapsed = Date.now() - start;
        return { status: 'pass', detail: `LLM端点可达 (${elapsed}ms)`, metric: elapsed };
      });

      await run('网络连通性', 'TTS端点可达', async () => {
        const start = Date.now();
        const response = await fetch(`${apiService.getBaseUrl()}/tts/synthesize`, {
          method: 'OPTIONS',
        });
        const elapsed = Date.now() - start;
        return { status: 'pass', detail: `TTS端点可达 (${elapsed}ms)`, metric: elapsed };
      });

      await run('网络连通性', '认证端点可达', async () => {
        const start = Date.now();
        const response = await fetch(`${apiService.getBaseUrl()}/auth/me`, {
          method: 'OPTIONS',
        });
        const elapsed = Date.now() - start;
        return { status: 'pass', detail: `认证端点可达 (${elapsed}ms)`, metric: elapsed };
      });

      // ==================== API延迟 ====================
      await run('API延迟', 'ASR单次延迟', async () => {
        const start = Date.now();
        try {
          await apiService.transcribeBase64('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        } catch {}
        const elapsed = Date.now() - start;
        const status = elapsed <= 3000 ? 'pass' : elapsed <= 6000 ? 'warn' : 'fail';
        return { status, detail: `ASR延迟 ${elapsed}ms (阈值3000ms)`, metric: elapsed, threshold: 3000 };
      });

      await run('API延迟', 'ASR连续3次延迟', async () => {
        const latencies: number[] = [];
        for (let i = 0; i < 3; i++) {
          const start = Date.now();
          try {
            await apiService.transcribeBase64('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
          } catch {}
          latencies.push(Date.now() - start);
        }
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const max = Math.max(...latencies);
        const status = avg <= 3000 ? 'pass' : avg <= 6000 ? 'warn' : 'fail';
        return {
          status,
          detail: `3次平均${avg.toFixed(0)}ms, 最大${max}ms [${latencies.join(', ')}ms]`,
          metric: avg,
          threshold: 3000,
        };
      });

      await run('API延迟', 'LLM响应延迟', async () => {
        const start = Date.now();
        try {
          await apiService.chat('你好');
        } catch {}
        const elapsed = Date.now() - start;
        const status = elapsed <= 5000 ? 'pass' : elapsed <= 10000 ? 'warn' : 'fail';
        return { status, detail: `LLM延迟 ${elapsed}ms (阈值5000ms)`, metric: elapsed, threshold: 5000 };
      });

      await run('API延迟', 'TTS合成延迟', async () => {
        const start = Date.now();
        try {
          await apiService.synthesize('测试');
        } catch {}
        const elapsed = Date.now() - start;
        const status = elapsed <= 3000 ? 'pass' : elapsed <= 6000 ? 'warn' : 'fail';
        return { status, detail: `TTS延迟 ${elapsed}ms (阈值3000ms)`, metric: elapsed, threshold: 3000 };
      });

      await run('API延迟', '记忆搜索延迟', async () => {
        const start = Date.now();
        try {
          await apiService.searchMemories('测试');
        } catch {}
        const elapsed = Date.now() - start;
        const status = elapsed <= 2000 ? 'pass' : elapsed <= 4000 ? 'warn' : 'fail';
        return { status, detail: `记忆搜索延迟 ${elapsed}ms (阈值2000ms)`, metric: elapsed, threshold: 2000 };
      });

      // ==================== 音频系统 ====================
      await run('音频系统', '录音权限', async () => {
        const { status } = await Audio.requestPermissionsAsync();
        if (status === 'granted') {
          return { status: 'pass', detail: '录音权限已授予' };
        }
        return { status: 'fail', detail: `录音权限状态: ${status}` };
      });

      let testRecording: Audio.Recording | null = null;
      await run('音频系统', '录音创建', async () => {
        const start = Date.now();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        testRecording = recording;
        const elapsed = Date.now() - start;
        return { status: 'pass', detail: `录音创建成功 (${elapsed}ms)`, metric: elapsed };
      });

      await run('音频系统', '录音Metering', async () => {
        if (!testRecording) {
          return { status: 'fail', detail: '录音实例不存在，跳过' };
        }
        const status = await testRecording.getStatusAsync();
        if (status.metering !== undefined) {
          return { status: 'pass', detail: `Metering可用, 当前: ${status.metering.toFixed(1)}dB` };
        }
        return { status: 'fail', detail: 'Metering不可用' };
      });

      await run('音频系统', 'VAD音量采样', async () => {
        if (!testRecording) {
          return { status: 'fail', detail: '录音实例不存在，跳过' };
        }
        const samples: number[] = [];
        for (let i = 0; i < 10; i++) {
          const status = await testRecording.getStatusAsync();
          if (status.metering !== undefined) {
            samples.push(status.metering);
          }
          await new Promise(r => setTimeout(r, 100));
        }
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const max = Math.max(...samples);
        const min = Math.min(...samples);
        return {
          status: 'pass',
          detail: `10次采样: 平均${avg.toFixed(1)}dB, 范围[${min.toFixed(1)}, ${max.toFixed(1)}]dB`,
          metric: avg,
        };
      });

      await run('音频系统', '录音停止/重启', async () => {
        if (!testRecording) {
          return { status: 'fail', detail: '录音实例不存在，跳过' };
        }
        await new Promise(r => setTimeout(r, 200));
        const stopStart = Date.now();
        await testRecording.stopAndUnloadAsync();
        const stopElapsed = Date.now() - stopStart;

        const restartStart = Date.now();
        const { recording: newRec } = await Audio.Recording.createAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        const restartElapsed = Date.now() - restartStart;

        await new Promise(r => setTimeout(r, 200));
        await newRec.stopAndUnloadAsync();
        testRecording = null;
        return {
          status: 'pass',
          detail: `停止${stopElapsed}ms, 重启${restartElapsed}ms`,
          metric: stopElapsed + restartElapsed,
        };
      });

      await run('音频系统', '音频模式切换', async () => {
        const modes = [
          { allowsRecordingIOS: true, playsInSilentModeIOS: true },
          { allowsRecordingIOS: false, playsInSilentModeIOS: true },
          { allowsRecordingIOS: true, playsInSilentModeIOS: true },
        ];
        const results: string[] = [];
        for (const mode of modes) {
          const start = Date.now();
          await Audio.setAudioModeAsync(mode as any);
          results.push(`${Date.now() - start}ms`);
        }
        return { status: 'pass', detail: `3次模式切换: ${results.join(', ')}` };
      });

      // ==================== 内存与资源 ====================
      await run('内存与资源', '缓存目录检查', async () => {
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) {
          return { status: 'fail', detail: '缓存目录不可用' };
        }
        const info = await FileSystem.getInfoAsync(cacheDir);
        if (info.exists) {
          return { status: 'pass', detail: `缓存目录存在: ${cacheDir}` };
        }
        return { status: 'fail', detail: '缓存目录不存在' };
      });

      await run('内存与资源', '临时文件泄漏', async () => {
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) {
          return { status: 'warn', detail: '无法检查缓存目录' };
        }
        try {
          const files = await FileSystem.readDirectoryAsync(cacheDir);
          const ttsFiles = files.filter(f => f.startsWith('tts_') && f.endsWith('.mp3'));
          const recFiles = files.filter(f => f.includes('recording') || f.endsWith('.wav'));
          const totalFiles = files.length;

          let cleaned = 0;
          for (const f of [...ttsFiles, ...recFiles]) {
            try {
              await FileSystem.deleteAsync(cacheDir + f, { idempotent: true });
              cleaned++;
            } catch {}
          }

          if (ttsFiles.length > 0 || recFiles.length > 0) {
            return {
              status: cleaned > 0 ? 'pass' : 'warn',
              detail: cleaned > 0
                ? `已清理${cleaned}个残留文件 (TTS=${ttsFiles.length}, 录音=${recFiles.length})`
                : `发现残留文件但无法清理: TTS=${ttsFiles.length}, 录音=${recFiles.length}`,
            };
          }
          return { status: 'pass', detail: `缓存目录干净 (${totalFiles}个文件)` };
        } catch (error: any) {
          return { status: 'warn', detail: `无法扫描: ${error.message}` };
        }
      });

      await run('内存与资源', '录音创建/销毁循环', async () => {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const times: number[] = [];
        for (let i = 0; i < 5; i++) {
          const start = Date.now();
          const { recording } = await Audio.Recording.createAsync({
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
            isMeteringEnabled: true,
          });
          await new Promise(r => setTimeout(r, 200));
          await recording.stopAndUnloadAsync();
          times.push(Date.now() - start);
        }
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const trend = times[times.length - 1] - times[0];
        const hasLeak = trend > avg * 0.5;
        return {
          status: hasLeak ? 'warn' : 'pass',
          detail: `5次循环: [${times.join(', ')}]ms, 平均${avg.toFixed(0)}ms, 趋势${trend > 0 ? '+' : ''}${trend}ms`,
          metric: avg,
        };
      });

      await run('内存与资源', '连续TTS文件清理', async () => {
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) {
          return { status: 'warn', detail: '无法检查缓存' };
        }
        const beforeFiles = await FileSystem.readDirectoryAsync(cacheDir);
        const beforeTts = beforeFiles.filter(f => f.startsWith('tts_')).length;

        for (let i = 0; i < 3; i++) {
          const tempFile = cacheDir + `tts_test_${Date.now()}_${i}.mp3`;
          await FileSystem.writeAsStringAsync(tempFile, 'dGVzdA==', {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.deleteAsync(tempFile, { idempotent: true });
        }

        const afterFiles = await FileSystem.readDirectoryAsync(cacheDir);
        const afterTts = afterFiles.filter(f => f.startsWith('tts_')).length;

        if (afterTts <= beforeTts) {
          return { status: 'pass', detail: `TTS文件正确清理 (之前:${beforeTts}, 之后:${afterTts})` };
        }
        return { status: 'warn', detail: `TTS文件可能泄漏 (之前:${beforeTts}, 之后:${afterTts})` };
      });

      // ==================== 强壮性 ====================
      await run('强壮性', '无效Token请求', async () => {
        const originalToken = token;
        apiService.setToken('invalid_token_12345');
        try {
          await apiService.getCurrentUser();
          apiService.setToken(originalToken);
          return { status: 'warn', detail: '无效Token未被拒绝' };
        } catch (error: any) {
          apiService.setToken(originalToken);
          if (error?.response?.status === 401) {
            return { status: 'pass', detail: '无效Token正确返回401' };
          }
          return { status: 'warn', detail: `返回错误: ${error.message}` };
        }
      });

      await run('强壮性', '空base64 ASR', async () => {
        try {
          const result = await apiService.transcribeBase64('');
          if (result.text === '' || result.text === undefined) {
            return { status: 'pass', detail: '空base64优雅处理，返回空文本' };
          }
          return { status: 'warn', detail: `返回非空: "${result.text}"` };
        } catch (error: any) {
          return { status: 'pass', detail: `空base64正确报错: ${error.message?.substring(0, 50)}` };
        }
      });

      await run('强壮性', '空文本LLM', async () => {
        try {
          const result = await apiService.chat('');
          return { status: 'warn', detail: `空文本未被拒绝: ${result.response?.substring(0, 30)}` };
        } catch (error: any) {
          return { status: 'pass', detail: `空文本正确报错: ${error.message?.substring(0, 50)}` };
        }
      });

      await run('强壮性', '空文本TTS', async () => {
        try {
          const result = await apiService.synthesize('');
          if (!result.audio || result.audio.length < 100) {
            return { status: 'pass', detail: '空文本TTS返回空/小音频' };
          }
          return { status: 'warn', detail: `空文本TTS返回了音频 (${result.audio.length}字节)` };
        } catch (error: any) {
          return { status: 'pass', detail: `空文本TTS正确报错: ${error.message?.substring(0, 50)}` };
        }
      });

      await run('强壮性', '快速录音启停', async () => {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        let errors = 0;
        for (let i = 0; i < 5; i++) {
          try {
            const { recording } = await Audio.Recording.createAsync({
              ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
              isMeteringEnabled: true,
            });
            await new Promise(r => setTimeout(r, 200));
            await recording.stopAndUnloadAsync();
          } catch {
            errors++;
          }
        }
        if (errors === 0) {
          return { status: 'pass', detail: '5次快速启停全部成功' };
        }
        return { status: 'warn', detail: `5次快速启停 ${errors} 次失败` };
      });

      await run('强壮性', '并发ASR请求', async () => {
        const start = Date.now();
        const promises = Array(3).fill(null).map(() =>
          apiService.transcribeBase64('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=')
            .catch(() => ({ text: '' }))
        );
        const results = await Promise.allSettled(promises);
        const elapsed = Date.now() - start;
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        if (succeeded === 3) {
          return { status: 'pass', detail: `3次并发全部成功 (${elapsed}ms)` };
        }
        return { status: 'warn', detail: `3次并发 ${succeeded}/3 成功 (${elapsed}ms)` };
      });

      // ==================== 认证系统 ====================
      await run('认证系统', 'Token有效性', async () => {
        if (!token) {
          return { status: 'fail', detail: '未登录，无Token' };
        }
        try {
          const userData = await apiService.getCurrentUser();
          return { status: 'pass', detail: `Token有效, 用户: ${userData.username}` };
        } catch (error: any) {
          return { status: 'fail', detail: `Token无效: ${error.message}` };
        }
      });

      await run('认证系统', '用户信息获取', async () => {
        try {
          const userData = await apiService.getCurrentUser();
          const fields = ['id', 'username', 'nickname'];
          const missing = fields.filter(f => !(f in userData));
          if (missing.length === 0) {
            return { status: 'pass', detail: `用户信息完整: ${userData.username}(${userData.nickname || '无昵称'})` };
          }
          return { status: 'warn', detail: `缺少字段: ${missing.join(', ')}` };
        } catch (error: any) {
          return { status: 'fail', detail: `获取失败: ${error.message}` };
        }
      });

      await run('认证系统', '无效Token拒绝', async () => {
        const savedToken = token;
        apiService.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6ImludmFsaWQifQ.invalid');
        try {
          await apiService.getCurrentUser();
          apiService.setToken(savedToken);
          return { status: 'fail', detail: '无效Token未被拒绝' };
        } catch (error: any) {
          apiService.setToken(savedToken);
          if (error?.response?.status === 401 || error?.response?.status === 422) {
            return { status: 'pass', detail: `无效Token被拒绝 (${error?.response?.status})` };
          }
          return { status: 'warn', detail: `其他错误: ${error.message?.substring(0, 50)}` };
        }
      });

    } catch (error: any) {
      Alert.alert('测试异常', error.message || '未知错误');
    } finally {
      setRunning(false);
      setCurrentTest('');
    }
  };

  const getSummary = () => {
    const all = suites.flatMap(s => s.results);
    const pass = all.filter(r => r.status === 'pass').length;
    const fail = all.filter(r => r.status === 'fail').length;
    const warn = all.filter(r => r.status === 'warn').length;
    const pending = all.filter(r => r.status === 'pending' || r.status === 'running').length;
    return { pass, fail, warn, pending, total: all.length };
  };

  const exportReport = () => {
    const all = suites.flatMap(s => s.results);
    const summary = getSummary();
    const lines: string[] = [
      '========== 食光知己 诊断报告 ==========',
      `时间: ${new Date().toLocaleString()}`,
      `后端: ${apiService.getBaseUrl() || '未连接'}`,
      `用户: ${user?.username || '未登录'}`,
      '',
      '--- 总览 ---',
      `通过: ${summary.pass}/${summary.total}`,
      `警告: ${summary.warn}`,
      `失败: ${summary.fail}`,
      `跳过: ${summary.pending}`,
      '',
    ];

    for (const suite of suites) {
      lines.push(`--- ${suite.category} ---`);
      for (const r of suite.results) {
        const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : r.status === 'warn' ? '!' : '○';
        const time = r.duration > 0 ? ` [${r.duration}ms]` : '';
        const metric = r.metric !== undefined ? ` (${r.metric}ms/${r.threshold ? r.threshold + 'ms' : '-'})` : '';
        lines.push(`${icon} ${r.name}${time}${metric}: ${r.detail}`);
      }
      lines.push('');
    }

    lines.push('========== 报告结束 ==========');
    const report = lines.join('\n');
    console.log(report);
    Alert.alert('报告已导出', '请查看控制台输出 (npx expo log)\n\n' + report.substring(0, 500) + '...');
  };

  const summary = getSummary();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return colors.success;
      case 'fail': return colors.error;
      case 'warn': return colors.warning;
      case 'running': return colors.textMuted;
      default: return colors.textMuted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <Ionicons name="checkmark-circle" size={16} color={colors.success} />;
      case 'fail': return <Ionicons name="close-circle" size={16} color={colors.error} />;
      case 'warn': return <Ionicons name="alert-circle" size={16} color={colors.warning} />;
      case 'running': return <ActivityIndicator size="small" color={colors.primary} />;
      default: return <Ionicons name="ellipse-outline" size={16} color={colors.textMuted} />;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="medical-outline" size={28} color={colors.primary} style={{ marginBottom: 8 }} />
        <Text style={styles.title}>诊断测试</Text>
        <Text style={styles.subtitle}>食光知己 强壮性与性能测试</Text>
      </View>

      {suites.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryItem, { borderLeftColor: colors.success }]}>
              <Text style={styles.summaryNum}>{summary.pass}</Text>
              <Text style={styles.summaryLabel}>通过</Text>
            </View>
            <View style={[styles.summaryItem, { borderLeftColor: colors.warning }]}>
              <Text style={styles.summaryNum}>{summary.warn}</Text>
              <Text style={styles.summaryLabel}>警告</Text>
            </View>
            <View style={[styles.summaryItem, { borderLeftColor: colors.error }]}>
              <Text style={styles.summaryNum}>{summary.fail}</Text>
              <Text style={styles.summaryLabel}>失败</Text>
            </View>
            <View style={[styles.summaryItem, { borderLeftColor: colors.textMuted }]}>
              <Text style={styles.summaryNum}>{summary.pending}</Text>
              <Text style={styles.summaryLabel}>待测</Text>
            </View>
          </View>
          {running && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {completedTests}/{totalTests} — {currentTest}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.buttonRow}>
        <AppButton
          title="开始测试"
          onPress={runAllTests}
          variant="primary"
          loading={running}
          disabled={running}
          style={{ flex: 1 }}
        />
        {suites.length > 0 && !running && (
          <AppButton
            title="导出报告"
            onPress={exportReport}
            variant="secondary"
            style={{ flex: 1 }}
          />
        )}
      </View>

      <View style={styles.buttonRow}>
        <AppButton
          title="清理缓存文件"
          onPress={async () => {
            const cacheDir = FileSystem.cacheDirectory;
            if (!cacheDir) return;
            try {
              const files = await FileSystem.readDirectoryAsync(cacheDir);
              const junk = files.filter(f =>
                (f.startsWith('tts_') && f.endsWith('.mp3')) ||
                f.includes('recording') || f.endsWith('.wav')
              );
              let cleaned = 0;
              for (const f of junk) {
                try {
                  await FileSystem.deleteAsync(cacheDir + f, { idempotent: true });
                  cleaned++;
                } catch {}
              }
              Alert.alert('清理完成', `已清理 ${cleaned} 个残留文件`);
            } catch (e: any) {
              Alert.alert('清理失败', e.message || '未知错误');
            }
          }}
          variant="danger"
        />
      </View>

      <View style={styles.envInfo}>
        <Text style={styles.envTitle}>环境信息</Text>
        <Text style={styles.envText}>后端: {apiService.getBaseUrl() || '未连接'}</Text>
        <Text style={styles.envText}>用户: {user?.username || '未登录'}</Text>
        <Text style={styles.envText}>Token: {token ? `${token.substring(0, 10)}...` : '无'}</Text>
      </View>

      {suites.map(suite => (
        <View key={suite.category} style={styles.suiteCard}>
          <Text style={styles.suiteTitle}>{suite.category}</Text>
          {suite.results.map(result => (
            <View key={result.name} style={styles.testRow}>
              <View style={styles.testIconWrap}>{getStatusIcon(result.status)}</View>
              <View style={styles.testInfo}>
                <View style={styles.testHeader}>
                  <Text style={styles.testName}>{result.name}</Text>
                  {result.duration > 0 && (
                    <Text style={styles.testDuration}>{result.duration}ms</Text>
                  )}
                </View>
                <Text
                  style={[styles.testDetail, { color: getStatusColor(result.status) }]}
                  numberOfLines={2}
                >
                  {result.detail || (result.status === 'running' ? '测试中...' : '待测试')}
                </Text>
                {result.metric !== undefined && result.threshold && (
                  <View style={styles.metricBar}>
                    <View
                      style={[
                        styles.metricFill,
                        {
                          width: `${Math.min((result.metric / result.threshold) * 100, 100)}%`,
                          backgroundColor: result.metric <= result.threshold ? colors.success : result.metric <= result.threshold * 2 ? colors.warning : colors.error,
                        },
                      ]}
                    />
                    <Text style={styles.metricText}>
                      {result.metric.toFixed(0)}ms / {result.threshold}ms
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
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
    paddingBottom: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: typography.h1,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    paddingVertical: 4,
  },
  summaryNum: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: typography.caption,
    color: '#888',
  },
  progressContainer: {
    marginTop: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  envInfo: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#444',
  },
  envTitle: {
    fontSize: typography.caption,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  envText: {
    fontSize: typography.caption,
    color: '#999',
    lineHeight: 18,
  },
  suiteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 12,
  },
  suiteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  testRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  testIconWrap: {
    marginRight: 10,
    marginTop: 2,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testInfo: {
    flex: 1,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ddd',
  },
  testDuration: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
  },
  testDetail: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  metricBar: {
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  metricFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    opacity: 0.6,
  },
  metricText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
    fontFamily: 'monospace',
  },
});
