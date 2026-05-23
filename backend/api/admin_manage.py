import os
import math
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, distinct
from pydantic import BaseModel
from core.database import get_db
from core.security import get_current_admin, get_password_hash
from core.config import settings
from core.vector_db import vector_db
from models.user import User, Memory, Conversation, TokenBlacklist
from models.admin import Admin, Announcement, AnnouncementRead, AuditLog

router = APIRouter(prefix="/admin", tags=["管理员"])

_start_time = datetime.now(timezone.utc)


class UserListItem(BaseModel):
    id: int
    username: str
    nickname: str | None
    email: str | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None

    class Config:
        from_attributes = True


class PaginatedUsers(BaseModel):
    items: list[UserListItem]
    total: int
    page: int
    pages: int


class UserStats(BaseModel):
    id: int
    username: str
    nickname: str | None
    email: str | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None
    memory_count: int
    conversation_count: int
    session_count: int
    days_since_registration: int

    class Config:
        from_attributes = True


class UserStatusUpdate(BaseModel):
    is_active: bool


class PasswordReset(BaseModel):
    new_password: str


class ConfigUpdateRequest(BaseModel):
    updates: dict[str, str | int | float | bool]


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: str = "normal"


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    priority: str | None = None
    is_active: bool | None = None


class AnnouncementResponse(BaseModel):
    id: int
    title: str
    content: str
    priority: str
    created_by: int
    is_active: bool
    created_at: datetime | None

    class Config:
        from_attributes = True


class PaginatedAuditLogs(BaseModel):
    items: list[dict]
    total: int
    page: int
    pages: int


@router.get("/dashboard")
async def get_dashboard(
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    users_total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    users_active = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    users_today_new = (await db.execute(select(func.count(User.id)).where(User.created_at >= today_start))).scalar() or 0

    memories_total = (await db.execute(select(func.count(Memory.id)))).scalar() or 0
    category_rows = (await db.execute(select(Memory.category, func.count(Memory.id)).group_by(Memory.category))).all()
    by_category = {row[0] or "uncategorized": row[1] for row in category_rows}

    conversations_total = (await db.execute(select(func.count(Conversation.id)))).scalar() or 0
    conversations_today = (await db.execute(select(func.count(Conversation.id)).where(Conversation.timestamp >= today_start))).scalar() or 0

    uptime_seconds = (datetime.now(timezone.utc) - _start_time).total_seconds()

    db_size_mb = 0.0
    db_path = "shiguang.db"
    if os.path.exists(db_path):
        db_size_mb = os.path.getsize(db_path) / (1024 * 1024)

    return {
        "users": {"total": users_total, "active": users_active, "today_new": users_today_new},
        "memories": {"total": memories_total, "by_category": by_category},
        "conversations": {"total": conversations_total, "today_count": conversations_today},
        "system": {"uptime_seconds": uptime_seconds, "version": "0.8.0", "db_size_mb": db_size_mb}
    }


@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    keyword: str | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(User)
    count_query = select(func.count(User.id))

    if keyword:
        query = query.where((User.username.ilike(f"%{keyword}%")) | (User.nickname.ilike(f"%{keyword}%")))
        count_query = count_query.where((User.username.ilike(f"%{keyword}%")) | (User.nickname.ilike(f"%{keyword}%")))

    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)

    total = (await db.execute(count_query)).scalar() or 0
    pages = math.ceil(total / page_size) if total > 0 else 1

    offset = (page - 1) * page_size
    query = query.order_by(User.id).offset(offset).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return {"items": users, "total": total, "page": page, "pages": pages}


@router.get("/users/{user_id}", response_model=UserStats)
async def get_user_detail(
    user_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    memory_count = (await db.execute(select(func.count(Memory.id)).where(Memory.user_id == user_id))).scalar() or 0
    conversation_count = (await db.execute(select(func.count(Conversation.id)).where(Conversation.user_id == user_id))).scalar() or 0
    session_count = (await db.execute(select(func.count(distinct(Conversation.session_id))).where(Conversation.user_id == user_id))).scalar() or 0

    days_since_registration = 0
    if user.created_at:
        created = user.created_at.replace(tzinfo=timezone.utc) if user.created_at.tzinfo is None else user.created_at
        days_since_registration = (datetime.now(timezone.utc) - created).days

    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "email": user.email,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "memory_count": memory_count,
        "conversation_count": conversation_count,
        "session_count": session_count,
        "days_since_registration": days_since_registration
    }


@router.put("/users/{user_id}/status")
async def toggle_user_status(
    user_id: int,
    status_data: UserStatusUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    user.is_active = status_data.is_active
    if not status_data.is_active:
        user.sessions_invalidated_at = datetime.now(timezone.utc)
    await db.commit()

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="toggle_user_status",
        target_type="user",
        target_id=str(user_id),
        detail={"is_active": status_data.is_active}
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "用户状态已更新", "success": True}


@router.put("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    if len(password_data.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="密码长度不能少于6位")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    user.hashed_password = get_password_hash(password_data.new_password)
    user.sessions_invalidated_at = datetime.now(timezone.utc)
    await db.commit()

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="reset_user_password",
        target_type="user",
        target_id=str(user_id)
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "密码已重置", "success": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="delete_user",
        target_type="user",
        target_id=str(user_id)
    )
    db.add(audit_log)
    await db.flush()

    await db.execute(delete(Conversation).where(Conversation.user_id == user_id))
    await db.execute(delete(Memory).where(Memory.user_id == user_id))
    await db.execute(delete(TokenBlacklist).where(TokenBlacklist.user_id == user_id))
    await db.execute(delete(AnnouncementRead).where(AnnouncementRead.user_id == user_id))
    await db.delete(user)
    await db.commit()

    try:
        vector_db.delete_user_memories(user_id)
    except Exception:
        pass

    return {"message": "用户已删除", "success": True}


@router.get("/config")
async def get_config(
    current_admin: Admin = Depends(get_current_admin)
):
    MASKED_KEYS = {"OPENAI_API_KEY", "IFLYTEK_TTS_APP_ID", "IFLYTEK_TTS_API_KEY", "IFLYTEK_TTS_API_SECRET", "MIMO_API_KEY", "TAVILY_API_KEY"}

    def get_val(key):
        val = getattr(settings, key, None)
        if key in MASKED_KEYS:
            return "***"
        return val

    return {
        "llm": {
            "model": get_val("LLM_MODEL"),
            "base_url": get_val("OPENAI_BASE_URL"),
            "OPENAI_API_KEY": get_val("OPENAI_API_KEY"),
        },
        "tts": {
            "provider": get_val("TTS_PROVIDER"),
            "model": get_val("TTS_MODEL"),
            "voice": get_val("TTS_VOICE"),
            "character_voice": get_val("TTS_CHARACTER_VOICE"),
            "streaming_enabled": get_val("TTS_STREAMING_ENABLED"),
            "IFLYTEK_TTS_APP_ID": get_val("IFLYTEK_TTS_APP_ID"),
            "IFLYTEK_TTS_API_KEY": get_val("IFLYTEK_TTS_API_KEY"),
            "IFLYTEK_TTS_API_SECRET": get_val("IFLYTEK_TTS_API_SECRET"),
            "MIMO_API_KEY": get_val("MIMO_API_KEY"),
        },
        "memory": {
            "distance_threshold": get_val("MEMORY_DISTANCE_THRESHOLD"),
            "min_importance": get_val("MEMORY_MIN_IMPORTANCE"),
            "max_per_user": get_val("MEMORY_MAX_PER_USER"),
            "cleanup_interval": get_val("MEMORY_CLEANUP_INTERVAL"),
        },
        "search": {
            "TAVILY_API_KEY": get_val("TAVILY_API_KEY"),
            "enabled": get_val("WEB_SEARCH_ENABLED"),
            "max_results": get_val("WEB_SEARCH_MAX_RESULTS"),
            "timeout": get_val("WEB_SEARCH_TIMEOUT"),
        }
    }


@router.put("/config")
async def update_config(
    config_data: ConfigUpdateRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    FORBIDDEN_KEYS = ["SECRET_KEY", "DATABASE_URL"]
    MASKED_KEYWORDS = ["KEY", "SECRET", "PASSWORD"]

    known_fields = {name for name, field in settings.model_fields.items()}

    for dot_key, value in config_data.updates.items():
        field_name = dot_key.split(".")[-1] if "." in dot_key else dot_key

        if field_name not in known_fields:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"未知配置项: {field_name}")

        if field_name in FORBIDDEN_KEYS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"禁止修改配置项: {field_name}")

        if any(kw in field_name.upper() for kw in MASKED_KEYWORDS):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"敏感配置项不可通过此接口修改: {field_name}")

        original = getattr(settings, field_name, None)
        if isinstance(original, bool):
            if isinstance(value, str):
                value = value.lower() in ("true", "1", "yes")
            else:
                value = bool(value)
        elif isinstance(original, int):
            value = int(value)
        elif isinstance(original, float):
            value = float(value)

        setattr(settings, field_name, value)

    env_path = os.path.join(os.getcwd(), ".env")
    existing_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            existing_lines = f.readlines()

    updated_keys = set()
    for dot_key, value in config_data.updates.items():
        field_name = dot_key.split(".")[-1] if "." in dot_key else dot_key
        env_key = field_name.upper()
        updated_keys.add(env_key)

    new_lines = []
    written_keys = set()
    for line in existing_lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0].strip()
            if key in updated_keys:
                field_name = key
                val = getattr(settings, field_name, "")
                new_lines.append(f"{key}={val}\n")
                written_keys.add(key)
                continue
        new_lines.append(line)

    for key in updated_keys - written_keys:
        field_name = key
        val = getattr(settings, field_name, "")
        new_lines.append(f"{key}={val}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="update_config",
        target_type="config",
        detail=config_data.updates
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "配置已更新", "success": True}


@router.get("/audit-logs")
async def list_audit_logs(
    action: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)

    total = (await db.execute(count_query)).scalar() or 0
    pages = math.ceil(total / page_size) if total > 0 else 1

    offset = (page - 1) * page_size
    query = query.order_by(AuditLog.id.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = [
        {
            "id": log.id,
            "operator_id": log.operator_id,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "detail": log.detail,
            "created_at": log.created_at
        }
        for log in logs
    ]

    return {"items": items, "total": total, "page": page, "pages": pages}


@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    data: AnnouncementCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    announcement = Announcement(
        title=data.title,
        content=data.content,
        priority=data.priority,
        created_by=current_admin.id
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="create_announcement",
        target_type="announcement",
        target_id=str(announcement.id)
    )
    db.add(audit_log)
    await db.commit()

    return announcement


@router.get("/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()))
    return result.scalars().all()


@router.put("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    announcement = result.scalar_one_or_none()

    if announcement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="公告不存在")

    if data.title is not None:
        announcement.title = data.title
    if data.content is not None:
        announcement.content = data.content
    if data.priority is not None:
        announcement.priority = data.priority
    if data.is_active is not None:
        announcement.is_active = data.is_active

    await db.commit()
    await db.refresh(announcement)

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="update_announcement",
        target_type="announcement",
        target_id=str(announcement_id)
    )
    db.add(audit_log)
    await db.commit()

    return announcement


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    announcement = result.scalar_one_or_none()

    if announcement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="公告不存在")

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="delete_announcement",
        target_type="announcement",
        target_id=str(announcement_id)
    )
    db.add(audit_log)
    await db.flush()

    await db.delete(announcement)
    await db.commit()

    return {"message": "公告已删除", "success": True}
