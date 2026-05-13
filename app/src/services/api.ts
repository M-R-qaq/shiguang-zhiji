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

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async chat(message: string, history: Array<{role: string; content: string}> = []) {
    const response = await this.client.post('/llm/chat', {
      message,
      history,
    });
    return response.data;
  }

  async updateNickname(nickname: string) {
    const response = await this.client.put('/auth/me', {
      nickname,
    });
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
}

export const apiService = new ApiService();
export default apiService;
export { ApiService };
