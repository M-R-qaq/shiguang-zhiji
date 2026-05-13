from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime
import json

from core.database import get_db
from core.security import get_current_user
from core.vector_db import vector_db
from core.memory_extractor import memory_extractor
from models.user import User, Memory


router = APIRouter(prefix="/memory", tags=["记忆管理"])

VALID_CATEGORIES = [
    "personal_info", "health", "emotion", "event",
    "preference", "relationship", "work_study", "general"
]


class MemoryCreate(BaseModel):
    content: str
    category: str = "general"
    importance: int = 3

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v == "string":
            return "general"
        if v not in VALID_CATEGORIES:
            return "general"
        return v

    @field_validator("importance")
    @classmethod
    def validate_importance(cls, v):
        return max(1, min(5, v))


class MemoryResponse(BaseModel):
    id: int
    content: str
    category: str
    importance: int
    created_at: Optional[datetime]
    is_cared: bool = False


class MemorySearchRequest(BaseModel):
    query: str
    n_results: int = 5
    category: Optional[str] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v == "string":
            return None
        if v is not None and v not in VALID_CATEGORIES:
            return None
        return v


@router.post("", response_model=MemoryResponse)
async def add_memory(
    request: MemoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    添加用户记忆
    """
    # 保存到数据库
    db_memory = Memory(
        user_id=current_user.id,
        content=request.content,
        category=request.category,
        embedding=""  # ChromaDB 内部处理 embedding
    )
    db.add(db_memory)
    await db.commit()
    await db.refresh(db_memory)
    
    # 添加到向量数据库
    vector_db.add_memory(
        memory_id=str(db_memory.id),
        user_id=current_user.id,
        content=request.content,
        category=request.category,
        metadata={"importance": request.importance}
    )
    
    print(f"[Memory API] 添加记忆成功: user_id={current_user.id}, memory_id={db_memory.id}")
    
    return MemoryResponse(
        id=db_memory.id,
        content=db_memory.content,
        category=db_memory.category,
        importance=request.importance,
        created_at=db_memory.created_at,
        is_cared=db_memory.is_cared
    )


@router.get("", response_model=List[MemoryResponse])
async def get_memories(
    category: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户记忆列表
    """
    query = select(Memory).where(Memory.user_id == current_user.id)
    
    if category:
        query = query.where(Memory.category == category)
    
    query = query.order_by(Memory.created_at.desc()).limit(limit)
    
    result = await db.execute(query)
    memories = result.scalars().all()
    
    return [
        MemoryResponse(
            id=m.id,
            content=m.content,
            category=m.category,
            importance=3,  # 默认值
            created_at=m.created_at,
            is_cared=m.is_cared
        )
        for m in memories
    ]


@router.post("/search")
async def search_memories(
    request: MemorySearchRequest,
    current_user: User = Depends(get_current_user)
):
    """
    语义搜索用户记忆
    """
    try:
        memories = vector_db.search_memories(
            user_id=current_user.id,
            query=request.query,
            n_results=request.n_results,
            category=request.category
        )
        
        return {
            "memories": memories
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"搜索记忆失败: {str(e)}")


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除记忆
    """
    # 检查所有权
    query = select(Memory).where(
        Memory.id == memory_id,
        Memory.user_id == current_user.id
    )
    result = await db.execute(query)
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")
    
    # 从数据库删除
    await db.execute(delete(Memory).where(Memory.id == memory_id))
    await db.commit()
    
    # 从向量数据库删除
    vector_db.delete_memory(str(memory_id))
    
    return {"message": "删除成功"}


class ExtractRequest(BaseModel):
    user_message: str
    assistant_message: str

    @field_validator("user_message", "assistant_message")
    @classmethod
    def validate_not_placeholder(cls, v):
        if v == "string":
            raise ValueError("请输入实际对话内容，不能为 'string'")
        return v


@router.post("/extract")
async def extract_memories_from_conversation(
    request: ExtractRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    从对话中提取记忆
    """
    try:
        existing = vector_db.get_user_memories(current_user.id, limit=20)

        extracted, used_fallback = await memory_extractor.extract_memories(
            user_message=request.user_message,
            assistant_message=request.assistant_message,
            existing_memories=existing,
            user_id=current_user.id
        )

        saved_memories = []

        for mem in extracted:
            db_memory = Memory(
                user_id=current_user.id,
                content=mem["content"],
                category=mem["category"],
                embedding=""
            )
            db.add(db_memory)
            await db.commit()
            await db.refresh(db_memory)

            vector_db.add_memory(
                memory_id=str(db_memory.id),
                user_id=current_user.id,
                content=mem["content"],
                category=mem["category"],
                metadata={"importance": mem["importance"]}
            )

            saved_memories.append({
                "id": db_memory.id,
                "content": mem["content"],
                "category": mem["category"],
                "importance": mem["importance"]
            })

        return {
            "extracted_count": len(saved_memories),
            "memories": saved_memories,
            "used_fallback": used_fallback
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"记忆提取失败: {str(e)}")


@router.post("/care/check")
async def check_care_needed(
    current_user: User = Depends(get_current_user)
):
    """
    检查是否需要关怀用户
    """
    # 获取用户最近的记忆
    recent_memories = vector_db.get_user_memories(
        user_id=current_user.id,
        limit=10
    )
    
    if not recent_memories:
        return {
            "should_care": False,
            "reason": "没有足够的记忆数据"
        }
    
    # 转换格式
    memories_data = [
        {
            "content": m["content"],
            "category": m["metadata"].get("category", "general"),
            "importance": m["metadata"].get("importance", 3)
        }
        for m in recent_memories
    ]
    
    care_result = await memory_extractor.should_care(
        memories=memories_data,
        user_id=current_user.id
    )
    
    if care_result:
        return {
            "should_care": True,
            "care_type": care_result.get("care_type", "other"),
            "care_topic": care_result.get("care_topic", ""),
            "care_suggestion": care_result.get("care_suggestion", "")
        }
    
    return {
        "should_care": False,
        "reason": "当前不需要关怀"
    }
