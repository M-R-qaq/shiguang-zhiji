from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    """用户模型"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    nickname = Column(String(50), nullable=True)
    wake_word_name = Column(String(10), nullable=True, default="知己")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    sessions_invalidated_at = Column(DateTime(timezone=True), nullable=True)


class Conversation(Base):
    """对话记录模型"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    session_id = Column(String(50), index=True, nullable=True)
    session_title = Column(String(100), nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class Memory(Base):
    """记忆模型"""
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(50), nullable=True)
    embedding = Column(Text, nullable=True)
    importance = Column(Integer, default=3)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cared_at = Column(DateTime(timezone=True), nullable=True)
    is_cared = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    extra_data = Column(Text, nullable=True)


class TokenBlacklist(Base):
    """Token黑名单 - 用于登出功能"""
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(500), unique=True, nullable=False, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())