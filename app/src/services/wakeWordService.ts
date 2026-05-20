import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';

type KwsCallback = (keyword: string) => void;

const SherpaOnnx = NativeModules.SherpaOnnx;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const WAKEWORD_SAMPLE_RATE = 16000;
const WAKEWORD_BUFFER_SIZE_FRAMES = 1024;
const LOW_AUDIO_PEAK = 0.01;
const TARGET_AUDIO_PEAK = 0.8;
const MAX_AUDIO_GAIN = 80;

function base64Decode(str: string): Uint8Array {
  if (!str) return new Uint8Array(0);
  const len = str.length;
  let byteLen = len * 3 / 4;
  if (str[len - 1] === '=') byteLen--;
  if (str[len - 2] === '=') byteLen--;
  const bytes = new Uint8Array(byteLen);
  let bytePos = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64.indexOf(str[i]);
    const b = B64.indexOf(str[i + 1]);
    const c = B64.indexOf(str[i + 2]);
    const d = B64.indexOf(str[i + 3]);
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (bytePos < byteLen) bytes[bytePos++] = (triple >> 16) & 0xff;
    if (bytePos < byteLen) bytes[bytePos++] = (triple >> 8) & 0xff;
    if (bytePos < byteLen) bytes[bytePos++] = triple & 0xff;
  }
  return bytes;
}

function base64ToInt16Samples(base64: string): number[] {
  const bytes = base64Decode(base64);
  const samples: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const low = bytes[i];
    const high = bytes[i + 1] || 0;
    let int16 = (high << 8) | low;
    if (int16 >= 0x8000) int16 -= 0x10000;
    samples.push(int16 / 32768.0);
  }
  return samples;
}

let instanceCounter = 0;
let streamCounter = 0;

function normalizeWakeText(text: string): string {
  return text.replace(/[\s，,。.！!？?、]/g, '');
}

function buildHotwords(keyword: string): string {
  const cleaned = normalizeWakeText(keyword);
  if (cleaned.length === 0) return '';

  const candidates = new Map<string, number>();
  candidates.set(cleaned, 8.0);
  candidates.set(keyword.trim(), 7.0);

  if (cleaned.startsWith('你好') && cleaned.length > 2) {
    candidates.set(cleaned.slice(2), 4.0);
  }

  return Array.from(candidates.entries())
    .filter(([word]) => word.length >= 2)
    .map(([word, score]) => `${word} :${score}`)
    .join('\n');
}

function normalizeAudioSamples(samples: number[]): number[] {
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }

  if (maxAbs <= 0 || maxAbs >= TARGET_AUDIO_PEAK) return samples;

  const gain = maxAbs < LOW_AUDIO_PEAK
    ? MAX_AUDIO_GAIN
    : Math.min(MAX_AUDIO_GAIN, TARGET_AUDIO_PEAK / maxAbs);

  if (gain <= 1.01) return samples;

  return samples.map((sample) => {
    const amplified = sample * gain;
    if (amplified > 1) return 1;
    if (amplified < -1) return -1;
    return amplified;
  });
}

function fuzzyMatch(text: string, keyword: string): boolean {
  const cleanText = normalizeWakeText(text);
  const cleanKW = normalizeWakeText(keyword);
  if (cleanText.includes(cleanKW)) return true;
  if (cleanKW.length <= 2) return false;

  const nameOnly = cleanKW.startsWith('你好') ? cleanKW.slice(2) : '';
  if (nameOnly.length >= 2 && cleanText.includes(nameOnly)) return true;

  let matched = 0;
  for (let i = 0; i < cleanKW.length; i++) {
    if (cleanText.includes(cleanKW[i])) matched++;
  }
  return matched >= Math.ceil(cleanKW.length * 0.8);
}

class WakeWordService {
  private initialized = false;
  private listening = false;
  private callback: KwsCallback | null = null;
  private instanceId: string = '';
  private streamId: string = '';
  private streamVersion: number = 0;
  private lastDetectionTime = 0;
  private cooldownMs = 3000;
  private currentKeyword: string = '你好知己';
  private currentKeywordClean: string = '你好知己';
  private pcmListener: any = null;

  async initialize(keyword: string = '你好知己'): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('[WakeWord] 仅支持 Android 平台');
      return false;
    }

    if (!SherpaOnnx) {
      console.error('[WakeWord] SherpaOnnx 原生模块未找到');
      return false;
    }

    if (this.initialized) {
      await this.release();
    }

    this.currentKeyword = keyword;
    this.currentKeywordClean = normalizeWakeText(keyword);

    try {
      this.instanceId = `wakeword_${++instanceCounter}`;
      console.log('[WakeWord] instanceId:', this.instanceId);

      const modelConfig = { type: 'asset', path: 'models/kws' };
      console.log('[WakeWord] 解析模型路径...');
      const modelDir = await SherpaOnnx.resolveModelPath(modelConfig);
      console.log('[WakeWord] 模型路径:', modelDir);

      console.log('[WakeWord] 初始化流式STT...');
      const initResult = await SherpaOnnx.initializeOnlineSttWithOptions(
        this.instanceId,
        {
          modelDir: modelDir,
          modelType: 'transducer',
          enableEndpoint: true,
          decodingMethod: 'modified_beam_search',
          maxActivePaths: 10,
          numThreads: 2,
          blankPenalty: 0.0,
          rule1MinTrailingSilence: 1.8,
          rule2MinTrailingSilence: 0.8,
          rule2MustContainNonSilence: true,
          rule3MinUtteranceLength: 20,
        }
      );

      if (!initResult.success) {
        console.error('[WakeWord] STT引擎初始化失败:', initResult.error);
        return false;
      }

      this.initialized = true;
      console.log('[WakeWord] 流式STT初始化成功');
      return true;
    } catch (error: any) {
      console.error('[WakeWord] 初始化失败:', error?.message || error);
      this.initialized = false;
      return false;
    }
  }

  async updateKeyword(keyword: string): Promise<boolean> {
    this.currentKeyword = keyword;
    this.currentKeywordClean = normalizeWakeText(keyword);
    const wasListening = this.listening;
    const savedCallback = this.callback;
    if (this.listening) await this.stopListening();
    if (this.initialized) await this.release();
    const ok = await this.initialize(keyword);
    if (ok && wasListening && savedCallback) {
      await this.startListening(savedCallback);
    }
    return ok;
  }

  async startListening(callback: KwsCallback): Promise<boolean> {
    if (!this.initialized || !this.instanceId) {
      console.log('[WakeWord] 未初始化');
      return false;
    }

    if (this.listening) await this.stopListening();

    try {
      this.callback = callback;

      this.streamId = `wakeword_stream_${++streamCounter}`;
      const currentVersion = ++this.streamVersion;
      console.log('[WakeWord] 创建STT流:', this.instanceId, this.streamId);
      await SherpaOnnx.createSttStream(this.instanceId, this.streamId, '');
      console.log('[WakeWord] STT流创建成功');

      console.log('[WakeWord] 启动PCM麦克风...');
      await SherpaOnnx.startPcmLiveStream({
        sampleRate: WAKEWORD_SAMPLE_RATE,
        channelCount: 1,
        bufferSizeFrames: WAKEWORD_BUFFER_SIZE_FRAMES,
      });
      console.log('[WakeWord] PCM麦克风已启动');

      this.pcmListener = DeviceEventEmitter.addListener(
        'pcmLiveStreamData',
        async (event: { base64Pcm: string; sampleRate: number }) => {
          try {
            if (!this.listening || !this.streamId) return;
            if (this.streamVersion !== currentVersion) return;
            if (!event?.base64Pcm) return;

            const rawSamples = base64ToInt16Samples(event.base64Pcm);
            if (rawSamples.length === 0) return;
            const samples = normalizeAudioSamples(rawSamples);

            const result = await SherpaOnnx.processSttAudioChunk(
              this.streamId,
              samples,
              WAKEWORD_SAMPLE_RATE
            );

            const text = (result.text || '').trim();
            if (text.length > 0) {
              console.log('[WakeWord] 识别到:', text);
              if (this.containsWakeWord(text)) {
                const now = Date.now();
                if (now - this.lastDetectionTime >= this.cooldownMs) {
                  this.lastDetectionTime = now;
                  console.log('[WakeWord] ✅ 唤醒词匹配!');
                  this.callback?.(text);
                }
              }
            }

            if (result.isEndpoint) {
              await SherpaOnnx.resetSttStream(this.streamId);
            }
          } catch (err: any) {
            console.warn('[WakeWord] chunk异常:', err?.message);
          }
        }
      );

      this.listening = true;
      console.log('[WakeWord] 开始监听');
      return true;
    } catch (error: any) {
      console.error('[WakeWord] 启动监听失败:', error?.message || error);
      this.listening = false;
      return false;
    }
  }

  private containsWakeWord(text: string): boolean {
    return fuzzyMatch(text, this.currentKeywordClean);
  }

  async stopListening(): Promise<void> {
    if (!this.listening) return;
    try {
      await SherpaOnnx.stopPcmLiveStream();
      if (this.pcmListener) { this.pcmListener.remove(); this.pcmListener = null; }
      if (this.streamId) {
        try { await SherpaOnnx.releaseSttStream(this.streamId); } catch {}
        this.streamId = '';
      }
    } catch (error: any) {
      console.error('[WakeWord] 停止监听失败:', error?.message);
    }
    this.listening = false;
    this.callback = null;
    console.log('[WakeWord] 停止监听');
  }

  async release(): Promise<void> {
    await this.stopListening();
    if (this.instanceId) {
      try { await SherpaOnnx.unloadOnlineStt(this.instanceId); } catch {}
      this.instanceId = '';
    }
    this.initialized = false;
    console.log('[WakeWord] 已释放');
  }

  isListening(): boolean { return this.listening; }
  isInitialized(): boolean { return this.initialized; }
  setCooldown(ms: number) { this.cooldownMs = ms; }
  getCurrentKeyword(): string { return this.currentKeyword; }
}

export const wakeWordService = new WakeWordService();
export default wakeWordService;
