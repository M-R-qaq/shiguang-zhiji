import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';

const COMMON_IPS = [
  '192.168.1.100',
  '192.168.1.101',
  '192.168.1.102',
  '192.168.2.100',
  '192.168.31.100',
  '192.168.10.107',
  '10.0.2.2',
  '127.0.0.1',
];

async function detectBackend(): Promise<string | null> {
  const port = 8000;
  const candidates = COMMON_IPS.map(ip => `http://${ip}:${port}`);

  const results = await Promise.allSettled(
    candidates.map(url =>
      axios.get(`${url}/`, { timeout: 1500 })
        .then(() => url)
        .catch(() => null)
    )
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }

  return null;
}

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;
  private baseUrl: string | null = null;

  constructor() {
    this.client = axios.create({
      timeout: 60000,
    });

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
      (response) => response,
      (error: AxiosError) => Promise.reject(error)
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

  async synthesize(text: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}/tts/synthesize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS失败: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async chat(message: string, history: Array<{ role: string; content: string }> = []) {
    const response = await this.client.post('/llm/chat', {
      message,
      history,
    });
    return response.data;
  }

  async chatStream(
    message: string,
    history: Array<{ role: string; content: string }> = [],
    onChunk: (chunk: string) => void
  ) {
    const response = await this.client.post('/llm/chat/stream', {
      message,
      history,
    }, {
      responseType: 'stream',
    });
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
