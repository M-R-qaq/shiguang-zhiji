from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
import whisper
import tempfile
import os
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


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    语音转文字 API
    
    接收音频文件，返回识别文本
    支持格式: mp3, wav, m4a, ogg, flac
    """
    # 验证文件类型
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/ogg", "audio/flac", "audio/x-flac"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file.content_type}，支持的格式: mp3, wav, m4a, ogg, flac"
        )
    
    # 创建临时文件
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name
    
    try:
        # 加载模型
        model = get_whisper_model()
        
        # 执行识别
        # 设置 initial_prompt 以改善中文识别
        result = model.transcribe(
            tmp_path,
            language="zh",
            initial_prompt="以下是普通话的对话。",
            fp16=False  # CPU上使用fp32
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
        raise HTTPException(
            status_code=500,
            detail=f"语音识别失败: {str(e)}"
        )
    finally:
        # 清理临时文件
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/transcribe-stream")
async def transcribe_stream(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    流式语音识别 API（用于实时对话）
    返回更简洁的结果
    """
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/ogg", "audio/flac"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
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