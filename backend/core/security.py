from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.config import settings
from core.database import get_db
from models.user import User, TokenBlacklist

# Bearer token 方案
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    if isinstance(plain_password, str):
        plain_password = plain_password.encode("utf-8")
    if isinstance(hashed_password, str):
        hashed_password = hashed_password.encode("utf-8")
    return bcrypt.checkpw(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """获取密码哈希"""
    if isinstance(password, str):
        password = password.encode("utf-8")
    return bcrypt.hashpw(password, bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """解码令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def is_token_blacklisted(token: str, db: AsyncSession) -> bool:
    """检查Token是否在黑名单中"""
    result = await db.execute(select(TokenBlacklist).where(TokenBlacklist.token == token))
    return result.scalar_one_or_none() is not None


async def add_token_to_blacklist(token: str, user_id: int, db: AsyncSession):
    """将Token添加到黑名单"""
    payload = decode_token(token)
    expires_at = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc) if payload else datetime.now(timezone.utc)
    
    blacklisted_token = TokenBlacklist(
        token=token,
        user_id=user_id,
        expires_at=expires_at
    )
    db.add(blacklisted_token)
    await db.commit()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """获取当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    
    # 检查Token是否已被列入黑名单
    if await is_token_blacklisted(token, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token已失效，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_token(token)
    
    if payload is None:
        raise credentials_exception
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception
    
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise credentials_exception
    
    # 从数据库获取用户
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="用户已停用")
    
    if user.sessions_invalidated_at:
        token_iat = payload.get("iat")
        if token_iat:
            token_issued = datetime.fromtimestamp(token_iat, tz=timezone.utc)
            if token_issued < user.sessions_invalidated_at:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="会话已失效，请重新登录",
                    headers={"WWW-Authenticate": "Bearer"},
                )
    
    return user


def create_admin_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode.update({"type": "admin"})
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


async def is_admin_token_blacklisted(token: str, db: AsyncSession) -> bool:
    from models.admin import AdminTokenBlacklist
    result = await db.execute(select(AdminTokenBlacklist).where(AdminTokenBlacklist.token == token))
    return result.scalar_one_or_none() is not None


async def add_admin_token_to_blacklist(token: str, admin_id: int, db: AsyncSession):
    from models.admin import AdminTokenBlacklist
    payload = decode_token(token)
    expires_at = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc) if payload else datetime.now(timezone.utc)

    blacklisted_token = AdminTokenBlacklist(
        token=token,
        admin_id=admin_id,
        expires_at=expires_at
    )
    db.add(blacklisted_token)
    await db.commit()


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    from models.admin import Admin
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials

    if await is_admin_token_blacklisted(token, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token已失效，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)

    if payload is None:
        raise credentials_exception

    if payload.get("type") != "admin":
        raise credentials_exception

    admin_id_str = payload.get("sub")
    if admin_id_str is None:
        raise credentials_exception

    try:
        admin_id = int(admin_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(Admin).where(Admin.id == admin_id))
    admin = result.scalar_one_or_none()

    if admin is None:
        raise credentials_exception

    if not admin.is_active:
        raise HTTPException(status_code=400, detail="管理员已停用")

    return admin
