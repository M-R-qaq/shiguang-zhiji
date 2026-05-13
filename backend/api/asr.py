from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import whisper
import tempfile
import os
import base64
from core.database import get_db
from core.config import settings
from core.security import get_current_user
from models.user import User

router = APIRouter(prefix="/asr", tags=["语音识别"])


# 全局 Whisper 模型实例（延迟加载）
_model = None


def get_whisper_model():
    """获取或加载 Whisper 模型"""
    global _model
    if _model is None:
        _model = whisper.load_model(settings.WHISPER_MODEL)
    return _model


class TranscribeBase64Request(BaseModel):
    audio_base64: str
    format: str = "wav"


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """语音转文字 API - 文件上传"""
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/ogg", "audio/flac", "audio/x-flac", "application/octet-stream"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file.content_type}，支持的格式: mp3, wav, m4a, ogg, flac"
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or ".wav")[1]) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name

    try:
        model = get_whisper_model()
        result = model.transcribe(
            tmp_path,
            language="zh",
            initial_prompt="以下是普通话的对话。",
            fp16=False
        )

        return {
            "text": result["text"].strip(),
            "language": result["language"],
            "segments": [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"]
                }
                for seg in result.get("segments", [])
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音识别失败: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/transcribe-base64", response_model=dict)
async def transcribe_audio_base64(
    request: TranscribeBase64Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    语音转文字 API - Base64 编码

    适用于无法使用文件上传的场景（如某些移动端 HTTP 限制）
    直接在 JSON body 中发送 base64 编码的音频数据
    """
    try:
        audio_data = base64.b64decode(request.audio_base64)

        suffix_map = {
            "wav": ".wav",
            "mp3": ".mp3",
            "m4a": ".m4a",
            "ogg": ".ogg",
        }
        suffix = suffix_map.get(request.format, ".wav")

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_file.write(audio_data)
            tmp_path = tmp_file.name

        try:
            model = get_whisper_model()
            result = model.transcribe(
                tmp_path,
                language="zh",
                initial_prompt="以下是普通话的对话。",
                fp16=False
            )

            return {
                "text": result["text"].strip(),
                "language": result["language"],
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"语音识别失败: {str(e)}")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Base64 解码失败: {str(e)}")


@router.post("/transcribe-stream")
async def transcribe_stream(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """流式语音识别 API（用于实时对话）"""
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/ogg", "audio/flac", "application/octet-stream"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or ".wav")[1]) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name

    try:
        model = get_whisper_model()
        result = model.transcribe(tmp_path, language="zh", fp16=False)

        return {
            "text": result["text"].strip(),
            "language": result["language"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音识别失败: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
