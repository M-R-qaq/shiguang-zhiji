import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppState = 'idle' | 'listening' | 'speaking';

export interface Memory {
  id: number;
  content: string;
  category: string;
  created_at: string;
  is_cared: boolean;
}

export interface VideoResult {
  title: string;
  bvid: string;
  cover: string;
  author: string;
  duration: string;
  play_count: string;
  url: string;
}

export interface WebSearchResult {
  title: string;
  content: string;
  url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'recommend';
  content: string;
  timestamp: Date;
  sessionId?: string | null;
  careInjected?: boolean;
  recommendData?: {
    query: string;
    results: VideoResult[];
  };
  webSearchData?: {
    query: string;
    results: WebSearchResult[];
  };
}

const MESSAGES_STORAGE_KEY = '@shiguang:messages';
const SESSION_ID_KEY = '@shiguang:session_id';
const SHOW_CHAT_TEXT_KEY = '@shiguang:show_chat_text';
const ONBOARDING_COMPLETED_KEY = '@shiguang:onboarding_completed';
const WELCOME_DONE_KEY = '@shiguang:welcome_done';
const FEATURE_TIPS_KEY = '@shiguang:feature_tips';
const MAX_PERSISTED_MESSAGES = 200;

async function persistMessages(messages: Message[]) {
  try {
    const toSave = messages.slice(-MAX_PERSISTED_MESSAGES);
    const serialized = JSON.stringify(toSave.map(m => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })));
    await AsyncStorage.setItem(MESSAGES_STORAGE_KEY, serialized);
  } catch (e) {
    console.error('[Store] 持久化消息失败:', e);
  }
}

async function loadPersistedMessages(): Promise<Message[]> {
  try {
    const data = await AsyncStorage.getItem(MESSAGES_STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return parsed.map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch (e) {
    console.error('[Store] 加载持久化消息失败:', e);
    return [];
  }
}

async function persistSessionId(sessionId: string | null) {
  try {
    if (sessionId) {
      await AsyncStorage.setItem(SESSION_ID_KEY, sessionId);
    } else {
      await AsyncStorage.removeItem(SESSION_ID_KEY);
    }
  } catch (e) {
    console.error('[Store] 持久化会话ID失败:', e);
  }
}

async function loadSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_ID_KEY);
  } catch (e) {
    return null;
  }
}

async function persistShowChatText(show: boolean) {
  try {
    await AsyncStorage.setItem(SHOW_CHAT_TEXT_KEY, show ? 'true' : 'false');
  } catch (e) {
    console.error('[Store] 持久化文本显示设置失败:', e);
  }
}

async function loadShowChatText(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SHOW_CHAT_TEXT_KEY);
    return value !== 'false';
  } catch (e) {
    return true;
  }
}

async function persistOnboardingCompleted(completed: boolean) {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, completed ? 'true' : 'false');
  } catch (e) {
    console.error('[Store] 持久化onboarding状态失败:', e);
  }
}

async function loadOnboardingCompleted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
    return value === null ? true : value === 'true';
  } catch (e) {
    return true;
  }
}

async function persistWelcomeDone(done: boolean) {
  try {
    await AsyncStorage.setItem(WELCOME_DONE_KEY, done ? 'true' : 'false');
  } catch (e) {
    console.error('[Store] 持久化welcome状态失败:', e);
  }
}

async function loadWelcomeDone(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(WELCOME_DONE_KEY);
    return value === null ? true : value === 'true';
  } catch (e) {
    return true;
  }
}

async function persistFeatureTips(tips: Record<string, boolean>) {
  try {
    await AsyncStorage.setItem(FEATURE_TIPS_KEY, JSON.stringify(tips));
  } catch (e) {
    console.error('[Store] 持久化功能提示状态失败:', e);
  }
}

async function loadFeatureTips(): Promise<Record<string, boolean>> {
  try {
    const value = await AsyncStorage.getItem(FEATURE_TIPS_KEY);
    return value ? JSON.parse(value) : {};
  } catch (e) {
    return {};
  }
}

interface AppStore {
  appState: AppState;
  isRecording: boolean;
  isPlaying: boolean;
  wakeWordDetected: boolean;
  lastWakeTime: number | null;
  memories: Memory[];
  messages: Message[];
  isLoading: boolean;
  nickname: string | null;
  sessionId: string | null;
  initialized: boolean;
  shiguangjianVisible: boolean;
  shiguangjianData: { query: string; results: VideoResult[] } | null;
  showChatText: boolean;
  onboardingCompleted: boolean;
  welcomeDone: boolean;
  featureTips: Record<string, boolean>;

  setAppState: (state: AppState) => void;
  setIsRecording: (recording: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setWakeWordDetected: (detected: boolean) => void;
  setNickname: (nickname: string | null) => void;
  setSessionId: (sessionId: string | null) => void;

  addMemory: (memory: Memory) => void;
  updateMemory: (id: number, updates: Partial<Memory>) => void;

  addMessage: (role: 'user' | 'assistant' | 'system' | 'recommend', content: string, extra?: Partial<Message>) => void;
  updateLastAssistantMessage: (appendContent: string) => void;
  finalizeLastAssistantMessage: (fullContent: string) => void;
  updateMessageWebSearch: (messageId: string, data: { query: string; results: WebSearchResult[] }) => void;
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;
  setMessages: (messages: Message[]) => void;
  startNewSession: () => void;

  showShiguangjian: (query: string, results: VideoResult[]) => void;
  dismissShiguangjian: () => void;
  setShowChatText: (show: boolean) => void;
  setOnboardingCompleted: () => void;
  setWelcomeDone: () => void;
  markFeatureTip: (tipId: string) => void;

  enterListeningState: () => void;
  enterSpeakingState: () => void;
  enterIdleState: () => void;
  resetSession: () => void;
  resetForNewUser: () => void;
  resetOnboardingForNewUser: () => void;

  initializeStore: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  appState: 'idle',
  isRecording: false,
  isPlaying: false,
  wakeWordDetected: false,
  lastWakeTime: null,
  memories: [],
  messages: [],
  isLoading: false,
  nickname: null,
  sessionId: null,
  initialized: false,
  shiguangjianVisible: false,
  shiguangjianData: null,
  showChatText: true,
  onboardingCompleted: true,
  welcomeDone: true,
  featureTips: {},

  setAppState: (state) => set({ appState: state }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setWakeWordDetected: (detected) => set({ wakeWordDetected: detected }),
  setNickname: (nickname) => set({ nickname }),

  setSessionId: (sessionId) => {
    set({ sessionId });
    persistSessionId(sessionId);
  },

  addMemory: (memory) => set((state) => ({
    memories: [...state.memories, memory]
  })),

  updateMemory: (id, updates) => set((state) => ({
    memories: state.memories.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    )
  })),

  addMessage: (role, content, extra) => {
    const newMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      role,
      content,
      timestamp: new Date(),
      sessionId: get().sessionId,
      ...extra,
    };
    set((state) => {
      const messages = [...state.messages, newMsg];
      persistMessages(messages);
      return { messages };
    });
  },

  updateLastAssistantMessage: (appendContent) => {
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], content: messages[i].content + appendContent };
          break;
        }
      }
      return { messages };
    });
  },

  finalizeLastAssistantMessage: (fullContent) => {
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], content: fullContent };
          break;
        }
      }
      persistMessages(messages);
      return { messages };
    });
  },

  updateMessageWebSearch: (messageId, data) => {
    set((state) => {
      const messages = state.messages.map((m) =>
        m.id === messageId ? { ...m, webSearchData: data } : m
      );
      persistMessages(messages);
      return { messages };
    });
  },

  deleteMessage: (messageId) => {
    set((state) => {
      const messages = state.messages.filter(m => m.id !== messageId);
      persistMessages(messages);
      return { messages };
    });
  },

  clearMessages: () => {
    set({ messages: [] });
    persistMessages([]);
  },

  setMessages: (messages) => {
    set({ messages });
    persistMessages(messages);
  },

  startNewSession: () => {
    const newSessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    set({ sessionId: newSessionId });
    persistSessionId(newSessionId);
  },

  showShiguangjian: (query, results) => set({
    shiguangjianVisible: true,
    shiguangjianData: { query, results },
  }),

  dismissShiguangjian: () => set({
    shiguangjianVisible: false,
    shiguangjianData: null,
  }),

  setShowChatText: (show) => {
    set({ showChatText: show });
    persistShowChatText(show);
  },

  setOnboardingCompleted: () => {
    set({ onboardingCompleted: true });
    persistOnboardingCompleted(true);
  },

  setWelcomeDone: () => {
    set({ welcomeDone: true });
    persistWelcomeDone(true);
  },

  markFeatureTip: (tipId) => {
    const updated = { ...get().featureTips, [tipId]: true };
    set({ featureTips: updated });
    persistFeatureTips(updated);
  },

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

  resetForNewUser: () => {
    set({
      messages: [],
      sessionId: null,
      initialized: false,
    });
    persistMessages([]);
    persistSessionId(null);
  },

  resetOnboardingForNewUser: () => {
    set({
      onboardingCompleted: false,
      welcomeDone: false,
      featureTips: {},
    });
    persistOnboardingCompleted(false);
    persistWelcomeDone(false);
    persistFeatureTips({});
  },

  initializeStore: async () => {
    if (get().initialized) return;
    const [showChatText, onboardingCompleted, welcomeDone, featureTips] = await Promise.all([
      loadShowChatText(),
      loadOnboardingCompleted(),
      loadWelcomeDone(),
      loadFeatureTips(),
    ]);
    set({
      messages: [],
      sessionId: null,
      showChatText,
      onboardingCompleted,
      welcomeDone,
      featureTips,
      initialized: true,
    });
    persistMessages([]);
    persistSessionId(null);
    console.log(`[Store] 初始化完成: 新对话, showChatText: ${showChatText}`);
  },
}));
