from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.config import settings
from core.security import get_current_user
from core.tts_cache import tts_cache
from core.audio_converter import convert_to_target_format
from core.tts_provider_manager import tts_provider_manager
from fastapi.responses import StreamingResponse
from models.user import User
import base64
import hashlib
import hmac
import re
import time
import json
from email.utils import formatdate
from urllib.parse import urlencode, urlparse
import asyncio
import websockets

router = APIRouter(prefix="/tts", tags=["语音合成"])

TTS_CHARACTER_VOICE = "aisjiuxu"

TTS_CONFIG = {
    "aisjiuxu": {"name": "苏怀真", "description": "角色固定语音"},
}


class TTSRequest(BaseModel):
    text: str
    voice: str = TTS_CHARACTER_VOICE
    speed: int = 50
    volume: int = 50
    pitch: int = 50

    @field_validator("text")
    @classmethod
    def validate_text(cls, v):
        if not v or not v.strip():
            raise ValueError("文本不能为空")
        if len(v) > 5000:
            raise ValueError("文本长度不能超过5000字")
        return v

    @field_validator("speed", "volume", "pitch")
    @classmethod
    def validate_range(cls, v):
        return max(0, min(100, v))


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


_openai_tts_client = None


def _get_openai_tts_client(AsyncOpenAI):
    global _openai_tts_client
    if _openai_tts_client is None:
        _openai_tts_client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL
        )
    return _openai_tts_client


async def openai_tts(text: str, speed: float = 1.0) -> bytes:
    from openai import AsyncOpenAI

    if not settings.OPENAI_API_KEY:
        raise ValueError("OpenAI API Key 未配置")

    client = _get_openai_tts_client(AsyncOpenAI)
    
    response = await client.audio.speech.create(
        model=settings.TTS_MODEL,
        voice=settings.TTS_VOICE,
        input=text,
        response_format="mp3",
        speed=speed,
    )
    
    return response.content


async def mimo_tts(text: str) -> bytes:
    """MiMo TTS (mimo-v2.5-tts-voicedesign) - 通过音色描述定制苏怀真声音"""
    import httpx

    if not settings.MIMO_API_KEY:
        raise ValueError("MiMo API Key 未配置，请在 .env 中设置 MIMO_API_KEY")

    voice_prompt = settings.MIMO_VOICE_DESIGN_PROMPT

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.MIMO_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.MIMO_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.MIMO_TTS_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": voice_prompt,
                    },
                    {
                        "role": "assistant",
                        "content": text,
                    },
                ],
                "audio": {
                    "format": "wav",
                    "optimize_text_preview": False,
                },
            },
        )

        if response.status_code != 200:
            raise Exception(f"MiMo TTS API 错误: HTTP {response.status_code} - {response.text[:200]}")

        data = response.json()

        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        audio_info = message.get("audio")

        if not audio_info or not audio_info.get("data"):
            raise Exception(f"MiMo TTS 未返回音频数据: {json.dumps(data, ensure_ascii=False)[:200]}")

        audio_base64 = audio_info["data"]
        audio_bytes = base64.b64decode(audio_base64)

        if not audio_bytes:
            raise Exception("MiMo TTS 音频数据为空")

        return audio_bytes


async def mimo_tts_stream(text: str):
    import httpx
    from openai import OpenAI

    if not settings.MIMO_API_KEY:
        raise ValueError("MiMo API Key 未配置")

    client = OpenAI(
        api_key=settings.MIMO_API_KEY,
        base_url=settings.MIMO_BASE_URL,
    )

    voice_prompt = settings.MIMO_VOICE_DESIGN_PROMPT

    collected_pcm = bytearray()

    try:
        completion = client.chat.completions.create(
            model=settings.MIMO_TTS_MODEL,
            messages=[
                {"role": "user", "content": voice_prompt},
                {"role": "assistant", "content": text},
            ],
            audio={
                "format": "pcm16",
                "optimize_text_preview": False,
            },
            stream=True,
        )

        for chunk in completion:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            audio = getattr(delta, "audio", None)
            if audio is not None and isinstance(audio, dict):
                pcm_data = audio.get("data")
                if pcm_data:
                    pcm_bytes = base64.b64decode(pcm_data)
                    collected_pcm.extend(pcm_bytes)

        if not collected_pcm:
            raise Exception("MiMo TTS 流式未返回音频数据")

        import numpy as np
        import tempfile
        import soundfile as sf

        np_pcm = np.frombuffer(bytes(collected_pcm), dtype=np.int16).astype(np.float32) / 32768.0

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf.write(tmp.name, np_pcm, 24000)
            tmp_wav_path = tmp.name

        from core.audio_converter import convert_wav_to_mp3
        mp3_bytes = convert_wav_to_mp3(open(tmp_wav_path, "rb").read(), settings.TTS_MP3_BITRATE)

        import os
        os.unlink(tmp_wav_path)

        return mp3_bytes if mp3_bytes else bytes(collected_pcm)

    except Exception as e:
        if "stream" in str(e).lower() and "not" in str(e).lower():
            return await mimo_tts(text)
        raise


_TTS_CLEAN_PATTERNS = [
    re.compile(r'（[^）]*）'),
    re.compile(r'\([^)]*\)'),
    re.compile(r'【食光鉴[|｜][^】]*】'),
    re.compile(r'【[^】]*】'),
]

def _clean_tts_text(text: str) -> str:
    for pattern in _TTS_CLEAN_PATTERNS:
        text = pattern.sub('', text)
    return text.strip()


@router.post("/synthesize")
async def synthesize_speech(
    request: TTSRequest,
    current_user: User = Depends(get_current_user)
):
    """文字转语音 API"""
    text = _clean_tts_text(request.text)
    if not text:
        raise HTTPException(status_code=400, detail="清理后文本为空")
    if len(text) > 1000:
        import re as _re
        sentences = _re.split(r'([。！？；\n])', text)
        chunks = []
        current = ""
        for i, s in enumerate(sentences):
            if len(current) + len(s) > 1000 and current:
                chunks.append(current)
                current = s
            else:
                current += s
        if current:
            chunks.append(current)
        if not chunks:
            chunks = [text[:1000]]
        text = chunks[0]
        if len(chunks) > 1:
            print(f"[TTS] 长文本({len(request.text)}字)分段合成，当前段: {len(text)}字，共{len(chunks)}段")
    
    try:
        voice = TTS_CHARACTER_VOICE
        cached_flag = False

        cached = await tts_cache.get(text, settings.TTS_PROVIDER, voice)
        if cached is not None:
            audio_data = cached["audio_bytes"]
            audio_format = cached["format"]
            cached_flag = True
        else:
            provider = tts_provider_manager.get_active_provider()
            providers_to_try = [provider]
            for p in settings.TTS_FALLBACK_ORDER.split(","):
                if p != provider:
                    providers_to_try.append(p)

            last_error = None
            for try_provider in providers_to_try:
                for attempt in range(2):
                    try:
                        if try_provider == "iflytek_ws":
                            audio_data = await iflytek_tts_ws(
                                text=text, voice=voice,
                                speed=request.speed, volume=request.volume, pitch=request.pitch
                            )
                        elif try_provider == "mimo":
                            audio_data = await mimo_tts(text)
                        else:
                            openai_speed = max(0.25, min(4.0, request.speed / 50.0))
                            audio_data = await openai_tts(text, speed=openai_speed)

                        tts_provider_manager.mark_success(try_provider, 0)
                        break
                    except Exception as e:
                        last_error = e
                        if attempt == 0:
                            continue
                        tts_provider_manager.mark_failure(try_provider)
                        break
                else:
                    continue
                break
            else:
                raise last_error or Exception("所有TTS提供商均失败")

            if try_provider == "mimo":
                audio_data, audio_format = convert_to_target_format(audio_data, "wav", settings.TTS_AUDIO_FORMAT, settings.TTS_MP3_BITRATE)
            elif try_provider == "iflytek_ws":
                audio_data, audio_format = convert_to_target_format(audio_data, "mp3", settings.TTS_AUDIO_FORMAT, settings.TTS_MP3_BITRATE)
            else:
                audio_data, audio_format = convert_to_target_format(audio_data, "mp3", settings.TTS_AUDIO_FORMAT, settings.TTS_MP3_BITRATE)

            await tts_cache.put(text, try_provider, voice, audio_data, audio_format)

        audio_base64 = base64.b64encode(audio_data).decode("utf-8")
        
        return {
            "audio": audio_base64,
            "format": audio_format,
            "provider": settings.TTS_PROVIDER,
            "voice": voice,
            "text_length": len(text),
            "original_length": len(request.text),
            "truncated": len(request.text) > 1000,
            "cached": cached_flag,
            "cache_control": {"ttl": settings.TTS_CACHE_TTL}
        }
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音合成失败: {str(e)}")


@router.post("/synthesize_stream")
async def synthesize_speech_stream(
    request: TTSRequest,
    current_user: User = Depends(get_current_user)
):
    if not settings.TTS_STREAMING_ENABLED:
        return await synthesize_speech(request, current_user)

    return StreamingResponse(
        _generate_sse_stream(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _generate_sse_stream(request: TTSRequest):
    import json as _json

    text = _clean_tts_text(request.text)
    if not text:
        return
    if len(text) > 1000:
        import re as _re
        sentences = _re.split(r'([。！？；\n])', text)
        chunks = []
        current = ""
        for i, s in enumerate(sentences):
            if len(current) + len(s) > 1000 and current:
                chunks.append(current)
                current = s
            else:
                current += s
        if current:
            chunks.append(current)
        if not chunks:
            chunks = [text[:1000]]
        text = chunks[0]

    voice = TTS_CHARACTER_VOICE
    provider = tts_provider_manager.get_active_provider()

    cached = await tts_cache.get(text, provider, voice)
    if cached is not None:
        audio_base64 = base64.b64encode(cached["audio_bytes"]).decode("utf-8")
        yield f"data: {_json.dumps({'type': 'audio_chunk', 'data': audio_base64, 'index': 0})}\n\n"
        yield f"data: {_json.dumps({'type': 'audio_done', 'total_chunks': 1, 'format': cached['format'], 'cached': True})}\n\n"
        return

    if provider == "iflytek_ws":
        async for event in _iflytek_stream(text, voice, request):
            yield event
    elif provider == "mimo":
        async for event in _mimo_stream(text):
            yield event
    else:
        async for event in _openai_stream(text, request):
            yield event


async def _iflytek_stream(text: str, voice: str, request: TTSRequest):
    import json as _json

    url = build_iflytek_auth_url(
        settings.IFLYTEK_TTS_API_URL,
        settings.IFLYTEK_TTS_API_KEY,
        settings.IFLYTEK_TTS_API_SECRET
    )

    request_msg = {
        "common": {"app_id": settings.IFLYTEK_TTS_APP_ID},
        "business": {
            "aue": "raw",
            "auf": "audio/L16;rate=16000",
            "vcn": voice,
            "tte": "utf8",
            "speed": request.speed,
            "volume": request.volume,
            "pitch": request.pitch,
        },
        "data": {
            "status": 2,
            "text": base64.b64encode(text.encode("utf-8")).decode("utf-8"),
        },
    }

    chunk_index = 0
    all_audio = bytearray()

    try:
        async with websockets.connect(
            url, ping_interval=None,
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
                    break

                if isinstance(raw_message, bytes):
                    raw_message = raw_message.decode("utf-8", errors="ignore")

                try:
                    response = json.loads(raw_message)
                except json.JSONDecodeError:
                    break

                code = response.get("code")
                if code not in (0, "0", None):
                    break

                data = response.get("data")
                if isinstance(data, dict):
                    audio_base64_chunk = data.get("audio")
                    if isinstance(audio_base64_chunk, str) and audio_base64_chunk.strip():
                        chunk_audio = base64.b64decode(audio_base64_chunk.strip())
                        all_audio.extend(chunk_audio)

                        chunk_b64 = base64.b64encode(chunk_audio).decode("utf-8")
                        yield f"data: {_json.dumps({'type': 'audio_chunk', 'data': chunk_b64, 'index': chunk_index})}\n\n"
                        chunk_index += 1

                    if str(data.get("status")) == "2":
                        break
                else:
                    break

        if all_audio:
            audio_data, audio_format = convert_to_target_format(bytes(all_audio), "wav", settings.TTS_AUDIO_FORMAT, settings.TTS_MP3_BITRATE)
            await tts_cache.put(text, "iflytek_ws", voice, audio_data, audio_format)

        yield f"data: {_json.dumps({'type': 'audio_done', 'total_chunks': chunk_index, 'format': settings.TTS_AUDIO_FORMAT, 'cached': False})}\n\n"

    except Exception as e:
        yield f"data: {_json.dumps({'type': 'error', 'error': str(e)})}\n\n"


async def _mimo_stream(text: str):
    import json as _json
    import httpx

    audio_data = await mimo_tts_stream(text)
    audio_data, audio_format = convert_to_target_format(audio_data, "wav", settings.TTS_AUDIO_FORMAT, settings.TTS_MP3_BITRATE)

    await tts_cache.put(text, "mimo", TTS_CHARACTER_VOICE, audio_data, audio_format)

    chunk_size = len(audio_data) // 3 + 1
    for i in range(0, len(audio_data), chunk_size):
        chunk = audio_data[i:i + chunk_size]
        chunk_b64 = base64.b64encode(chunk).decode("utf-8")
        yield f"data: {_json.dumps({'type': 'audio_chunk', 'data': chunk_b64, 'index': i // chunk_size})}\n\n"

    yield f"data: {_json.dumps({'type': 'audio_done', 'total_chunks': (len(audio_data) + chunk_size - 1) // chunk_size, 'format': audio_format, 'cached': False})}\n\n"


async def _openai_stream(text: str, request: TTSRequest):
    import json as _json

    openai_speed = max(0.25, min(4.0, request.speed / 50.0))
    audio_data = await openai_tts(text, speed=openai_speed)
    audio_data, audio_format = convert_to_target_format(audio_data, "mp3", settings.TTS_AUDIO_FORMAT, settings.TTS_MP3_BITRATE)

    await tts_cache.put(text, "openai", TTS_CHARACTER_VOICE, audio_data, audio_format)

    chunk_size = len(audio_data) // 3 + 1
    for i in range(0, len(audio_data), chunk_size):
        chunk = audio_data[i:i + chunk_size]
        chunk_b64 = base64.b64encode(chunk).decode("utf-8")
        yield f"data: {_json.dumps({'type': 'audio_chunk', 'data': chunk_b64, 'index': i // chunk_size})}\n\n"

    yield f"data: {_json.dumps({'type': 'audio_done', 'total_chunks': (len(audio_data) + chunk_size - 1) // chunk_size, 'format': audio_format, 'cached': False})}\n\n"


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


@router.get("/status")
async def get_tts_status(current_user: User = Depends(get_current_user)):
    return tts_provider_manager.get_status()