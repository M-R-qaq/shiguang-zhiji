import { create } from 'zustand';

// 应用状态类型
export type AppState = 'idle' | 'listening' | 'speaking';

// 记忆条目类型
export interface Memory {
  id: number;
  content: string;
  category: string;
  created_at: string;
  is_cared: boolean;
}

// 对话消息类型
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Store 状态类型
interface AppStore {
  // 状态
  appState: AppState;
  isRecording: boolean;
  isPlaying: boolean;
  wakeWordDetected: boolean;
  lastWakeTime: number | null;
  
  // 记忆
  memories: Memory[];
  
  // 对话
  messages: Message[];
  isLoading: boolean;
  
  // 用户
  nickname: string | null;
  
  // 动作
  setAppState: (state: AppState) => void;
  setIsRecording: (recording: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  setWakeWordDetected: (detected: boolean) => void;
  setNickname: (nickname: string | null) => void;
  
  // 记忆动作
  addMemory: (memory: Memory) => void;
  updateMemory: (id: number, updates: Partial<Memory>) => void;
  
  // 消息动作
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  clearMessages: () => void;
  setMessages: (messages: Message[]) => void;
  
  // 状态转换
  enterListeningState: () => void;
  enterSpeakingState: () => void;
  enterIdleState: () => void;
  resetSession: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // 初始状态
  appState: 'idle',
  isRecording: false,
  isPlaying: false,
  wakeWordDetected: false,
  lastWakeTime: null,
  
  memories: [],
  
  messages: [],
  isLoading: false,
  
  nickname: null,
  
  // 基础状态设置
  setAppState: (state) => set({ appState: state }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setWakeWordDetected: (detected) => set({ wakeWordDetected: detected }),
  setNickname: (nickname) => set({ nickname }),
  
  // 记忆动作
  addMemory: (memory) => set((state) => ({
    memories: [...state.memories, memory]
  })),
  
  updateMemory: (id, updates) => set((state) => ({
    memories: state.memories.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    )
  })),
  
  // 消息动作
  addMessage: (role, content) => set((state) => ({
    messages: [
      ...state.messages,
      {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        role,
        content,
        timestamp: new Date(),
      }
    ]
  })),
  
  clearMessages: () => set({ messages: [] }),
  
  setMessages: (messages) => set({ messages }),
  
  // 状态转换
  enterListeningState: () => set({
    appState: 'listening',
    wakeWordDetected: true,
    lastWakeTime: Date.now(),
    isRecording: true,
  }),
  
  enterSpeakingState: () => set({
    appState: 'speaking',
    isRecording: false,
    isPlaying: true,
  }),
  
  enterIdleState: () => set({
    appState: 'idle',
    wakeWordDetected: false,
    isRecording: false,
    isPlaying: false,
  }),
  
  resetSession: () => set({
    appState: 'idle',
    isRecording: false,
    isPlaying: false,
    wakeWordDetected: false,
  }),
}));