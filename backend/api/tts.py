from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.config import settings
from core.security import get_current_user
from models.user import User
import base64
import hashlib
import hmac
import time
import json
from email.utils import formatdate
from urllib.parse import urlencode, urlparse
import asyncio
import websockets

router = APIRouter(prefix="/tts", tags=["语音合成"])

# TTS角色语音配置
TTS_CONFIG = {
    "aisjiuxu": {"name": "讯飞小旭", "description": "男声推荐"},
    "aisxping": {"name": "讯飞小萍", "description": "女声推荐"},
}


class TTSRequest(BaseModel):
    text: str
    voice: str = "aisjiuxu"
    speed: int = 50
    volume: int = 50
    pitch: int = 50


def build_iflytek_auth_url(api_url: str, api_key: str, api_secret: str) -> str:
    """构建讯飞鉴权URL (参考官方实现)"""
    parsed = urlparse(api_url.strip())
    scheme = parsed.scheme.lower()
    if scheme in {"http", "https"}:
        scheme = "wss" if scheme == "https" else "ws"
    elif scheme not in {"ws", "wss"}:
        scheme = "wss"
    
    host = parsed.netloc
    path = parsed.path or "/v2/tts"
    if not path.startswith("/"):
        path = f"/{path}"
    
    if not host:
        if "/" in path:
            host, path = path.split("/", 1)
            path = f"/{path}"
        else:
            raise ValueError(f"讯飞 TTS 地址无效: {api_url}")
    
    # 使用RFC1123格式GMT时间
    date = formatdate(timeval=None, localtime=False, usegmt=True)
    
    # 签名
    signature_origin = f"host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
    signature_sha = hmac.new(
        api_secret.encode("utf-8"), 
        signature_origin.encode("utf-8"), 
        digestmod=hashlib.sha256
    ).digest()
    signature = base64.b64encode(signature_sha).decode("utf-8")
    
    # Authorization (headers中不包含signature)
    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")
    
    query = urlencode({"authorization": authorization, "date": date, "host": host})
    return f"{scheme}://{host}{path}?{query}"


async def iflytek_tts_ws(text: str, voice: str = "aisjiuxu", speed: int = 50, volume: int = 50, pitch: int = 50) -> bytes:
    """讯飞WebSocket TTS"""
    
    if not all([settings.IFLYTEK_TTS_APP_ID, settings.IFLYTEK_TTS_API_KEY, settings.IFLYTEK_TTS_API_SECRET]):
        raise ValueError("讯飞TTS配置不完整，请检查APP_ID、API_KEY和API_SECRET")
    
    # 构建鉴权URL
    url = build_iflytek_auth_url(
        settings.IFLYTEK_TTS_API_URL,
        settings.IFLYTEK_TTS_API_KEY, 
        settings.IFLYTEK_TTS_API_SECRET
    )
    
    audio_chunks = bytearray()
    
    request_msg = {
        "common": {"app_id": settings.IFLYTEK_TTS_APP_ID},
        "business": {
            "aue": "lame",
            "auf": "audio/L16;rate=16000",
            "vcn": voice,
            "tte": "utf8",
            "speed": speed,
            "volume": volume,
            "pitch": pitch,
        },
        "data": {
            "status": 2,
            "text": base64.b64encode(text.encode("utf-8")).decode("utf-8"),
        },
    }
    
    try:
        async with websockets.connect(
            url,
            ping_interval=None,
            open_timeout=settings.TTS_TIMEOUT_SECONDS,
            close_timeout=settings.TTS_TIMEOUT_SECONDS,
        ) as websocket:
            await websocket.send(json.dumps(request_msg, ensure_ascii=False))
            
            while True:
                try:
                    raw_message = await asyncio.wait_for(
                        websocket.recv(), timeout=settings.TTS_TIMEOUT_SECONDS
                    )
                except asyncio.TimeoutError:
                    raise Exception("讯飞 TTS 请求超时")
                
                if isinstance(raw_message, bytes):
                    raw_message = raw_message.decode("utf-8", errors="ignore")
                
                try:
                    response = json.loads(raw_message)
                except json.JSONDecodeError:
                    raise Exception("讯飞 TTS 返回了无法解析的消息")
                
                code = response.get("code")
                if code not in (0, "0", None):
                    message = response.get("message") or response.get("desc") or "未知错误"
                    raise Exception(f"讯飞 TTS 返回错误: {message} (code={code})")
                
                data = response.get("data")
                if isinstance(data, dict):
                    audio_base64 = data.get("audio")
                    if isinstance(audio_base64, str) and audio_base64.strip():
                        audio_chunks.extend(base64.b64decode(audio_base64.strip()))
                    
                    if str(data.get("status")) == "2":
                        break
                else:
                    break
        
        if not audio_chunks:
            raise Exception("讯飞 TTS 未返回音频数据")
        
        return bytes(audio_chunks)
        
    except Exception as e:
        if "WebSocket" in str(e):
            raise Exception(f"WebSocket连接失败: {str(e)}")
        raise


async def openai_tts(text: str) -> bytes:
    """OpenAI TTS备用"""
    from openai import AsyncOpenAI
    
    if not settings.OPENAI_API_KEY:
        raise ValueError("OpenAI API Key 未配置")
    
    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL
    )
    
    response = await client.audio.speech.create(
        model=settings.TTS_MODEL,
        voice=settings.TTS_VOICE,
        input=text,
        response_format="mp3"
    )
    
    return response.content


@router.post("/synthesize")
async def synthesize_speech(
    request: TTSRequest,
    current_user: User = Depends(get_current_user)
):
    """文字转语音 API"""
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="文本不能为空")
    
    if len(request.text) > 5000:
        raise HTTPException(status_code=400, detail="文本长度不能超过5000字")
    
    try:
        if settings.TTS_PROVIDER == "iflytek_ws":
            audio_data = await iflytek_tts_ws(
                text=request.text,
                voice=request.voice,
                speed=request.speed,
                volume=request.volume,
                pitch=request.pitch
            )
        else:
            audio_data = await openai_tts(request.text)
        
        audio_base64 = base64.b64encode(audio_data).decode("utf-8")
        
        return {
            "audio": audio_base64,
            "format": "mp3",
            "provider": settings.TTS_PROVIDER,
            "voice": request.voice,
            "text_length": len(request.text)
        }
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音合成失败: {str(e)}")


@router.get("/voices")
async def get_available_voices():
    return TTS_CONFIG


@router.get("/config")
async def get_tts_config(current_user: User = Depends(get_current_user)):
    return {
        "provider": settings.TTS_PROVIDER,
        "voice": settings.TTS_VOICE,
        "voice_info": TTS_CONFIG.get(settings.TTS_VOICE, {}),
        "is_configured": bool(settings.IFLYTEK_TTS_APP_ID and settings.IFLYTEK_TTS_API_KEY),
        "app_id": settings.IFLYTEK_TTS_APP_ID[:4] + "****" if settings.IFLYTEK_TTS_APP_ID else None
    }