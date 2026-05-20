import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const CACHE_DIR = FileSystem.cacheDirectory + 'tts_cache/';
const MAX_CACHE_SIZE = 50 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 100;
const DEFAULT_TTL = 2 * 60 * 60 * 1000;

interface CacheEntry {
  path: string;
  timestamp: number;
  size: number;
}

class TTSClientCache {
  private index: Map<string, CacheEntry> = new Map();
  private totalSize: number = 0;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }

      await this._loadIndex();
      this.initialized = true;
    } catch (error) {
      console.error('[TTS Cache] 初始化失败:', error);
    }
  }

  private async _loadIndex(): Promise<void> {
    try {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      this.totalSize = 0;

      for (const file of files) {
        if (file === 'index.json') continue;
        const path = CACHE_DIR + file;
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists && !info.isDirectory) {
          const key = file.replace(/\.[^.]+$/, '');
          this.index.set(key, {
            path,
            timestamp: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
            size: info.size || 0,
          });
          this.totalSize += info.size || 0;
        }
      }
    } catch (error) {
      console.error('[TTS Cache] 加载索引失败:', error);
    }
  }

  private async _saveIndex(): Promise<void> {
    try {
      const data: Record<string, CacheEntry> = {};
      this.index.forEach((entry, key) => {
        data[key] = entry;
      });
      await FileSystem.writeAsStringAsync(
        CACHE_DIR + 'index.json',
        JSON.stringify(data),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      console.error('[TTS Cache] 保存索引失败:', error);
    }
  }

  private _computeKey(text: string, provider: string): string {
    let hash = 0;
    const str = text + provider;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(12, '0').substring(0, 12);
  }

  async get(text: string, provider: string): Promise<string | null> {
    if (!this.initialized) await this.initialize();

    const key = this._computeKey(text, provider);
    const entry = this.index.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > DEFAULT_TTL) {
      await this.delete(key);
      return null;
    }

    const info = await FileSystem.getInfoAsync(entry.path);
    if (!info.exists) {
      this.index.delete(key);
      this.totalSize -= entry.size;
      return null;
    }

    entry.timestamp = Date.now();
    return entry.path;
  }

  async put(text: string, provider: string, audioBase64: string, format: string = 'mp3'): Promise<string> {
    if (!this.initialized) await this.initialize();

    const key = this._computeKey(text, provider);
    const path = CACHE_DIR + key + '.' + format;

    await FileSystem.writeAsStringAsync(path, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const info = await FileSystem.getInfoAsync(path);
    const size = info.exists && !info.isDirectory ? (info.size || 0) : 0;

    if (this.index.has(key)) {
      this.totalSize -= this.index.get(key)!.size;
    }

    this.index.set(key, { path, timestamp: Date.now(), size });
    this.totalSize += size;

    await this._evictIfNeeded();

    return path;
  }

  private async delete(key: string): Promise<void> {
    const entry = this.index.get(key);
    if (entry) {
      await FileSystem.deleteAsync(entry.path, { idempotent: true }).catch(() => {});
      this.totalSize -= entry.size;
      this.index.delete(key);
    }
  }

  private async _evictIfNeeded(): Promise<void> {
    if (this.totalSize <= MAX_CACHE_SIZE && this.index.size <= MAX_CACHE_ENTRIES) return;

    const entries = Array.from(this.index.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);

    while ((this.totalSize > MAX_CACHE_SIZE || this.index.size > MAX_CACHE_ENTRIES) && entries.length > 0) {
      const [key, entry] = entries.shift()!;
      await this.delete(key);
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      for (const file of files) {
        await FileSystem.deleteAsync(CACHE_DIR + file, { idempotent: true }).catch(() => {});
      }
      this.index.clear();
      this.totalSize = 0;
    } catch (error) {
      console.error('[TTS Cache] 清理失败:', error);
    }
  }

  getSize(): number {
    return this.totalSize;
  }

  getCount(): number {
    return this.index.size;
  }
}

export const ttsClientCache = new TTSClientCache();
export default ttsClientCache;
