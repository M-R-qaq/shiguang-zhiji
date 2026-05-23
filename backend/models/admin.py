from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON, UniqueConstraint
from sqlalchemy.sql import func
from models.user import Base


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    display_name = Column(String(50), nullable=True)
    role = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AdminTokenBlacklist(Base):
    __tablename__ = "admin_token_blacklist"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(500), unique=True, nullable=False, index=True)
    admin_id = Column(Integer, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    priority = Column(String(20), default="normal")
    created_by = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(50), nullable=True)
    detail = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
