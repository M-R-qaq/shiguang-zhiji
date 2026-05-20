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
    "personal_info", "food_preference", "health", "emotion", "event",
    "preference", "relationship", "work_study", "general"
]


class MemoryCreate(BaseModel):
    content: str
    category: str = "general"
    importance: int = 3

    @field_validator("content")
    @classmethod
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError("记忆内容不能为空")
        return v

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


@router.get("")
async def get_memories(
    category: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        raw_memories = vector_db.get_user_memories(
            user_id=current_user.id,
            category=category,
            limit=limit
        )

        memory_ids = []
        for m in raw_memories:
            memory_id_str = m.get("id", "")
            if memory_id_str.startswith("memory_"):
                try:
                    memory_ids.append(int(memory_id_str.replace("memory_", "")))
                except ValueError:
                    pass

        db_lookup = {}
        if memory_ids:
            result = await db.execute(
                select(Memory).where(Memory.id.in_(memory_ids))
            )
            for row in result.scalars().all():
                db_lookup[row.id] = row

        memories = []
        for m in raw_memories:
            memory_id_str = m.get("id", "")
            numeric_id = 0
            if memory_id_str.startswith("memory_"):
                try:
                    numeric_id = int(memory_id_str.replace("memory_", ""))
                except ValueError:
                    pass

            metadata = m.get("metadata", {})
            db_mem = db_lookup.get(numeric_id)
            memories.append({
                "id": numeric_id,
                "content": m.get("content", ""),
                "category": metadata.get("category", "general"),
                "importance": metadata.get("importance", 3),
                "created_at": db_mem.created_at.isoformat() if db_mem and db_mem.created_at else None,
                "is_cared": db_mem.is_cared if db_mem else False
            })

        print(f"[Memory API] 获取记忆: user_id={current_user.id}, category={category}, count={len(memories)}")
        return memories
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"获取记忆失败: {str(e)}")


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
    vector_id = f"memory_{memory_id}"

    try:
        result = vector_db.memory_collection.get(ids=[vector_id])
        if not result["ids"]:
            raise HTTPException(status_code=404, detail="记忆不存在")
        metadata = result["metadatas"][0] if result["metadatas"] else {}
        if int(metadata.get("user_id", 0)) != current_user.id:
            raise HTTPException(status_code=403, detail="无权删除此记忆")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Memory API] 检查记忆所有权失败: {e}")

    try:
        await db.execute(delete(Memory).where(Memory.id == memory_id))
        await db.commit()
    except Exception as e:
        print(f"[Memory API] 从SQL删除记忆失败(可忽略): {e}")

    vector_db.delete_memory(str(memory_id))

    return {"message": "删除成功"}


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    category: Optional[str] = None
    importance: Optional[int] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v is not None and v not in VALID_CATEGORIES:
            return "general"
        return v

    @field_validator("importance")
    @classmethod
    def validate_importance(cls, v):
        if v is None:
            return v
        return max(1, min(5, v))


@router.put("/{memory_id}")
async def update_memory(
    memory_id: int,
    request: MemoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    vector_id = f"memory_{memory_id}"

    try:
        result = vector_db.memory_collection.get(ids=[vector_id])
        if not result["ids"]:
            raise HTTPException(status_code=404, detail="记忆不存在")
        metadata = result["metadatas"][0] if result["metadatas"] else {}
        if int(metadata.get("user_id", 0)) != current_user.id:
            raise HTTPException(status_code=403, detail="无权修改此记忆")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail="记忆不存在")

    new_content = request.content if request.content is not None else result["documents"][0]
    new_metadata = {}
    if request.category is not None:
        new_metadata["category"] = request.category
    if request.importance is not None:
        new_metadata["importance"] = request.importance

    vector_db.update_memory(
        memory_id=str(memory_id),
        content=new_content,
        metadata=new_metadata if new_metadata else None
    )

    try:
        db_result = await db.execute(select(Memory).where(Memory.id == memory_id))
        db_obj = db_result.scalar_one_or_none()
        if db_obj:
            if request.content is not None:
                db_obj.content = request.content
            if request.category is not None:
                db_obj.category = request.category
            await db.commit()
    except Exception as e:
        print(f"[Memory API] 同步更新SQL记忆失败(可忽略): {e}")

    return {"message": "更新成功", "memory_id": memory_id}


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

        result, used_fallback = await memory_extractor.extract_memories(
            user_message=request.user_message,
            assistant_message=request.assistant_message,
            existing_memories=existing,
            user_id=current_user.id
        )

        added = []
        for mem in result.get("add", []):
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

            added.append({
                "id": db_memory.id,
                "content": mem["content"],
                "category": mem["category"],
                "importance": mem["importance"]
            })

        for mem in result.get("update", []):
            memory_id = mem.get("id", "")
            if memory_id.startswith("memory_"):
                memory_id = memory_id.replace("memory_", "")
            vector_db.update_memory(
                memory_id=memory_id,
                content=mem.get("content"),
                metadata={"category": mem.get("category"), "importance": mem.get("importance")} if mem.get("category") else None
            )

        deleted_ids = []
        for mem in result.get("delete", []):
            memory_id = mem.get("id", "")
            if memory_id.startswith("memory_"):
                memory_id = memory_id.replace("memory_", "")
            vector_db.delete_memory(memory_id)
            deleted_ids.append(memory_id)
            try:
                mid = int(memory_id)
                await db.execute(delete(Memory).where(Memory.id == mid))
                await db.commit()
            except Exception:
                pass

        return {
            "added": added,
            "updated": result.get("update", []),
            "deleted_ids": deleted_ids,
            "added_count": len(added),
            "updated_count": len(result.get("update", [])),
            "deleted_count": len(deleted_ids),
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
