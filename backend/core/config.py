import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # 应用配置
    APP_NAME: str = "食光知己后端服务"
    DEBUG: bool = True
    
    # 数据库配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./shiguang.db"
    
    # JWT配置
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天
    
    # OpenAI配置
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-3.5-turbo"
    
    # TTS配置（角色语音固定）
    TTS_PROVIDER: str = "openai"  # openai, iflytek_ws, mimo
    TTS_MODEL: str = "tts-1"
    TTS_VOICE: str = "alloy"
    TTS_TIMEOUT_SECONDS: int = 20
    TTS_VOICE_DEFAULT: str = "aisjiuxu"
    TTS_CHARACTER_VOICE: str = "aisjiuxu"
    TTS_LANGUAGE_DEFAULT: str = "zh-CN"
    
    # 讯飞TTS配置
    IFLYTEK_TTS_API_URL: str = "wss://tts-api.xfyun.cn/v2/tts"
    IFLYTEK_TTS_APP_ID: str = ""
    IFLYTEK_TTS_API_KEY: str = ""
    IFLYTEK_TTS_API_SECRET: str = ""
    IFLYTEK_TTS_AUTH_TOKEN: str = ""
    
    # MiMo TTS配置 (mimo-v2.5-tts-voicedesign)
    MIMO_API_KEY: str = ""
    MIMO_BASE_URL: str = "https://api.xiaomimimo.com/v1"
    MIMO_TTS_MODEL: str = "mimo-v2.5-tts-voicedesign"
    MIMO_VOICE_DESIGN_PROMPT: str = "一位中年男性文人，嗓音醇厚温润，带着岁月沉淀的沧桑感。语速不疾不徐，娓娓道来，像一位饱读诗书的老友在餐桌旁与你闲聊。偶尔带着一丝豁达的笑意，声音中有文人的儒雅和智者的从容。半文半白的语言风格，温暖而不失风趣。"
    
    # TTS Cache配置
    TTS_CACHE_ENABLED: bool = True
    TTS_CACHE_TTL: int = 86400
    TTS_CACHE_MAX_ENTRIES: int = 500
    
    # TTS Streaming配置
    TTS_STREAMING_ENABLED: bool = True
    
    # TTS Health Check配置
    TTS_HEALTH_CHECK_INTERVAL: int = 300
    TTS_FALLBACK_ORDER: str = "mimo,iflytek_ws,openai"
    
    # TTS Audio Format配置
    TTS_AUDIO_FORMAT: str = "mp3"
    TTS_MP3_BITRATE: str = "128k"
    
    # Whisper配置
    WHISPER_MODEL: str = "base"  # tiny, base, small, medium, large
    
    # 食光鉴搜索配置
    BILIBILI_SEARCH_ENABLED: bool = True
    BILIBILI_SEARCH_CACHE_TTL: int = 300
    SEARCH_HTTP_PROXY: str = ""

    # 联网搜索配置 (Tavily)
    TAVILY_API_KEY: str = ""
    WEB_SEARCH_ENABLED: bool = True
    WEB_SEARCH_MAX_RESULTS: int = 3
    WEB_SEARCH_TIMEOUT: int = 10

    # 记忆系统配置
    MEMORY_DISTANCE_THRESHOLD: float = 1.2
    MEMORY_MIN_IMPORTANCE: int = 2
    MEMORY_PROMPT_CHAR_LIMIT: int = 500
    MEMORY_MAX_PER_USER: int = 100
    MEMORY_CLEANUP_INTERVAL: int = 86400
    
    # CORS 配置
    CORS_ORIGINS: str = "*"

    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()