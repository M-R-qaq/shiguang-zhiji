from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sql_func, delete, desc
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
from openai import AsyncOpenAI
from datetime import datetime, timedelta
import json
import asyncio
import re
import traceback
import uuid
from core.database import get_db
from core.config import settings
from core.security import get_current_user
from core.vector_db import vector_db
from core.memory_extractor import memory_extractor
from core.web_search import web_searcher
from models.user import User, Conversation, Memory


router = APIRouter(prefix="/llm", tags=["语言模型"])

_background_tasks: set = set()

_llm_client = None

def get_llm_client():
    global _llm_client
    if _llm_client is None:
        _llm_client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL
        )
    return _llm_client


PROMPT_IDENTITY = """你是苏怀真，一位跨越千年来到用户餐桌旁的知己。你以苏轼为原型，在用户用餐的时光里，以古人的智慧和温暖陪伴左右。"""

PROMPT_POSITIONING = """
核心定位 — 进食陪伴：
- 你是用户吃饭时的陪伴者，在"食光"中做用户的"知己"
- 你的存在让每一餐都不再孤单，让吃饭的时光变得温暖而有趣
- 你深谙饮食之道，"东坡肉"正是你所创，对美食有独到见解
- 你会将饮食文化、诗词典故自然融入餐桌对话"""

PROMPT_PERSONALITY = """
核心性格：
- 温暖陪伴：像一位老友坐在对面，边吃边聊
- 美食达人：对食物有深刻理解和热爱，常引经据典谈饮食
- 乐观豁达：以"此心安处是吾乡"的心态面对一切
- 文人风趣：半文半白，典雅而不艰涩，偶尔幽默调侃"""

PROMPT_SHIGUANGJIAN = """
食光鉴：
- 你手中有一面名为"食光鉴"的古铜镜，它是连接古今的神奇器物
- 通过食光鉴，你可以窥见千年后的世界，了解现代的事物
- 当用户对某个话题感兴趣、想了解某方面内容时，你可以凝视食光鉴，为用户寻找相关的内容
- 你推荐现代内容时，应以"我在食光鉴中看到了..."的方式自然引入
- 食光鉴让你既能保持古人的视角，又能为用户带来现代的价值
- 当你通过食光鉴为用户找到了值得推荐的内容时，在回复末尾单独一行写上：【食光鉴|关键词】（关键词为你搜索用的简短主题词，如"美食纪录片"、"书法入门"等）"""

PROMPT_WEB_SEARCH = """
食光鉴·通晓今事：
- 你的食光鉴不仅能窥见千年后的影像，还能感知当下世间的实时变化
- 当用户询问今日天气、时事新闻、近期热点等需要实时信息的问题时，你可以通过食光鉴感知当下
- 你应以"我方才凝视食光鉴，感知到..."或"食光鉴向我显现了今日的..."的方式自然引入实时信息
- 你要将现代的信息用古人的视角和语言来诠释，让信息既准确又有趣
- 回复中应包含准确的实时信息内容，但用苏怀真的风格来表述
- 当你通过食光鉴获取到了实时信息时，在回复末尾单独一行写上：【食光鉴·实时|搜索关键词】

地点确认原则：
- 当用户的问题涉及特定地点（如天气、本地新闻、附近推荐等），但未明确告知你所在地点时，先查看记忆中是否已有用户的地点信息
- 如果用户记忆中已有地点信息，必须直接使用，不要再询问用户身在何处
- 如果记忆中确实没有地点信息，才礼貌询问"不知阁下身在何处？"或类似表达
- 绝不要在没有用户地点信息的情况下自行编造或默认一个城市来回答
- 当用户问"我在哪"或"你知道我在哪吗"时，应从记忆中查找并告知，而不是反问用户"""

PROMPT_CARE = """
【关怀提示】系统检测到用户可能需要关怀。请在回复开头用1-2句简短的话以苏怀真的口吻表达关心，然后自然过渡到正常对话。关怀要温暖但不刻意，简短而不冗长。
关怀建议：{care_suggestion}"""

PROMPT_CONVERSATION = """
对话特点：
- 语言风格：半文半白，温暖亲切，像餐桌上的闲聊
- 情感温度：关注用户的用餐体验和心情状态
- 记忆能力：记住用户的饮食偏好、用餐习惯、重要信息
- 回复节奏：简洁为主，不打断用户用餐的节奏

当用户说"不想聊了"、"再见"、"退下吧"等结束语时，你应该以关心用户用餐体验的方式友好告别。

请以苏怀真的口吻回复用户。

重要：你的回复只能包含角色要说的话的纯文本内容。不要输出任何动作描述（如"微笑着说"、"拍了拍你的肩膀"）、语气状态说明（如"温柔地"、"叹了口气"）、表情符号（emoji）、括号内的补充说明，或其他任何非对话内容。只输出角色直接说的话。"""


def build_system_prompt(
    memories_section: str = "",
    care_suggestion: str = "",
    web_search_context: str = ""
) -> str:
    parts = [
        PROMPT_IDENTITY,
        PROMPT_POSITIONING,
        PROMPT_PERSONALITY,
        PROMPT_SHIGUANGJIAN,
        PROMPT_WEB_SEARCH,
    ]

    if care_suggestion:
        parts.append(PROMPT_CARE.format(care_suggestion=care_suggestion))

    if web_search_context:
        parts.append(web_search_context)

    if memories_section:
        parts.append(memories_section)

    parts.append(PROMPT_CONVERSATION)

    return "\n".join(parts)


REALTIME_PATTERNS = [
    r'今天.{0,4}天气',
    r'明[天日].{0,4}天气',
    r'后天.{0,4}天气',
    r'这[天日周].{0,6}天气',
    r'现在.{0,4}温度',
    r'几度',
    r'气温',
    r'下[雨雪]吗',
    r'带伞',
    r'穿[什么多少]',
    r'今天.{0,4}新[闻闻]',
    r'最[新近].{0,6}新闻',
    r'最[新近].{0,6}消息',
    r'今日.{0,4}热点',
    r'现在.{0,4}时间',
    r'今天.{0,4}日[期子]',
    r'今天是.{0,2}几号',
    r'今天是.{0,2}星期',
    r'今天.{0,4}股[票市]',
    r'汇率',
    r'[什哪]里.{0,4}地震',
    r'有没[有有].{0,6}台风',
    r'现在.{0,6}[发发作]生',
    r'今天.{0,4}[发发作]生',
    r'最近.{0,6}[发新作]生',
    r'当前.{0,6}状况',
    r'实时',
    r'现在.{0,4}怎[么样样]',
    r'今天.{0,4}怎[么样样]',
    r'帮我[查搜看问].{0,8}',
    r'[查搜看问]一[下下]',
    r'谁[赢了赢]',
    r'比分',
    r'排名',
    r'[多高少]少钱',
    r'价[格格]',
    r'航班',
    r'高铁',
    r'限行',
    r'停水',
    r'停电',
    r'路况',
    r'空气.{0,4}[质指]量',
    r'PM2\.5',
    r'疫情',
    r'放假',
    r'调休',
]


LOCATION_RELATED_PATTERNS = [
    r'天气', r'温度', r'下雨', r'下雪', r'几度',
    r'附近', r'周边', r'哪里有', r'哪儿有',
    r'本地', r'当地', r'这边',
]

LOCATION_KEYWORDS = [
    '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '南京',
    '西安', '苏州', '天津', '长沙', '郑州', '青岛', '大连', '厦门', '福州',
    '合肥', '济南', '昆明', '贵阳', '南宁', '海口', '三亚', '拉萨', '兰州',
    '太原', '石家庄', '沈阳', '哈尔滨', '长春', '呼和浩特', '乌鲁木齐', '银川',
    '西宁', '南昌', '无锡', '佛山', '东莞', '珠海', '温州', '宁波',
    '纽约', '伦敦', '东京', '巴黎', '首尔', '悉尼',
]


def needs_web_search(user_message: str) -> Optional[str]:
    if not web_searcher.is_enabled():
        return None

    is_location_related = any(re.search(p, user_message) for p in LOCATION_RELATED_PATTERNS)
    has_location = any(city in user_message for city in LOCATION_KEYWORDS)

    if is_location_related and not has_location:
        return None

    for pattern in REALTIME_PATTERNS:
        if re.search(pattern, user_message):
            return user_message

    if has_location:
        if any(kw in user_message for kw in ['天气', '温度', '下雨', '下雪', '几度', '怎么样', '情况', '新闻', '热点', '发生']):
            return user_message

    return None


def extract_search_query_from_message(user_message: str) -> str:
    clean = re.sub(r'[请你帮我可不可以能不能跟和]', '', user_message)
    clean = re.sub(r'[吗呢吧啊呀哦嘛]+', '', clean)
    clean = re.sub(r'[，。！？、；：“”‘’（）【】《》\[\]{}]+', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    if len(clean) > 50:
        clean = clean[:50]
    return clean


def format_web_search_context(results: List[Dict]) -> str:
    if not results:
        return ""

    context = "【食光鉴·实时信息】以下是你通过食光鉴感知到的当今世间实时信息，请以苏怀真的口吻自然地向用户传达，用古人的视角来诠释这些现代信息：\n"
    for i, r in enumerate(results, 1):
        title = r.get("title", "")
        content = r.get("content", "")
        if title and content:
            context += f"{i}. [{title}] {content}\n"
        elif content:
            context += f"{i}. {content}\n"
    context += "\n请将以上信息自然融入对话，保持苏怀真的说话风格。确保信息内容准确，但用古风表达。"

    return context


def extract_web_search_keyword(response_text: str) -> Tuple[Optional[str], str]:
    match = re.search(r'【食光鉴·实时[|｜](.+?)】', response_text)
    if match:
        keyword = match.group(1).strip()
        cleaned = re.sub(r'\n?【食光鉴·实时[|｜].+?】', '', response_text)
        return keyword, cleaned
    return None, response_text


def extract_shiguangjian_keyword(response_text: str) -> Tuple[Optional[str], str]:
    match = re.search(r'【食光鉴[|｜](.+?)】', response_text)
    if match:
        keyword = match.group(1).strip()
        cleaned = re.sub(r'\n?【食光鉴[|｜].+?】', '', response_text)
        return keyword, cleaned
    return None, response_text


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Message]] = []
    session_id: Optional[str] = None


class VideoResult(BaseModel):
    title: str
    bvid: str = ""
    cover: str = ""
    author: str = ""
    duration: str = ""
    play_count: str = ""
    url: str = ""


class ChatResponse(BaseModel):
    response: str
    should_exit: bool = False
    memories_added: int = 0
    memories_updated: int = 0
    memories_deleted: int = 0
    care_injected: bool = False
    search_query: Optional[str] = None
    search_results: Optional[List[VideoResult]] = None
    session_id: Optional[str] = None
    web_search_query: Optional[str] = None
    web_search_results: Optional[List[Dict[str, str]]] = None


class ConversationItem(BaseModel):
    id: int
    role: str
    content: str
    session_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    metadata_: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class SessionInfo(BaseModel):
    session_id: str
    last_message_time: Optional[datetime] = None
    message_count: int = 0
    preview: str = ""
    title: str = ""


SESSION_TIMEOUT_MINUTES = 30


async def _get_or_create_session(user_id: int, db: AsyncSession, session_id: Optional[str] = None) -> str:
    if session_id:
        return session_id

    recent = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.session_id.isnot(None))
        .order_by(desc(Conversation.timestamp))
        .limit(1)
    )
    last_msg = recent.scalar_one_or_none()

    if last_msg and last_msg.session_id and last_msg.timestamp:
        elapsed = datetime.now(last_msg.timestamp.tzinfo) - last_msg.timestamp
        if elapsed < timedelta(minutes=SESSION_TIMEOUT_MINUTES):
            return last_msg.session_id

    return str(uuid.uuid4())


async def _load_recent_context(user_id: int, db: AsyncSession, session_id: Optional[str] = None, limit: int = 10) -> List[Dict[str, str]]:
    query = select(Conversation).where(
        Conversation.user_id == user_id,
        Conversation.role.in_(["user", "assistant"])
    )
    if session_id:
        query = query.where(Conversation.session_id == session_id)
    query = query.order_by(desc(Conversation.timestamp)).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()
    rows.reverse()

    context = []
    for row in rows:
        context.append({"role": row.role, "content": row.content})
    return context


async def _check_care(user_id: int, db: AsyncSession) -> Tuple[str, bool]:
    care_suggestion = ""
    care_injected = False
    try:
        recent_memories = vector_db.get_user_memories(user_id, limit=10)
        if recent_memories:
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
                user_id=user_id,
                db=db
            )
            if care_result:
                care_suggestion = care_result.get("care_suggestion", "")
                care_injected = True
                print(f"[LLM] 关怀注入: {care_result.get('care_topic')}")
    except Exception as e:
        print(f"[LLM] 关怀检测失败(可忽略): {e}")
    return care_suggestion, care_injected


async def generate_session_title(session_id: str, user_id: int, db: AsyncSession):
    try:
        title_check = await db.execute(
            select(Conversation.session_title)
            .where(
                Conversation.session_id == session_id,
                Conversation.user_id == user_id,
                Conversation.session_title.isnot(None),
            )
            .limit(1)
        )
        if title_check.scalar_one_or_none():
            return

        rounds_result = await db.execute(
            select(Conversation)
            .where(
                Conversation.session_id == session_id,
                Conversation.user_id == user_id,
                Conversation.role.in_(["user", "assistant"]),
            )
            .order_by(Conversation.timestamp.desc())
            .limit(6)
        )
        rounds = rounds_result.scalars().all()
        rounds.reverse()

        user_count = sum(1 for r in rounds if r.role == "user")
        assistant_count = sum(1 for r in rounds if r.role == "assistant")
        if user_count < 2 or assistant_count < 2:
            return

        dialog_text = ""
        for r in rounds:
            prefix = "用户" if r.role == "user" else "助手"
            dialog_text += f"{prefix}：{r.content}\n"

        client = get_llm_client()
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "请根据以下对话内容，生成一个 2-12 字的简短标题，概括对话主题。只输出标题文字，不要解释。"},
                {"role": "user", "content": dialog_text},
            ],
            temperature=0.5,
            max_tokens=30,
        )

        title = (response.choices[0].message.content or "").strip()
        title = title.strip('"').strip("'").strip("《》").strip()
        if len(title) > 50:
            title = title[:50]

        if not title:
            return

        first_msg = await db.execute(
            select(Conversation)
            .where(
                Conversation.session_id == session_id,
                Conversation.user_id == user_id,
            )
            .order_by(Conversation.timestamp)
            .limit(1)
        )
        first_conv = first_msg.scalar_one_or_none()
        if first_conv:
            first_conv.session_title = title
            await db.commit()
            print(f"[LLM] 会话标题已生成: {title}")
    except Exception as e:
        print(f"[LLM] 标题生成失败(可忽略): {e}")
    finally:
        await db.close()


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

    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="消息内容不能为空")

    client = get_llm_client()

    try:
        import re as _re
        message = _re.sub(r'[\u200b\u200c\u200d\u200e\u200f\ufeff\u00ad\u034f\u2060\u2061\u2062\u2063\u2064\u206a-\u206f]', '', request.message)
        if not message.strip():
            raise HTTPException(status_code=400, detail="消息内容不能为空")
        request.message = message
        print(f"[LLM] 收到消息: {request.message}")

        session_id = await _get_or_create_session(current_user.id, db, request.session_id)

        search_task = asyncio.create_task(
            asyncio.to_thread(
                vector_db.search_memories,
                current_user.id,
                request.message,
                10
            )
        )

        care_task_coro = _check_care(current_user.id, db)
        care_task = asyncio.create_task(care_task_coro)

        related_memories = await search_task
        care_suggestion, care_injected = await care_task

        web_search_context = ""
        web_search_query = None
        web_search_results = None
        search_trigger = needs_web_search(request.message)
        if search_trigger:
            web_search_query = extract_search_query_from_message(search_trigger)
            print(f"[WebSearch] 检测到实时信息需求: {web_search_query}")
            web_results = await web_searcher.search(web_search_query)
            if web_results:
                web_search_context = format_web_search_context(web_results)
                web_search_results = web_results
                print(f"[WebSearch] 注入 {len(web_results)} 条实时信息")

        memories_section = ""
        if related_memories:
            filtered = []
            for mem in related_memories:
                distance = mem.get("distance", 1.0)
                if distance > settings.MEMORY_DISTANCE_THRESHOLD:
                    continue
                importance = int(mem.get("metadata", {}).get("importance", 3))
                if importance < settings.MEMORY_MIN_IMPORTANCE:
                    continue
                filtered.append(mem)

            filtered.sort(key=lambda m: (
                -int(m.get("metadata", {}).get("importance", 3)),
                m.get("distance", 1.0)
            ))

            char_budget = settings.MEMORY_PROMPT_CHAR_LIMIT
            used_chars = 0
            selected = []
            for mem in filtered:
                content = mem["content"]
                entry_len = len(content) + 5
                if used_chars + entry_len > char_budget:
                    break
                selected.append(mem)
                used_chars += entry_len

            if selected:
                memories_section = "\n关于用户的记忆（请在进食陪伴对话中自然运用这些记忆）：\n"
                for i, mem in enumerate(selected, 1):
                    memories_section += f"{i}. {mem['content']}\n"
                print(f"[LLM] 注入 {len(selected)}/{len(related_memories)} 条记忆 (过滤: distance>{settings.MEMORY_DISTANCE_THRESHOLD} 或 importance<{settings.MEMORY_MIN_IMPORTANCE})")

        system_prompt = build_system_prompt(
            memories_section=memories_section,
            care_suggestion=care_suggestion,
            web_search_context=web_search_context
        )

        messages = [
            {"role": "system", "content": system_prompt}
        ]

        db_context = await _load_recent_context(current_user.id, db, session_id=session_id, limit=10)
        if db_context:
            messages.extend(db_context)
            print(f"[LLM] 从数据库加载 {len(db_context)} 条历史上下文")
        elif request.history:
            history = request.history[-10:] if request.history else []
            for msg in history:
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })

        messages.append({
            "role": "user",
            "content": request.message
        })

        if related_memories:
            print(f"[LLM] 检索到 {len(related_memories)} 条相关记忆")

        print(f"[LLM] 调用API, 模型: {settings.LLM_MODEL}, 消息数: {len(messages)}")

        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            temperature=0.8,
            max_tokens=300
        )

        assistant_message = response.choices[0].message.content

        if not assistant_message:
            print("[LLM] 警告: 模型返回空内容")
            assistant_message = "（模型未返回内容）"

        search_query = None
        search_results = None
        keyword_result, cleaned_message = extract_shiguangjian_keyword(assistant_message)
        if keyword_result:
            search_query = keyword_result
            assistant_message = cleaned_message
            print(f"[LLM] 食光鉴关键词: {keyword_result}")
        else:
            interest_patterns = [
                r'推荐.{0,4}(.{1,8}?)(?:的|相关|方面|主题|话题)?(?:视频|节目|内容|纪录片|电影|剧集)',
                r'(?:给我|帮我|能不能|可不可以|可否).{0,2}推荐(.{1,8}?)',
                r'推荐(.{1,8}?)(?:好吗|行吗|吧|一下)',
                r'对(.{1,6}?)(?:感兴趣|很有兴趣|挺感兴趣|比较感兴趣|有兴趣)',
                r'喜欢(.{1,6}?)(?:这个|这个话题|这方面|相关)',
                r'想(?:了解|学习|看看|知道|找|看)(.{1,8}?)',
                r'(?:有没有|有些什么|什么).{0,4}(.{1,8}?)(?:视频|节目|内容|纪录片|推荐)',
                r'《(.{1,12}?)》',
            ]
            combined_text = request.message + ' ' + assistant_message
            for pattern in interest_patterns:
                m = re.search(pattern, combined_text)
                if m:
                    kw = m.group(1).strip()
                    if kw and len(kw) >= 2:
                        keyword_result = kw
                        search_query = keyword_result
                        print(f"[食光鉴] 从对话中提取关键词: {keyword_result}")
                        break

            try:
                from core.search_engine import bilibili_searcher
                if settings.BILIBILI_SEARCH_ENABLED:
                    raw_results = await bilibili_searcher.search(keyword_result, limit=3)
                    search_results = [
                        VideoResult(
                            title=r["title"],
                            bvid=r.get("bvid", ""),
                            cover=r.get("cover", ""),
                            author=r.get("author", ""),
                            duration=r.get("duration", ""),
                            play_count=r.get("play_count", ""),
                            url=r.get("url", "")
                        )
                        for r in raw_results
                    ]
                    print(f"[LLM] 食光鉴搜索结果: {len(search_results)} 条")
            except Exception as e:
                print(f"[LLM] 食光鉴搜索失败(可忽略): {e}")

        print(f"[LLM] 助手回复: {assistant_message[:100]}...")

        user_msg = Conversation(user_id=current_user.id, role="user", content=request.message, session_id=session_id)
        assistant_msg = Conversation(user_id=current_user.id, role="assistant", content=assistant_message, session_id=session_id)
        db.add_all([user_msg, assistant_msg])
        await db.commit()
        print(f"[LLM] 对话记录已保存 (session: {session_id[:8]}...)")

        from core.database import AsyncSessionLocal
        task = asyncio.create_task(generate_session_title(session_id, current_user.id, AsyncSessionLocal()))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

        extracted_count = 0
        updated_count = 0
        deleted_count = 0
        try:
            existing = vector_db.get_user_memories(current_user.id, limit=20)

            result, used_fallback = await memory_extractor.extract_memories(
                user_message=request.message,
                assistant_message=assistant_message,
                existing_memories=existing,
                user_id=current_user.id
            )

            for mem in result.get("add", []):
                db_memory = Memory(
                    user_id=current_user.id,
                    content=mem["content"],
                    category=mem["category"],
                    importance=mem.get("importance", 3),
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
                extracted_count += 1

            for mem in result.get("update", []):
                memory_id = mem.get("id", "")
                if memory_id.startswith("memory_"):
                    memory_id = memory_id.replace("memory_", "")
                new_content = mem.get("content", "")
                new_category = mem.get("category")
                new_metadata = {}
                if new_category:
                    new_metadata["category"] = new_category
                if mem.get("importance"):
                    new_metadata["importance"] = mem["importance"]

                vector_db.update_memory(
                    memory_id=memory_id,
                    content=new_content,
                    metadata=new_metadata if new_metadata else None
                )

                try:
                    mid = int(memory_id)
                    db_mem = await db.execute(select(Memory).where(Memory.id == mid))
                    db_obj = db_mem.scalar_one_or_none()
                    if db_obj:
                        if new_content:
                            db_obj.content = new_content
                        if new_category:
                            db_obj.category = new_category
                        await db.commit()
                except Exception as e:
                    print(f"[LLM] 同步更新SQL记忆失败(可忽略): {e}")

                updated_count += 1
                print(f"[LLM] 更新记忆: {memory_id} -> {new_content}")

            for mem in result.get("delete", []):
                memory_id = mem.get("id", "")
                if memory_id.startswith("memory_"):
                    memory_id = memory_id.replace("memory_", "")

                vector_db.delete_memory(memory_id)

                try:
                    mid = int(memory_id)
                    from sqlalchemy import delete
                    await db.execute(delete(Memory).where(Memory.id == mid))
                    await db.commit()
                except Exception as e:
                    print(f"[LLM] 同步删除SQL记忆失败(可忽略): {e}")

                deleted_count += 1
                print(f"[LLM] 删除记忆: {memory_id}, 原因: {mem.get('reason', '')}")

            total_changes = extracted_count + updated_count + deleted_count
            if total_changes > 0:
                print(f"[LLM] 记忆变更: 新增={extracted_count}, 更新={updated_count}, 删除={deleted_count}")
        except Exception as e:
            print(f"[LLM] 记忆管理失败: {e}")
            traceback.print_exc()

        exit_keywords = ["不想聊了", "再见", "退下吧", "告辞", "拜拜", "下次再聊"]
        should_exit = any(keyword in request.message for keyword in exit_keywords)

        return ChatResponse(
            response=assistant_message,
            should_exit=should_exit,
            memories_added=extracted_count,
            memories_updated=updated_count,
            memories_deleted=deleted_count,
            care_injected=care_injected,
            search_query=search_query,
            search_results=search_results,
            session_id=session_id,
            web_search_query=web_search_query,
            web_search_results=web_search_results
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

    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="消息内容不能为空")

    client = get_llm_client()

    related_memories = vector_db.search_memories(
        user_id=current_user.id,
        query=request.message,
        n_results=10
    )

    memories_section = ""
    if related_memories:
        filtered = []
        for mem in related_memories:
            distance = mem.get("distance", 1.0)
            if distance > settings.MEMORY_DISTANCE_THRESHOLD:
                continue
            importance = int(mem.get("metadata", {}).get("importance", 3))
            if importance < settings.MEMORY_MIN_IMPORTANCE:
                continue
            filtered.append(mem)

        filtered.sort(key=lambda m: (
            -int(m.get("metadata", {}).get("importance", 3)),
            m.get("distance", 1.0)
        ))

        char_budget = settings.MEMORY_PROMPT_CHAR_LIMIT
        used_chars = 0
        selected = []
        for mem in filtered:
            content = mem["content"]
            entry_len = len(content) + 5
            if used_chars + entry_len > char_budget:
                break
            selected.append(mem)
            used_chars += entry_len

        if selected:
            memories_section = "\n关于用户的记忆（请在进食陪伴对话中自然运用这些记忆）：\n"
            for i, mem in enumerate(selected, 1):
                memories_section += f"{i}. {mem['content']}\n"

    care_suggestion = ""
    care_injected = False
    try:
        recent_memories = vector_db.get_user_memories(current_user.id, limit=10)
        if recent_memories:
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
                user_id=current_user.id,
                db=db
            )
            if care_result:
                care_suggestion = care_result.get("care_suggestion", "")
                care_injected = True
    except Exception:
        pass

    web_search_context = ""
    web_search_query = None
    web_search_results_data = None
    search_trigger = needs_web_search(request.message)
    if search_trigger:
        web_search_query = extract_search_query_from_message(search_trigger)
        print(f"[WebSearch] 检测到实时信息需求: {web_search_query}")
        try:
            web_results = await web_searcher.search(web_search_query)
            if web_results:
                web_search_context = format_web_search_context(web_results)
                web_search_results_data = web_results
                print(f"[WebSearch] 注入 {len(web_results)} 条实时信息到流式对话")
        except Exception as e:
            print(f"[WebSearch] 搜索失败(可忽略): {e}")

    system_prompt = build_system_prompt(
        memories_section=memories_section,
        care_suggestion=care_suggestion,
        web_search_context=web_search_context
    )

    session_id = await _get_or_create_session(current_user.id, db, request.session_id)

    messages = [
        {"role": "system", "content": system_prompt}
    ]

    db_context = await _load_recent_context(current_user.id, db, session_id=session_id, limit=10)
    if db_context:
        messages.extend(db_context)
    elif request.history:
        history = request.history[-10:] if request.history else []
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
                max_tokens=300,
                stream=True
            )

            buffer = ""
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    buffer += content

                    sentence_enders = re.compile(r'[。！？；…\.\!\?\;]')
                    matches = list(sentence_enders.finditer(buffer))
                    if matches:
                        last_match = matches[-1]
                        sentence = buffer[:last_match.end()]
                        buffer = buffer[last_match.end():]
                        sentence = re.sub(r'【食光鉴[^》]*?】', '', sentence)
                        if sentence.strip():
                            yield f"data: {json.dumps({'type': 'sentence', 'content': sentence})}\n\n"
                    else:
                        content_clean = re.sub(r'【食光鉴[^》]*?】', '', content)
                        if content_clean.strip():
                            yield f"data: {json.dumps({'type': 'text_chunk', 'content': content_clean})}\n\n"

            if buffer.strip():
                buffer_clean = re.sub(r'【食光鉴[^》]*?】', '', buffer)
                if buffer_clean.strip():
                    yield f"data: {json.dumps({'type': 'sentence', 'content': buffer_clean})}\n\n"

            web_keyword_result, web_cleaned_response = extract_web_search_keyword(full_response)
            keyword_result, cleaned_response = extract_shiguangjian_keyword(full_response)
            if web_keyword_result:
                cleaned_response = web_cleaned_response
                if keyword_result:
                    cleaned_response = re.sub(r'\n?【食光鉴[|｜].+?】', '', cleaned_response)
            display_response = cleaned_response if (keyword_result or web_keyword_result) else full_response

            if not keyword_result:
                interest_patterns = [
                    r'推荐.{0,4}(.{1,8}?)(?:的|相关|方面|主题|话题)?(?:视频|节目|内容|纪录片|电影|剧集)',
                    r'(?:给我|帮我|能不能|可不可以|可否).{0,2}推荐(.{1,8}?)',
                    r'推荐(.{1,8}?)(?:好吗|行吗|吧|一下)',
                    r'对(.{1,6}?)(?:感兴趣|很有兴趣|挺感兴趣|比较感兴趣|有兴趣)',
                    r'喜欢(.{1,6}?)(?:这个|这个话题|这方面|相关)',
                    r'想(?:了解|学习|看看|知道|找|看)(.{1,8}?)',
                    r'(?:有没有|有些什么|什么).{0,4}(.{1,8}?)(?:视频|节目|内容|纪录片|推荐)',
                    r'《(.{1,12}?)》',
                ]
                combined_text = request.message + ' ' + full_response
                for pattern in interest_patterns:
                    m = re.search(pattern, combined_text)
                    if m:
                        kw = m.group(1).strip()
                        if kw and len(kw) >= 2:
                            keyword_result = kw
                            print(f"[食光鉴] 从对话中提取关键词: {keyword_result}")
                            break

            yield f"data: {json.dumps({'type': 'text_done', 'full_text': display_response})}\n\n"

            if keyword_result:
                full_response = cleaned_response
                print(f"[食光鉴] 检测到关键词: {keyword_result}")
                try:
                    from core.search_engine import bilibili_searcher
                    if settings.BILIBILI_SEARCH_ENABLED:
                        raw_results = await bilibili_searcher.search(keyword_result, limit=3)
                        search_data = [
                            {
                                "title": r["title"],
                                "bvid": r.get("bvid", ""),
                                "cover": r.get("cover", ""),
                                "author": r.get("author", ""),
                                "duration": r.get("duration", ""),
                                "play_count": r.get("play_count", ""),
                                "url": r.get("url", "")
                            }
                            for r in raw_results
                        ]
                        print(f"[食光鉴] 搜索完成: {len(search_data)} 条结果")
                        yield f"data: {json.dumps({'type': 'search', 'search_query': keyword_result, 'search_results': search_data})}\n\n"
                    else:
                        print(f"[食光鉴] BILIBILI_SEARCH_ENABLED=False，跳过搜索")
                except Exception as e:
                    print(f"[食光鉴] 搜索失败: {e}")

            if care_injected:
                yield f"data: {json.dumps({'type': 'care', 'care_injected': True})}\n\n"

            if web_search_query and web_search_results_data:
                yield f"data: {json.dumps({'type': 'web_search', 'web_search_query': web_search_query, 'web_search_results': web_search_results_data})}\n\n"

            user_msg = Conversation(user_id=current_user.id, role="user", content=request.message, session_id=session_id)
            assistant_msg = Conversation(user_id=current_user.id, role="assistant", content=full_response, session_id=session_id)
            db.add_all([user_msg, assistant_msg])
            await db.commit()

            from core.database import AsyncSessionLocal
            task = asyncio.create_task(generate_session_title(session_id, current_user.id, AsyncSessionLocal()))
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

            try:
                existing = vector_db.get_user_memories(current_user.id, limit=20)
                result, used_fallback = await memory_extractor.extract_memories(
                    user_message=request.message,
                    assistant_message=full_response,
                    existing_memories=existing,
                    user_id=current_user.id
                )

                for mem in result.get("add", []):
                    db_memory = Memory(
                        user_id=current_user.id,
                        content=mem["content"],
                        category=mem["category"],
                        importance=mem.get("importance", 3),
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

                for mem in result.get("update", []):
                    memory_id = mem.get("id", "")
                    if memory_id.startswith("memory_"):
                        memory_id = memory_id.replace("memory_", "")
                    vector_db.update_memory(
                        memory_id=memory_id,
                        content=mem.get("content"),
                        metadata={"category": mem.get("category"), "importance": mem.get("importance")} if mem.get("category") else None
                    )

                for mem in result.get("delete", []):
                    memory_id = mem.get("id", "")
                    if memory_id.startswith("memory_"):
                        memory_id = memory_id.replace("memory_", "")
                    vector_db.delete_memory(memory_id)
                    try:
                        mid = int(memory_id)
                        from sqlalchemy import delete
                        await db.execute(delete(Memory).where(Memory.id == mid))
                        await db.commit()
                    except Exception:
                        pass

            except Exception as e:
                print(f"[LLM Stream] 记忆管理失败: {e}")

            yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/history")
async def get_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if session_id:
        result = await db.execute(
            select(Conversation)
            .where(Conversation.user_id == current_user.id, Conversation.session_id == session_id)
            .order_by(desc(Conversation.timestamp))
            .offset(offset)
            .limit(limit)
        )
    else:
        result = await db.execute(
            select(Conversation)
            .where(Conversation.user_id == current_user.id, Conversation.role.in_(["user", "assistant"]))
            .order_by(desc(Conversation.timestamp))
            .offset(offset)
            .limit(limit)
        )

    rows = result.scalars().all()
    rows.reverse()

    count_result = await db.execute(
        select(sql_func.count(Conversation.id))
        .where(Conversation.user_id == current_user.id, Conversation.role.in_(["user", "assistant"]))
    )
    total = count_result.scalar() or 0

    return {
        "conversations": [
            {
                "id": row.id,
                "role": row.role,
                "content": row.content,
                "session_id": row.session_id,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "metadata": row.metadata_
            }
            for row in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/sessions")
async def get_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(
            Conversation.session_id,
            sql_func.max(Conversation.timestamp).label("last_time"),
            sql_func.count(Conversation.id).label("msg_count"),
        )
        .where(
            Conversation.user_id == current_user.id,
            Conversation.session_id.isnot(None)
        )
        .group_by(Conversation.session_id)
        .order_by(desc("last_time"))
        .limit(limit)
    )
    session_rows = result.all()

    sessions = []
    for row in session_rows:
        preview_result = await db.execute(
            select(Conversation.content)
            .where(
                Conversation.user_id == current_user.id,
                Conversation.session_id == row.session_id,
                Conversation.role == "user"
            )
            .order_by(Conversation.timestamp)
            .limit(1)
        )
        preview_row = preview_result.first()
        preview = (preview_row[0][:50] + "...") if preview_row and len(preview_row[0]) > 50 else (preview_row[0] if preview_row else "")

        title_result = await db.execute(
            select(Conversation.session_title)
            .where(
                Conversation.user_id == current_user.id,
                Conversation.session_id == row.session_id,
                Conversation.session_title.isnot(None),
            )
            .limit(1)
        )
        title_row = title_result.first()
        title = title_row[0] if title_row else ""

        sessions.append(SessionInfo(
            session_id=row.session_id,
            last_message_time=row.last_time,
            message_count=row.msg_count,
            preview=preview,
            title=title or ""
        ))

    return {"sessions": [s.model_dump() for s in sessions]}


@router.get("/sessions/{session_id}")
async def get_session_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id, Conversation.session_id == session_id)
        .order_by(Conversation.timestamp)
    )
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail="会话不存在")

    title = ""
    for row in rows:
        if row.session_title:
            title = row.session_title
            break

    return {
        "session_id": session_id,
        "title": title,
        "conversations": [
            {
                "id": row.id,
                "role": row.role,
                "content": row.content,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "metadata": row.metadata_
            }
            for row in rows
        ]
    }


@router.delete("/history")
async def clear_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await db.execute(
        delete(Conversation).where(Conversation.user_id == current_user.id)
    )
    await db.commit()
    return {"message": "对话历史已清空"}


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id, Conversation.session_id == session_id)
    )
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="会话不存在")

    await db.execute(
        delete(Conversation).where(
            Conversation.user_id == current_user.id,
            Conversation.session_id == session_id
        )
    )
    await db.commit()
    return {"message": "会话已删除", "session_id": session_id}
