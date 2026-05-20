from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from core.config import settings
from models.user import Base

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        try:
            result = await conn.execute(text("PRAGMA table_info(memories)"))
            columns = [row[1] for row in result.fetchall()]

            if 'importance' not in columns:
                await conn.execute(text("ALTER TABLE memories ADD COLUMN importance INTEGER DEFAULT 3"))
                print("[DB] 已添加 importance 列到 memories 表")

            if 'is_active' not in columns:
                await conn.execute(text("ALTER TABLE memories ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                print("[DB] 已添加 is_active 列到 memories 表")
        except Exception as e:
            print(f"[DB] 数据库迁移检查失败(可忽略): {e}")

        try:
            result = await conn.execute(text("PRAGMA table_info(conversations)"))
            columns = [row[1] for row in result.fetchall()]

            if 'session_id' not in columns:
                await conn.execute(text("ALTER TABLE conversations ADD COLUMN session_id VARCHAR(50)"))
                print("[DB] 已添加 session_id 列到 conversations 表")

            if 'metadata' not in columns:
                await conn.execute(text("ALTER TABLE conversations ADD COLUMN metadata JSON"))
                print("[DB] 已添加 metadata 列到 conversations 表")

            if 'session_title' not in columns:
                await conn.execute(text("ALTER TABLE conversations ADD COLUMN session_title VARCHAR(100)"))
                print("[DB] 已添加 session_title 列到 conversations 表")
        except Exception as e:
            print(f"[DB] conversations 表迁移检查失败(可忽略): {e}")


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()