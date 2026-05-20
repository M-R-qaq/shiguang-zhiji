import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService as authService } from '../services/api';

interface User {
  id: number;
  username: string;
  nickname: string | null;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  backendUrl: string | null;
  backendDetecting: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
  setManualBackendUrl: (url: string) => Promise<boolean>;
  retryDetectBackend: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [backendDetecting, setBackendDetecting] = useState(true);

  useEffect(() => {
    initApp();

    authService.onBackendLost(async () => {
      console.warn('[Auth] 后端连接丢失，自动登出');
      try {
        if (token) {
          await authService.logout();
        }
      } catch {
      } finally {
        setToken(null);
        setUser(null);
        setBackendUrl(null);
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('auth_user');
        authService.setToken(null);
      }
    });
  }, [token]);

  const initApp = async () => {
    try {
      const detectedUrl = await authService.autoDetect();
      if (detectedUrl) {
        setBackendUrl(detectedUrl);
      }

      await loadStoredAuth();
    } catch (error) {
      console.error('应用初始化失败:', error);
    } finally {
      setBackendDetecting(false);
    }
  };

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('auth_user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        authService.setToken(storedToken);
      }
    } catch (error) {
      console.error('加载认证信息失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const response = await authService.login(username, password);
    const userData = await authService.getCurrentUser();

    setToken(response.access_token);
    setUser(userData);

    await AsyncStorage.setItem('auth_token', response.access_token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(userData));
    authService.setToken(response.access_token);
  };

  const register = async (username: string, password: string, nickname?: string) => {
    await authService.register(username, password, nickname);
    await login(username, password);
  };

  const logout = async () => {
    try {
      if (token) {
        await authService.logout();
      }
    } catch (error) {
      console.error('登出API调用失败:', error);
    } finally {
      setToken(null);
      setUser(null);
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('auth_user');
      authService.setToken(null);
    }
  };

  const updateNickname = async (nickname: string) => {
    await authService.updateUserInfo(nickname);
    if (user) {
      setUser({ ...user, nickname });
    }
  };

  const setManualBackendUrl = async (url: string) => {
    const isAvailable = await authService.pingBackend(url);
    if (isAvailable) {
      authService.setBaseUrl(url);
      setBackendUrl(url);
      AsyncStorage.setItem('@shiguang:backend_url', url).catch(() => {});
    } else {
      authService.setBaseUrl(url);
      setBackendUrl(null);
      AsyncStorage.setItem('@shiguang:backend_url', url).catch(() => {});
    }
    return isAvailable;
  };

  const retryDetectBackend = async () => {
    setBackendDetecting(true);
    try {
      const url = await authService.autoDetect();
      if (url) {
        setBackendUrl(url);
      }
      return url;
    } finally {
      setBackendDetecting(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        backendUrl,
        backendDetecting,
        login,
        register,
        logout,
        updateNickname,
        setManualBackendUrl,
        retryDetectBackend,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
