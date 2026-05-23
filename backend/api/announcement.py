from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, case
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.admin import Announcement, AnnouncementRead

router = APIRouter(prefix="/announcements", tags=["公告"])

PRIORITY_ORDER = {"high": 3, "normal": 2, "low": 1}


class AnnouncementResponse(BaseModel):
    id: int
    title: str
    content: str
    priority: str
    created_at: datetime | None
    is_read: bool = False


class AnnouncementReadResponse(BaseModel):
    success: bool = True
    message: str = "已标记为读"


@router.get("", response_model=list[AnnouncementResponse])
async def list_announcements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Announcement)
        .where(Announcement.is_active == True)
        .order_by(
            case(
                (Announcement.priority == "high", 3),
                (Announcement.priority == "normal", 2),
                (Announcement.priority == "low", 1),
                else_=0
            ).desc(),
            Announcement.created_at.desc()
        )
    )
    announcements = result.scalars().all()

    if not announcements:
        return []

    announcement_ids = [a.id for a in announcements]

    read_result = await db.execute(
        select(AnnouncementRead.announcement_id)
        .where(
            AnnouncementRead.user_id == current_user.id,
            AnnouncementRead.announcement_id.in_(announcement_ids)
        )
    )
    read_ids = set(read_result.scalars().all())

    return [
        AnnouncementResponse(
            id=a.id,
            title=a.title,
            content=a.content,
            priority=a.priority,
            created_at=a.created_at,
            is_read=a.id in read_ids
        )
        for a in announcements
    ]


@router.post("/{announcement_id}/read", response_model=AnnouncementReadResponse)
async def mark_announcement_read(
    announcement_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.is_active == True
        )
    )
    announcement = result.scalar_one_or_none()

    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")

    read_result = await db.execute(
        select(AnnouncementRead).where(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.user_id == current_user.id
        )
    )
    existing = read_result.scalar_one_or_none()

    if not existing:
        read_record = AnnouncementRead(
            announcement_id=announcement_id,
            user_id=current_user.id
        )
        db.add(read_record)
        await db.commit()

    return AnnouncementReadResponse()
