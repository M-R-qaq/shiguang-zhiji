import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PORT = 8000;
const CACHED_URL_KEY = '@shiguang:backend_url';

function generateScanIPs(): string[] {
  const ips: string[] = [];

  if (Platform.OS === 'android') {
    ips.push('10.0.2.2');
  }

  ips.push('127.0.0.1', 'localhost');

  const subnets = [
    '192.168.0', '192.168.1', '192.168.2', '192.168.3',
    '192.168.4', '192.168.5', '192.168.10', '192.168.31',
    '192.168.50', '192.168.100', '192.168.101',
    '10.0.0', '10.0.1',
    '172.16.0', '172.16.1',
  ];

  const commonHosts = [1, 2, 10, 50, 100, 101, 102, 103, 104, 105, 110, 111, 112, 150];

  for (const subnet of subnets) {
    for (const host of commonHosts) {
      ips.push(`${subnet}.${host}`);
    }
  }

  return ips;
}

async function tryConnect(url: string, timeout: number): Promise<string | null> {
  try {
    await axios.get(`${url}/`, { timeout });
    return url;
  } catch {
    return null;
  }
}

async function detectBackend(): Promise<string | null> {
  try {
    const cachedUrl = await AsyncStorage.getItem(CACHED_URL_KEY);
    if (cachedUrl) {
      console.log('[API] 尝试缓存地址:', cachedUrl);
      const result = await tryConnect(cachedUrl, 3000);
      if (result) {
        console.log('[API] 缓存地址可用:', result);
        return result;
      }
      console.log('[API] 缓存地址不可用，开始扫描');
    }
  } catch (e) {
    console.log('[API] 读取缓存失败:', e);
  }

  const allIPs = generateScanIPs();
  const urls = allIPs.map(ip => `http://${ip}:${PORT}`);

  console.log(`[API] 开始扫描 ${urls.length} 个候选地址...`);

  const batchSize = 20;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(url => tryConnect(url, 2000))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        console.log('[API] 发现后端:', result.value);
        try {
          await AsyncStorage.setItem(CACHED_URL_KEY, result.value);
        } catch (e) {
          console.log('[API] 缓存地址失败:', e);
        }
        return result.value;
      }
    }
  }

  console.log('[API] 未发现后端');
  return null;
}

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;
  private baseUrl: string | null = null;
  private _onBackendLost: (() => void) | null = null;
  private _consecutiveNetworkErrors: number = 0;

  onBackendLost(callback: () => void) {
    this._onBackendLost = callback;
  }

  constructor() {
    this.client = axios.create({
      timeout: 60000,
    });

    let retryCount = 0;
    const MAX_RETRIES = 3;

    this.client.interceptors.request.use(
      (config) => {
        if (this.baseUrl) {
          config.baseURL = this.baseUrl;
        }
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
        } else {
          config.headers['Content-Type'] = 'application/json';
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        retryCount = 0;
        this._consecutiveNetworkErrors = 0;
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as any;
        if (!config) return Promise.reject(error);

        const isNetworkError = !error.response;
        if (isNetworkError) {
          this._consecutiveNetworkErrors++;
          if (this._consecutiveNetworkErrors >= 3 && this._onBackendLost) {
            this._consecutiveNetworkErrors = 0;
            this._onBackendLost();
          }
        }

        const isRetryable = !error.response || (error.response.status >= 500);
        const currentRetry = config.__retryCount || 0;

        if (isRetryable && currentRetry < MAX_RETRIES) {
          config.__retryCount = currentRetry + 1;
          const delay = Math.pow(2, currentRetry) * 1000;
          console.log(`[API] 重试 ${config.__retryCount}/${MAX_RETRIES}, 延迟 ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          return this.client.request(config);
        }

        return Promise.reject(error);
      }
    );
  }

  async autoDetect(): Promise<string | null> {
    const url = await detectBackend();
    if (url) {
      this.baseUrl = url;
      console.log('[API] 自动检测到后端地址:', url);
    }
    return url;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  async pingBackend(url: string): Promise<boolean> {
    try {
      await axios.get(`${url}/`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async register(username: string, password: string, nickname?: string) {
    const data: any = { username, password };
    if (nickname) data.nickname = nickname;
    const response = await this.client.post('/auth/register', data);
    return response.data;
  }

  async login(username: string, password: string) {
    const response = await this.client.post('/auth/login', {
      username,
      password,
    });
    this.setToken(response.data.access_token);
    return response.data;
  }

  async logout() {
    try {
      if (this.token) {
        await this.client.post('/auth/logout');
      }
    } finally {
      this.setToken(null);
    }
    return { success: true, message: '登出成功' };
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async updateUserInfo(nickname?: string, email?: string) {
    const data: any = {};
    if (nickname !== undefined) data.nickname = nickname;
    if (email !== undefined) data.email = email;
    const response = await this.client.put('/auth/me', data);
    return response.data;
  }

  async deleteAccount() {
    const response = await this.client.delete('/auth/me');
    this.setToken(null);
    return response.data;
  }

  async transcribe(audioUri: string) {
    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/wav',
      name: 'recording.wav',
    } as any);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/asr/transcribe`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传失败: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch {
      return await this.transcribeBase64Fallback(audioUri);
    }
  }

  async transcribeBase64(audioBase64: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}/asr/transcribe-base64`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ audio_base64: audioBase64, format: 'wav' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ASR识别失败: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  private async transcribeBase64Fallback(audioUri: string): Promise<{ text: string }> {
    // 如果 FormData 上传失败，尝试用 FileSystem 读取�?base64 上传
    const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
    const base64Audio = await readAsStringAsync(audioUri, { encoding: EncodingType.Base64 });
    return await this.transcribeBase64(base64Audio);
  }

  async synthesize(text: string, speed: number = 70) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}/tts/synthesize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, speed }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS失败: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async chat(message: string, history: Array<{ role: string; content: string }> = [], sessionId?: string) {
    const data: any = { message, history };
    if (sessionId) data.session_id = sessionId;
    const response = await this.client.post('/llm/chat', data);
    return response.data;
  }

  async chatStream(
    message: string,
    history: Array<{ role: string; content: string }> = [],
    sessionId?: string
  ) {
    const data: any = { message, history };
    if (sessionId) data.session_id = sessionId;
    const response = await this.client.post('/llm/chat/stream', data, {
      responseType: 'stream',
    });
    return response.data;
  }

  async chatStreamSSE(
    message: string,
    onEvent: (event: { type: string; [key: string]: any }) => void,
    history: Array<{ role: string; content: string }> = [],
    sessionId?: string
  ): Promise<void> {
    const baseUrl = this.baseUrl || '';
    const url = `${baseUrl}/llm/chat/stream`;

    const body: any = { message, history };
    if (sessionId) body.session_id = sessionId;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'text/event-stream');
      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }

      let lastLength = 0;
      let buffer = '';

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) {
          if (xhr.status !== 200) {
            reject(new Error(`SSE连接失败: ${xhr.status}`));
          }
        }
      };

      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(lastLength);
        lastLength = xhr.responseText.length;

        buffer += newData;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (!dataStr) continue;
            try {
              const event = JSON.parse(dataStr);
              onEvent(event);
              if (event.type === 'done' || event.type === 'error') {
                xhr.abort();
                resolve();
                return;
              }
            } catch (e) {
              console.warn('[SSE] 解析事件失败:', dataStr);
            }
          }
        }
      };

      xhr.onload = () => {
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (!dataStr) continue;
              try {
                const event = JSON.parse(dataStr);
                onEvent(event);
              } catch (e) {}
            }
          }
        }
        resolve();
      };

      xhr.onerror = () => {
        reject(new Error('SSE网络错误'));
      };

      xhr.ontimeout = () => {
        reject(new Error('SSE连接超时'));
      };

      xhr.timeout = 120000;
      xhr.send(JSON.stringify(body));
    });
  }

  async getHistory(limit: number = 50, offset: number = 0, sessionId?: string) {
    const params: any = { limit, offset };
    if (sessionId) params.session_id = sessionId;
    const response = await this.client.get('/llm/history', { params });
    return response.data;
  }

  async getSessions(limit: number = 20) {
    const response = await this.client.get('/llm/sessions', { params: { limit } });
    return response.data;
  }

  async getSessionDetail(sessionId: string) {
    const response = await this.client.get(`/llm/sessions/${sessionId}`);
    return response.data;
  }

  async deleteSession(sessionId: string) {
    const response = await this.client.delete(`/llm/sessions/${sessionId}`);
    return response.data;
  }

  async clearHistory() {
    const response = await this.client.delete('/llm/history');
    return response.data;
  }

  async addMemory(content: string, category: string = 'general', importance: number = 3) {
    const response = await this.client.post('/memory', {
      content,
      category,
      importance,
    });
    return response.data;
  }

  async getMemories(category?: string, limit: number = 100) {
    const params: any = { limit };
    if (category) params.category = category;
    const response = await this.client.get('/memory', { params });
    return response.data;
  }

  async searchMemories(query: string, nResults: number = 5, category?: string) {
    const response = await this.client.post('/memory/search', {
      query,
      n_results: nResults,
      category,
    });
    return response.data;
  }

  async deleteMemory(memoryId: number) {
    const response = await this.client.delete(`/memory/${memoryId}`);
    return response.data;
  }

  async updateMemory(memoryId: number, data: { content?: string; category?: string; importance?: number }) {
    const response = await this.client.put(`/memory/${memoryId}`, data);
    return response.data;
  }

  async searchContent(keyword: string, limit: number = 5) {
    const response = await this.client.post('/search', {
      keyword,
      limit,
    });
    return response.data;
  }

  async checkCareNeeded() {
    const response = await this.client.post('/memory/care/check');
    return response.data;
  }

  async extractMemories(userMessage: string, assistantMessage: string) {
    const response = await this.client.post('/memory/extract', {
      user_message: userMessage,
      assistant_message: assistantMessage,
    });
    return response.data;
  }

  async getWakeWordConfig() {
    const response = await this.client.get('/wakeword/config');
    return response.data;
  }

  async updateWakeWordName(wakeWordName: string) {
    const response = await this.client.put('/wakeword/name', {
      wake_word_name: wakeWordName,
    });
    return response.data;
  }

  async resetWakeWordName() {
    const response = await this.client.post('/wakeword/reset');
    return response.data;
  }

}

export const apiService = new ApiService();
export default apiService;
export { ApiService };
