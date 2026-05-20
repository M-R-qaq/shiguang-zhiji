from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import whisper
import asyncio
import tempfile
import os
import base64
from core.database import get_db
from core.config import settings
from core.security import get_current_user
from models.user import User

router = APIRouter(prefix="/asr", tags=["语音识别"])

_model = None

NO_SPEECH_THRESHOLD = 0.6
MIN_AUDIO_DURATION = 1.0
COMPRESSION_RATIO_THRESHOLD = 2.4
LOGPROB_THRESHOLD = -1.0

INITIAL_PROMPT = "以下是普通话对话。关键词：美食 烹饪 菜系 日常 诗词 心情 镇江 扬州 苏州 南京 杭州 北京 上海 广州 成都 重庆 西安 武汉 长沙 厦门 青岛 大连 深圳 昆明 丽江 桂林 三亚 洛阳 开封 绍兴 泉州 漳州 九江 徐州 常州 无锡 南通 合肥 芜湖 温州 宁波 嘉兴 绍兴 金华 台州 福州 泉州 漳州 龙岩 赣州 吉安 宜春 上饶 抚州。地名与人名请准确识别。"


def get_whisper_model():
    global _model
    if _model is None:
        _model = whisper.load_model(settings.WHISPER_MODEL)
    return _model


def _filter_result(result: dict) -> str:
    segments = result.get("segments", [])
    if not segments:
        return result["text"].strip()

    total_duration = max(seg.get("end", 0) for seg in segments) if segments else 0
    if total_duration < MIN_AUDIO_DURATION:
        print(f"[ASR] 音频时长过短 ({total_duration:.1f}s)，忽略")
        return ""

    avg_logprob = result.get("avg_logprob", 0)
    compression_ratio = result.get("compression_ratio", 1.0)
    if compression_ratio > COMPRESSION_RATIO_THRESHOLD:
        print(f"[ASR] 压缩率过高 ({compression_ratio:.2f} > {COMPRESSION_RATIO_THRESHOLD})，疑似幻觉")
        return ""
    if avg_logprob < LOGPROB_THRESHOLD:
        print(f"[ASR] 平均对数概率过低 ({avg_logprob:.2f} < {LOGPROB_THRESHOLD})，疑似幻觉")
        return ""

    filtered_parts = []
    for seg in segments:
        no_speech_prob = seg.get("no_speech_prob", 0.0)
        if no_speech_prob > NO_SPEECH_THRESHOLD:
            print(f"[ASR] 过滤幻觉段: no_speech_prob={no_speech_prob:.2f}, text='{seg['text'][:50]}'")
            continue
        filtered_parts.append(seg["text"].strip())

    text = "".join(filtered_parts).strip()

    if not text:
        return ""

    character_patterns = [
        "知己安好", "一人独食", "倒也", "倒也清静", "不知今日",
        "诸位", "老夫", "汝", "吾", "余观", "尔",
        "今日见你", "我见你", "你那",
        "古人云", "东坡曾言", "东坡曰",
        "食光鉴中", "食光之镜",
    ]
    role_confused = any(p in text for p in character_patterns)
    if role_confused:
        print(f"[ASR] 检测到角色视角文本(疑似幻觉): '{text[:80]}'")
        return ""

    hallucination_patterns = [
        "字幕", "请不吝", "点赞", "订阅", "转发", "打赏", "感谢观看",
        "谢谢大家", "感谢收听", "本期节目", "下期再见", "关注我",
    ]
    if text and len(text) < 30:
        for pattern in hallucination_patterns:
            if pattern in text:
                print(f"[ASR] 过滤疑似幻觉文本: '{text}'")
                return ""

    return text


class TranscribeBase64Request(BaseModel):
    audio_base64: str
    format: str = "wav"


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
        result = await asyncio.to_thread(
            lambda: model.transcribe(
                tmp_path,
                language="zh",
                initial_prompt=INITIAL_PROMPT,
                temperature=0.0,
                compression_ratio_threshold=COMPRESSION_RATIO_THRESHOLD,
                logprob_threshold=LOGPROB_THRESHOLD,
                no_speech_threshold=NO_SPEECH_THRESHOLD,
                fp16=False
            )
        )

        filtered_text = _filter_result(result)

        return {
            "text": filtered_text,
            "language": result["language"],
            "segments": [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"],
                    "no_speech_prob": seg.get("no_speech_prob", 0.0),
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
            result = await asyncio.to_thread(
                lambda: model.transcribe(
                    tmp_path,
                    language="zh",
                    initial_prompt=INITIAL_PROMPT,
                    temperature=0.0,
                    compression_ratio_threshold=COMPRESSION_RATIO_THRESHOLD,
                    logprob_threshold=LOGPROB_THRESHOLD,
                    no_speech_threshold=NO_SPEECH_THRESHOLD,
                    fp16=False
                )
            )

            filtered_text = _filter_result(result)

            return {
                "text": filtered_text,
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
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/ogg", "audio/flac", "application/octet-stream"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or ".wav")[1]) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name

    try:
        model = get_whisper_model()
        result = await asyncio.to_thread(
            lambda: model.transcribe(
                tmp_path,
                language="zh",
                initial_prompt=INITIAL_PROMPT,
                temperature=0.0,
                compression_ratio_threshold=COMPRESSION_RATIO_THRESHOLD,
                logprob_threshold=LOGPROB_THRESHOLD,
                no_speech_threshold=NO_SPEECH_THRESHOLD,
                fp16=False
            )
        )

        filtered_text = _filter_result(result)

        return {
            "text": filtered_text,
            "language": result["language"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音识别失败: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
