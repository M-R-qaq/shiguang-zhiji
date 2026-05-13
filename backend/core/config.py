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
    
    # TTS配置
    TTS_PROVIDER: str = "openai"  # openai, iflytek_ws, iflytek_http
    TTS_MODEL: str = "tts-1"
    TTS_VOICE: str = "alloy"
    TTS_TIMEOUT_SECONDS: int = 20
    TTS_VOICE_DEFAULT: str = "aisjiuxu"
    TTS_LANGUAGE_DEFAULT: str = "zh-CN"
    
    # 讯飞TTS配置
    IFLYTEK_TTS_API_URL: str = "wss://tts-api.xfyun.cn/v2/tts"
    IFLYTEK_TTS_APP_ID: str = ""
    IFLYTEK_TTS_API_KEY: str = ""
    IFLYTEK_TTS_API_SECRET: str = ""
    IFLYTEK_TTS_AUTH_TOKEN: str = ""
    
    # Whisper配置
    WHISPER_MODEL: str = "base"  # tiny, base, small, medium, large
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()