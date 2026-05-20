import sys
import asyncio
from pathlib import Path
from datetime import datetime, timedelta

# 添加 backend 目录到 Python 路径
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from core.database import init_db, AsyncSessionLocal
from core.config import settings
from core.vector_db import vector_db
from core.memory_extractor import memory_extractor
from models.user import User, Memory, TokenBlacklist
from api import auth, asr, llm, tts, memory, wakeword, search


async def cleanup_token_blacklist():
    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import delete
            now = datetime.now()
            result = await db.execute(
                delete(TokenBlacklist).where(TokenBlacklist.expires_at < now)
            )
            await db.commit()
            if result.rowcount and result.rowcount > 0:
                print(f"[TokenCleanup] 清理了 {result.rowcount} 条过期Token")
    except Exception as e:
        print(f"[TokenCleanup] 清理失败: {e}")


# 主动关怀任务
async def care_task():
    """
    后台任务：主动关怀 + 记忆生命周期清理
    """
    print("✅ 主动关怀任务已启动")
    
    cleanup_counter = 0
    token_cleanup_counter = 0
    
    while True:
        try:
            await asyncio.sleep(3600)
            cleanup_counter += 1
            token_cleanup_counter += 1

            if token_cleanup_counter >= 1:
                token_cleanup_counter = 0
                await cleanup_token_blacklist()
            
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(User).where(User.is_active == True)
                )
                users = result.scalars().all()
                
                for user in users:
                    mem_result = await db.execute(
                        select(Memory)
                        .where(Memory.user_id == user.id, Memory.is_active == True)
                        .order_by(Memory.created_at.desc())
                        .limit(1)
                    )
                    recent_memory = mem_result.scalar_one_or_none()
                    
                    if recent_memory and recent_memory.created_at:
                        time_diff = datetime.now() - recent_memory.created_at.replace(tzinfo=None)
                        
                        if time_diff < timedelta(hours=24):
                            memories = vector_db.get_user_memories(
                                user_id=user.id,
                                limit=10
                            )
                            
                            if memories:
                                memories_data = [
                                    {
                                        "content": m["content"],
                                        "category": m["metadata"].get("category", "general"),
                                        "importance": m["metadata"].get("importance", 3)
                                    }
                                    for m in memories
                                ]
                                
                                care_result = await memory_extractor.should_care(
                                    memories=memories_data,
                                    user_id=user.id,
                                    db=db
                                )
                                
                                if care_result:
                                    print(f"[Care Task] 用户 {user.username} 需要关怀: {care_result.get('care_topic')}, 下次对话时将注入关怀")

                if cleanup_counter >= (settings.MEMORY_CLEANUP_INTERVAL // 3600):
                    cleanup_counter = 0
                    print("[MemoryLifecycle] 开始定期记忆清理...")
                    for user in users:
                        try:
                            await memory_extractor.cleanup_user_memories(user.id, db)
                        except Exception as e:
                            print(f"[MemoryLifecycle] 用户{user.id}清理失败: {e}")
                
                await db.commit()
                
        except Exception as e:
            print(f"[Care Task] 错误: {e}")
            await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    if settings.SECRET_KEY == "your-secret-key-change-in-production":
        print("⚠️ [安全警告] SECRET_KEY 为默认值，请在生产环境中修改！")
        print("⚠️ 可通过在Python中运行以下命令生成随机密钥：")
        print("   import secrets; print(secrets.token_hex(32))")

    await init_db()
    print("✅ 数据库初始化完成")

    from core.tts_cache import tts_cache
    await tts_cache.initialize()
    print("✅ TTS 缓存初始化完成")

    from core.tts_provider_manager import tts_provider_manager
    await tts_provider_manager.start_health_check()
    print("✅ TTS 健康检测已启动")

    try:
        from api.tts import _get_openai_tts_client
        from openai import AsyncOpenAI
        _get_openai_tts_client(AsyncOpenAI)
        print("✅ OpenAI TTS 客户端预热完成")
    except Exception as e:
        print(f"⚠️ OpenAI TTS 客户端预热失败: {e}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _preload_whisper)

    care_task_instance = asyncio.create_task(care_task())
    
    yield
    
    care_task_instance.cancel()
    try:
        await care_task_instance
    except asyncio.CancelledError:
        pass

    await tts_provider_manager.stop_health_check()

    await tts_cache.close()
    print("👋 应用关闭")


def _preload_whisper():
    try:
        from api.asr import get_whisper_model
        print("⏳ 预加载 Whisper 模型...")
        model = get_whisper_model()
        print(f"✅ Whisper 模型预加载完成 ({settings.WHISPER_MODEL})")
    except Exception as e:
        print(f"⚠️ Whisper 模型预加载失败: {e}")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    description="食光知己后端服务 - 跨越千年的知己相逢",
    version="0.6.0",
    lifespan=lifespan
)

# 配置 CORS
origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"]
allow_credentials = origins != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(asr.router)
app.include_router(llm.router)
app.include_router(tts.router)
app.include_router(memory.router)
app.include_router(wakeword.router)
app.include_router(search.router)


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": settings.APP_NAME,
        "version": "0.6.0",
        "status": "running",
        "features": ["语音对话", "记忆系统", "向量检索", "主动关怀", "唤醒词检测", "食光鉴搜索", "对话历史持久化", "流式对话", "会话管理", "联网搜索", "智能标题"],
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": "0.6.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
