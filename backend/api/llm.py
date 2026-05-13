from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from openai import AsyncOpenAI
import json
import asyncio
import traceback
from core.database import get_db
from core.config import settings
from core.security import get_current_user
from core.vector_db import vector_db
from core.memory_extractor import memory_extractor
from models.user import User, Conversation, Memory


router = APIRouter(prefix="/llm", tags=["语言模型"])


# 苏怀真角色设定
SUHUAI_PROMPT_TEMPLATE = """你是苏怀真，一位才华横溢却屡遭贬谪的古代文人。你以苏轼为原型，充满智慧、幽默与豁达。

核心性格：
- 怀才待时：虽历经挫折，但始终保持对生活的热爱
- 乐观主义：以"此心安处是吾乡"的心态面对困境
- 文化底蕴：熟悉诗词歌赋，常常引经据典
- 美食达人：特别钟爱美食，"东坡肉"正是你所创

对话特点：
- 语言风格：半文半白，典雅而不艰涩
- 情感温度：温暖关怀，像一位老友
- 幽默感：偶尔调侃，展现文人风趣
- 记忆能力：能够记住与用户的过往对话，根据记忆作出个性化回应

{user_memories_section}

当用户说"不想聊了"、"再见"、"退下吧"等结束语时，你应该友好地告别。

请以苏怀真的口吻回复用户。

重要：你的回复只能包含角色要说的话的纯文本内容。不要输出任何动作描述（如"微笑着说"、"拍了拍你的肩膀"）、语气状态说明（如"温柔地"、"叹了口气"）、表情符号（emoji）、括号内的补充说明，或其他任何非对话内容。只输出角色直接说的话。"""


# Pydantic 模型
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Message]] = []


class ChatResponse(BaseModel):
    response: str
    should_exit: bool = False
    memories_extracted: int = 0


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    对话 API

    发送用户消息，返回苏怀真的回复
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key 未配置")

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL
    )

    try:
        print(f"[LLM] 收到消息: {request.message}")

        # 1. 搜索相关记忆
        related_memories = vector_db.search_memories(
            user_id=current_user.id,
            query=request.message,
            n_results=5
        )

        # 构建记忆提示词部分
        memories_section = ""
        if related_memories:
            memories_section = "\n关于用户的记忆（请结合这些记忆进行个性化回复）：\n"
            for i, mem in enumerate(related_memories, 1):
                memories_section += f"{i}. {mem['content']}\n"

        # 构建系统提示词
        system_prompt = SUHUAI_PROMPT_TEMPLATE.format(
            user_memories_section=memories_section
        )

        # 构建消息历史
        messages = [
            {"role": "system", "content": system_prompt}
        ]

        # 添加历史对话（限制最近10轮）
        history = request.history[-20:] if request.history else []
        for msg in history:
            messages.append({
                "role": msg.role,
                "content": msg.content
            })

        # 添加当前用户消息
        messages.append({
            "role": "user",
            "content": request.message
        })

        if related_memories:
            print(f"[LLM] 检索到 {len(related_memories)} 条相关记忆")

        print(f"[LLM] 调用API, 模型: {settings.LLM_MODEL}, 消息数: {len(messages)}")

        # 调用 OpenAI API
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            temperature=0.8,
            max_tokens=500
        )

        assistant_message = response.choices[0].message.content

        if not assistant_message:
            print("[LLM] 警告: 模型返回空内容")
            assistant_message = "（模型未返回内容）"

        print(f"[LLM] 助手回复: {assistant_message[:100]}...")

        # 保存对话记录
        user_msg = Conversation(user_id=current_user.id, role="user", content=request.message)
        assistant_msg = Conversation(user_id=current_user.id, role="assistant", content=assistant_message)
        db.add_all([user_msg, assistant_msg])
        await db.commit()
        print("[LLM] 对话记录已保存")

        # 2. 异步提取新记忆（不阻塞响应）
        extracted_count = 0
        try:
            # 获取现有记忆用于去重
            existing = vector_db.get_user_memories(current_user.id, limit=20)

            extracted = await memory_extractor.extract_memories(
                user_message=request.message,
                assistant_message=assistant_message,
                existing_memories=existing
            )

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

            extracted_count = len(extracted)
            if extracted_count > 0:
                print(f"[LLM] 提取并保存了 {extracted_count} 条新记忆")
        except Exception as e:
            print(f"[LLM] 记忆提取失败: {e}")
            traceback.print_exc()

        # 检查是否应该退出
        exit_keywords = ["不想聊了", "再见", "退下吧", "告辞", "拜拜", "下次再聊"]
        should_exit = any(keyword in request.message for keyword in exit_keywords)

        return ChatResponse(
            response=assistant_message,
            should_exit=should_exit,
            memories_extracted=extracted_count
        )

    except Exception as e:
        error_detail = f"对话生成失败: {str(e)}"
        print(f"[LLM ERROR] {error_detail}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    流式对话 API

    返回 SSE 流式响应
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key 未配置")

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL
    )

    # 搜索相关记忆
    related_memories = vector_db.search_memories(
        user_id=current_user.id,
        query=request.message,
        n_results=5
    )

    memories_section = ""
    if related_memories:
        memories_section = "\n关于用户的记忆（请结合这些记忆进行个性化回复）：\n"
        for i, mem in enumerate(related_memories, 1):
            memories_section += f"{i}. {mem['content']}\n"

    system_prompt = SUHUAI_PROMPT_TEMPLATE.format(
        user_memories_section=memories_section
    )

    messages = [
        {"role": "system", "content": system_prompt}
    ]

    history = request.history[-20:] if request.history else []
    for msg in history:
        messages.append({
            "role": msg.role,
            "content": msg.content
        })

    messages.append({
        "role": "user",
        "content": request.message
    })

    async def generate():
        full_response = ""
        try:
            stream = await client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                temperature=0.8,
                max_tokens=500,
                stream=True
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    yield f"data: {json.dumps({'content': content})}\n\n"

            # 保存对话记录
            user_msg = Conversation(user_id=current_user.id, role="user", content=request.message)
            assistant_msg = Conversation(user_id=current_user.id, role="assistant", content=full_response)
            db.add_all([user_msg, assistant_msg])
            await db.commit()

            # 提取记忆
            try:
                existing = vector_db.get_user_memories(current_user.id, limit=20)
                extracted = await memory_extractor.extract_memories(
                    user_message=request.message,
                    assistant_message=full_response,
                    existing_memories=existing
                )

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
            except Exception as e:
                print(f"[LLM Stream] 记忆提取失败: {e}")

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
