from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import get_current_user
from models.user import User


router = APIRouter(prefix="/wakeword", tags=["唤醒词检测"])

DEFAULT_WAKE_WORD_NAME = "知己"


class WakeWordNameUpdate(BaseModel):
    wake_word_name: str

    @field_validator("wake_word_name")
    @classmethod
    def validate_wake_word_name(cls, v):
        if v == "string":
            raise ValueError("请输入实际的唤醒词名称")
        v = v.strip()
        if len(v) < 2 or len(v) > 5:
            raise ValueError("唤醒词名称必须在2-5个字之间")
        return v


class WakeWordConfigResponse(BaseModel):
    wake_word: str
    wake_word_name: str
    sample_rate: int
    channels: int
    sample_width: int
    recommended_frame_duration: int


@router.get("/config", response_model=WakeWordConfigResponse)
async def get_wakeword_config(
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户的唤醒词配置

    唤醒词格式为 "你好，{wake_word_name}"，默认为 "你好，知己"

    前端应在本地实现唤醒词检测，推荐方案：
    - Porcupine (Picovoice): 准确率高，体积小，支持自定义唤醒词
    - OpenWakeWord: 开源免费，支持自定义模型训练
    - sherpa-onnx: ONNX推理，支持多平台

    前端实现流程：
    1. 调用此接口获取用户自定义唤醒词
    2. 用唤醒词文本生成本地检测模型或注册关键词
    3. 后台持续监听麦克风，检测到唤醒词后进入聆听状态
    """
    wake_word_name = current_user.wake_word_name or DEFAULT_WAKE_WORD_NAME

    return WakeWordConfigResponse(
        wake_word=f"你好，{wake_word_name}",
        wake_word_name=wake_word_name,
        sample_rate=16000,
        channels=1,
        sample_width=2,
        recommended_frame_duration=20
    )


@router.put("/name")
async def update_wake_word_name(
    request: WakeWordNameUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    更新自定义唤醒词名称

    唤醒词格式为 "你好，{name}"，此接口设置 name 部分
    name 限定2-5个字，默认为 "知己"

    更新后前端应重新加载唤醒词配置并刷新本地检测模型
    """
    try:
        result = await db.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        user.wake_word_name = request.wake_word_name
        await db.commit()

        wake_word = f"你好，{request.wake_word_name}"

        return {
            "message": "唤醒词更新成功",
            "wake_word": wake_word,
            "wake_word_name": request.wake_word_name
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"唤醒词更新失败: {str(e)}")


@router.post("/reset")
async def reset_wake_word_name(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    重置唤醒词为默认值 "知己"
    """
    try:
        result = await db.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        user.wake_word_name = DEFAULT_WAKE_WORD_NAME
        await db.commit()

        return {
            "message": "唤醒词已重置",
            "wake_word": f"你好，{DEFAULT_WAKE_WORD_NAME}",
            "wake_word_name": DEFAULT_WAKE_WORD_NAME
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"唤醒词重置失败: {str(e)}")
