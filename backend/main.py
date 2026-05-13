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
from models.user import User, Memory
from api import auth, asr, llm, tts, memory, wakeword


# 主动关怀任务
async def care_task():
    """
    后台主动关怀任务
    定期检查用户是否需要关怀
    """
    print("✅ 主动关怀任务已启动")
    
    while True:
        try:
            # 每小时检查一次
            await asyncio.sleep(3600)
            
            async with AsyncSessionLocal() as db:
                # 获取所有活跃用户
                result = await db.execute(
                    select(User).where(User.is_active == True)
                )
                users = result.scalars().all()
                
                for user in users:
                    # 检查用户最近是否有记忆更新
                    mem_result = await db.execute(
                        select(Memory)
                        .where(Memory.user_id == user.id)
                        .order_by(Memory.created_at.desc())
                        .limit(1)
                    )
                    recent_memory = mem_result.scalar_one_or_none()
                    
                    # 如果最近24小时内有新记忆，则检查是否需要关怀
                    if recent_memory and recent_memory.created_at:
                        time_diff = datetime.now() - recent_memory.created_at.replace(tzinfo=None)
                        
                        if time_diff < timedelta(hours=24):
                            # 获取用户记忆
                            memories = vector_db.get_user_memories(
                                user_id=user.id,
                                limit=10
                            )
                            
                            if memories:
                                # 转换格式
                                memories_data = [
                                    {
                                        "content": m["content"],
                                        "category": m["metadata"].get("category", "general"),
                                        "importance": m["metadata"].get("importance", 3)
                                    }
                                    for m in memories
                                ]
                                
                                # 判断是否需要关怀
                                care_result = await memory_extractor.should_care(
                                    memories=memories_data,
                                    user_id=user.id
                                )
                                
                                if care_result:
                                    print(f"[Care Task] 用户 {user.username} 需要关怀: {care_result.get('care_topic')}")
                                    # 这里可以实现推送关怀消息的逻辑
                                    # 比如将关怀建议保存到数据库，供移动端拉取
                                    
                                    # 标记为已关怀
                                    for m in memories:
                                        memory_id = m["id"].replace("memory_", "")
                                        try:
                                            mem_result = await db.execute(
                                                select(Memory).where(Memory.id == int(memory_id))
                                            )
                                            db_memory = mem_result.scalar_one_or_none()
                                            if db_memory:
                                                db_memory.is_cared = True
                                                db_memory.cared_at = func.now()
                                                await db.commit()
                                        except:
                                            pass
                
                await db.commit()
                
        except Exception as e:
            print(f"[Care Task] 错误: {e}")
            await asyncio.sleep(60)  # 出错后等待1分钟重试


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    await init_db()
    print("✅ 数据库初始化完成")
    
    # 启动主动关怀后台任务
    care_task_instance = asyncio.create_task(care_task())
    
    yield
    
    # 关闭时清理资源
    care_task_instance.cancel()
    try:
        await care_task_instance
    except asyncio.CancelledError:
        pass
    print("👋 应用关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    description="食光知己后端服务 - 跨越千年的知己相逢",
    version="1.1.0",  # 版本升级
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
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


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": settings.APP_NAME,
        "version": "1.1.0",
        "status": "running",
        "features": ["语音对话", "记忆系统", "向量检索", "主动关怀", "唤醒词检测"],
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": "1.1.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
