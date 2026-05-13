import axios, { AxiosInstance, AxiosError } from 'axios';

// API Base URL - Update IP as needed
const API_BASE_URL = 'http://192.168.10.107:8000'

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          console.log('认证过期');
        }
        return Promise.reject(error);
      }
    );
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

  async transcribe(audioBlob: Blob) {
    const formData = new FormData();
    formData.append('file', audioBlob);
    const response = await this.client.post('/asr/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async synthesize(text: string) {
    const response = await this.client.post('/tts/synthesize', {
      text,
    });
    return response.data;
  }

  async chat(message: string, history: Array<{role: string; content: string}> = []) {
    const response = await this.client.post('/llm/chat', {
      message,
      history,
    });
    return response.data;
  }

  async chatStream(message: string, history: Array<{role: string; content: string}> = [], onChunk: (chunk: string) => void) {
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
