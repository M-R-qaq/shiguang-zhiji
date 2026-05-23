from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from core.database import get_db
from core.security import verify_password, get_password_hash, create_admin_token, get_current_admin, add_admin_token_to_blacklist
from models.admin import Admin, AdminTokenBlacklist, AuditLog

router = APIRouter(prefix="/admin/auth", tags=["管理员认证"])


class AdminLogin(BaseModel):
    username: str
    password: str


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminResponse(BaseModel):
    id: int
    username: str
    display_name: str | None
    role: str
    created_at: datetime | None

    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class CreateAdminRequest(BaseModel):
    username: str
    password: str
    display_name: str | None = None


@router.post("/login", response_model=AdminToken)
async def admin_login(admin_data: AdminLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Admin).where(Admin.username == admin_data.username))
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(admin_data.password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="管理员已被停用"
        )

    access_token = create_admin_token(data={"sub": str(admin.id)})

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def admin_logout(
    authorization: str = Header(...),
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        token = authorization.replace("Bearer ", "")
        await add_admin_token_to_blacklist(token, current_admin.id, db)
        return {"message": "登出成功", "success": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"登出失败: {str(e)}"
        )


@router.get("/me", response_model=AdminResponse)
async def get_current_admin_info(current_admin: Admin = Depends(get_current_admin)):
    return current_admin


@router.put("/password")
async def change_admin_password(
    password_data: PasswordChange,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(password_data.old_password, current_admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误"
        )

    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度不能少于6位"
        )

    current_admin.hashed_password = get_password_hash(password_data.new_password)
    await db.commit()

    return {"message": "密码修改成功", "success": True}


@router.post("/create-admin", response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
async def create_admin(
    admin_data: CreateAdminRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    if current_admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅超级管理员可创建管理员"
        )

    result = await db.execute(select(Admin).where(Admin.username == admin_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已存在"
        )

    new_admin = Admin(
        username=admin_data.username,
        hashed_password=get_password_hash(admin_data.password),
        display_name=admin_data.display_name,
        role="admin",
        created_by=current_admin.id
    )

    db.add(new_admin)
    await db.commit()
    await db.refresh(new_admin)

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="create_admin",
        target_type="admin",
        target_id=str(new_admin.id)
    )
    db.add(audit_log)
    await db.commit()

    return new_admin


@router.get("/admins", response_model=list[AdminResponse])
async def list_admins(
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    if current_admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅超级管理员可查看管理员列表"
        )

    result = await db.execute(select(Admin).order_by(Admin.id))
    return result.scalars().all()


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    if current_admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅超级管理员可删除管理员"
        )

    if admin_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己"
        )

    result = await db.execute(select(Admin).where(Admin.id == admin_id))
    admin = result.scalar_one_or_none()

    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )

    if admin.role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能删除超级管理员"
        )

    await db.delete(admin)

    audit_log = AuditLog(
        operator_id=current_admin.id,
        action="delete_admin",
        target_type="admin",
        target_id=str(admin_id)
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "管理员已删除", "success": True}
