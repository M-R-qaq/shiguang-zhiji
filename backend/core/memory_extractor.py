from typing import List, Dict, Optional, Tuple
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
import json
import re
from datetime import datetime, timedelta
from core.config import settings
from core.vector_db import vector_db


class MemoryExtractor:
    """记忆提取器 - 从对话中提取重要用户信息"""

    CATEGORIES = {
        "personal_info": "个人信息（姓名、年龄、职业、爱好等）",
        "food_preference": "饮食偏好（喜欢的食物、口味、忌口、饮食习惯等）",
        "health": "健康信息（身体状况、疾病、用药等）",
        "emotion": "情绪状态（心情、压力、烦恼等）",
        "event": "重要事件（生日、纪念日、旅行等）",
        "preference": "偏好信息（喜欢的音乐、电影、书籍等，食物偏好请归入food_preference）",
        "relationship": "人际关系（家人、朋友、同事等）",
        "work_study": "工作学习（工作内容、学习进度等）",
        "general": "其他重要信息"
    }

    EXPIRABLE_CATEGORIES = {"emotion", "event", "health"}
    STABLE_CATEGORIES = {"personal_info", "food_preference", "preference", "relationship", "work_study"}

    def __init__(self):
        self.client = None
        if settings.OPENAI_API_KEY:
            try:
                self.client = AsyncOpenAI(
                    api_key=settings.OPENAI_API_KEY,
                    base_url=settings.OPENAI_BASE_URL
                )
                print("[MemoryExtractor] OpenAI 客户端初始化成功")
            except Exception as e:
                print(f"[MemoryExtractor] OpenAI 客户端初始化失败: {e}")

    def _simple_keyword_extraction(self, text: str) -> Dict:
        """
        基于关键词的简单记忆提取（无API时的回退方案）
        """
        add_memories = []
        delete_keywords = []
        text_lower = text.lower()

        recovery_keywords = ["好了", "康复了", "痊愈了", "没事了", "恢复了", "不疼了", "不痛了", "出院了"]
        health_keywords = [
            "不舒服", "不太舒服", "很不舒服",
            "生病", "感冒", "发烧", "头疼", "头痛",
            "胃痛", "胃不舒服", "胃不太舒服", "胃难受",
            "过敏", "吃药", "医院", "体检", "难受",
        ]
        for keyword in recovery_keywords:
            if keyword in text_lower:
                delete_keywords.append({"query": keyword, "category": "health"})
                break

        health_found = False
        for keyword in health_keywords:
            if keyword in text_lower:
                add_memories.append({
                    "content": f"用户提到{keyword}",
                    "category": "health",
                    "importance": 3
                })
                health_found = True
                break

        if not health_found:
            food_keywords = ["爱吃", "不喜欢吃", "忌口", "素食", "辣", "清淡", "口味", "好吃", "难吃", "想吃"]
            for keyword in food_keywords:
                if keyword in text_lower:
                    pattern = f"{keyword}([^，。,.!！?？]*)"
                    match = re.search(pattern, text)
                    if match:
                        detail = match.group(1).strip()[:50]
                        add_memories.append({
                            "content": f"用户饮食偏好：{keyword}{detail}",
                            "category": "food_preference",
                            "importance": 2
                        })
                    else:
                        add_memories.append({
                            "content": f"用户饮食偏好：{keyword}",
                            "category": "food_preference",
                            "importance": 2
                        })
                    break

            meal_emotion_keywords = ["吃不下", "没胃口", "吃撑了", "好饿"]
            for keyword in meal_emotion_keywords:
                if keyword in text_lower:
                    add_memories.append({
                        "content": f"用户用餐状态：{keyword}",
                        "category": "food_preference",
                        "importance": 3
                    })
                    break

        emotion_keywords = ["开心", "难过", "压力", "焦虑", "抑郁", "烦躁", "生气", "郁闷", "无聊", "累"]
        for keyword in emotion_keywords:
            if keyword in text_lower:
                add_memories.append({
                    "content": f"用户提到心情或状态：{keyword}",
                    "category": "emotion",
                    "importance": 3
                })
                break

        preference_keywords = ["喜欢", "爱好", "讨厌", "不喜欢", "偏爱"]
        for keyword in preference_keywords:
            if keyword in text_lower:
                pattern = f"{keyword}([^，。,.!！?？]*)"
                match = re.search(pattern, text)
                if match:
                    detail = match.group(1).strip()[:50]
                    add_memories.append({
                        "content": f"用户{keyword}{detail}",
                        "category": "preference",
                        "importance": 2
                    })
                break

        event_keywords = ["生日", "约会", "聚会", "旅行", "结婚", "纪念日", "考试", "面试"]
        for keyword in event_keywords:
            if keyword in text_lower:
                add_memories.append({
                    "content": f"用户提到重要事件：{keyword}",
                    "category": "event",
                    "importance": 4
                })
                break

        return {
            "add": add_memories,
            "update": [],
            "delete": delete_keywords
        }

    async def extract_memories(
        self,
        user_message: str,
        assistant_message: str,
        existing_memories: List[Dict] = None,
        user_id: int = None
    ) -> Tuple[Dict, bool]:
        """
        从对话轮次中提取重要记忆，支持新增、更新、删除操作

        Args:
            user_message: 用户消息
            assistant_message: AI回复
            existing_memories: 已存在的记忆列表
            user_id: 用户ID

        Returns:
            (记忆操作字典, 是否使用了备用方案)
            操作字典结构: {"add": [...], "update": [...], "delete": [...]}
        """
        used_fallback = False

        if not user_message or len(user_message.strip()) < 2:
            return {"add": [], "update": [], "delete": []}, used_fallback

        try:
            if self.client:
                result = await self._llm_extract(user_message, assistant_message, existing_memories)
            else:
                print("[MemoryExtractor] 使用关键词提取作为备用方案")
                result = self._simple_keyword_extraction(user_message)
                used_fallback = True

            original_count = len(result.get("add", []))
            if result.get("add") and (existing_memories or user_id):
                result["add"] = await self._deduplicate_memories(
                    result["add"],
                    existing_memories,
                    user_id
                )
            final_count = len(result.get("add", []))
            if original_count != final_count:
                print(f"[MemoryExtractor] 去重完成: {original_count} -> {final_count} 条")

            result["add"] = self._assess_importance(result.get("add", []))

            add_count = len(result.get("add", []))
            update_count = len(result.get("update", []))
            delete_count = len(result.get("delete", []))
            print(f"[MemoryExtractor] 记忆操作: 新增={add_count}, 更新={update_count}, 删除={delete_count}")

            if add_count:
                for mem in result["add"]:
                    print(f"  + [{mem.get('category')}] {mem.get('content')} (重要性: {mem.get('importance')})")
            if update_count:
                for mem in result["update"]:
                    print(f"  ~ [id:{mem.get('id')}] {mem.get('content')}")
            if delete_count:
                for mem in result["delete"]:
                    print(f"  - [id:{mem.get('id')}] 原因: {mem.get('reason', '')}")

            return result, used_fallback

        except Exception as e:
            print(f"[MemoryExtractor] 记忆提取失败，使用备用方案: {e}")
            try:
                result = self._simple_keyword_extraction(user_message)
                used_fallback = True
                return result, used_fallback
            except Exception as e2:
                print(f"[MemoryExtractor] 备用方案也失败: {e2}")
                return {"add": [], "update": [], "delete": []}, True

    async def _llm_extract(
        self,
        user_message: str,
        assistant_message: str,
        existing_memories: List[Dict] = None
    ) -> Dict:
        """使用 LLM 提取记忆，返回包含 add/update/delete 操作的字典"""
        category_desc = "\n".join([f"- {k}: {v}" for k, v in self.CATEGORIES.items()])

        existing_content = ""
        if existing_memories:
            existing_content = "已有的记忆：\n"
            for i, mem in enumerate(existing_memories[:15]):
                content = mem.get('content', '') or mem.get('metadata', {}).get('content', '')
                mem_id = mem.get('id', '')
                if content:
                    existing_content += f"{i+1}. [id:{mem_id}] {content}\n"

        prompt = f"""你是一个智能记忆管理助手。你需要根据对话内容，管理用户的记忆。

对话内容：
用户: {user_message}
AI: {assistant_message}

{existing_content}

记忆分类：
{category_desc}

请分析对话，执行以下记忆管理操作：

1. **add**（新增）：从对话中提取关于用户的新的事实信息（已有记忆绝对不要重复添加！）
2. **update**（更新）：用户的信息发生了变化，需要更新已有记忆（如：感冒好了→更新健康状态）
3. **delete**（删除）：某条记忆已经过时或不再准确（如：用户说之前的病已经好了）

重要规则：
- 只提取关于用户的客观事实
- 每个记忆简洁清晰（一句话）
- 给每个记忆打分：1=不重要 5=非常重要
- 选择最合适的分类
- 饮食相关的偏好、忌口、习惯应归入 food_preference 分类
- 特别关注用户在用餐场景中透露的信息：饮食偏好和忌口、用餐习惯和节奏、对食物的评价和感受
- update 和 delete 必须指定已有记忆的 id
- update 时提供新的 content 替换旧内容
- 最重要：如果某条信息已经在"已有的记忆"列表中，绝对不要在 add 中再次添加！对于语义相似的信息，应该使用 update 而不是 add！

请以JSON格式返回：
{{
    "add": [
        {{"content": "新记忆内容", "category": "分类key", "importance": 1-5}}
    ],
    "update": [
        {{"id": "已有记忆id", "content": "更新后的内容", "category": "分类key", "importance": 1-5}}
    ],
    "delete": [
        {{"id": "要删除的记忆id", "reason": "删除原因"}}
    ]
}}

如果没有需要执行的操作，返回 {{"add": [], "update": [], "delete": []}}"""

        response = await self.client.chat.completions.create(
            model=settings.LLM_MODEL or "gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "你是一个专业的记忆管理助手。只返回JSON格式数据。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=800,
            response_format={"type": "json_object"}
        )

        result_text = response.choices[0].message.content
        result = json.loads(result_text)

        return {
            "add": result.get("add", []),
            "update": result.get("update", []),
            "delete": result.get("delete", [])
        }

    async def _deduplicate_memories(
        self,
        new_memories: List[Dict],
        existing_memories: List[Dict] = None,
        user_id: int = None
    ) -> List[Dict]:
        """记忆去重"""
        if not new_memories:
            return []

        deduplicated = []

        # 构建已存在记忆的内容列表
        existing_contents = set()
        if existing_memories:
            for mem in existing_memories:
                content = mem.get('content', '') or mem.get('metadata', {}).get('content', '')
                if content:
                    existing_contents.add(content.lower().strip())

        # 如果有 user_id，使用向量搜索进行去重
        duplicate_marks = set()
        if user_id:
            try:
                for idx, new_mem in enumerate(new_memories):
                    new_content = new_mem.get('content', '').lower().strip()
                    if not new_content:
                        continue
                    
                    similar = vector_db.search_memories(
                        user_id=user_id,
                        query=new_mem['content'],
                        n_results=5
                    )
                    for sim_mem in similar:
                        distance = sim_mem.get('distance', 1.0)
                        existing_content = sim_mem.get('content', '').lower().strip()
                        if distance < 0.4:  # 阈值调大，更宽松
                            print(f"[MemoryExtractor] 向量去重匹配: 新记忆='{new_content}', 已有='{existing_content}', 距离={distance:.4f}")
                            duplicate_marks.add(idx)
                            break
            except Exception as e:
                print(f"[MemoryExtractor] 向量去重失败: {e}")

        # 去重
        for idx, mem in enumerate(new_memories):
            content = mem.get('content', '').lower().strip()
            if not content:
                continue

            # 检查内容完全重复
            if content in existing_contents:
                print(f"[MemoryExtractor] 发现重复记忆（完全匹配），跳过: {content}")
                continue

            # 检查包含关系（子字符串匹配）
            is_substring = False
            for existing_content in existing_contents:
                if content in existing_content or existing_content in content:
                    print(f"[MemoryExtractor] 发现包含重复: 新='{content}' 包含于='{existing_content}'")
                    is_substring = True
                    break
            if is_substring:
                continue

            # 检查向量去重
            if idx in duplicate_marks:
                print(f"[MemoryExtractor] 发现重复记忆（向量匹配），跳过: {content}")
                continue

            # 检查新记忆之间的重复
            is_duplicate = False
            for existing_mem in deduplicated:
                if existing_mem.get('content', '').lower().strip() == content:
                    is_duplicate = True
                    break

            if not is_duplicate:
                deduplicated.append(mem)

        return deduplicated

    def _assess_importance(self, memories: List[Dict]) -> List[Dict]:
        """评估记忆重要性"""
        for mem in memories:
            # 如果已有重要性评分，保留
            if 'importance' in mem and mem['importance']:
                continue

            content = mem.get('content', '').lower()
            importance = 3  # 默认中等重要

            # 高重要性关键词
            high_importance_keywords = ["生病", "住院", "手术", "癌症", "抑郁", "自杀", "分手", "离婚", "失业", "吃不下"]
            for keyword in high_importance_keywords:
                if keyword in content:
                    importance = 5
                    break

            if importance == 3:
                mid_high_keywords = ["生日", "纪念日", "面试", "考试", "压力", "焦虑", "没胃口", "忌口"]
                for keyword in mid_high_keywords:
                    if keyword in content:
                        importance = 4
                        break

            # 低重要性关键词
            if importance == 3:
                low_keywords = ["喜欢", "爱好", "喜欢吃"]
                for keyword in low_keywords:
                    if keyword in content:
                        importance = 2
                        break

            mem['importance'] = importance

        return memories

    async def should_care(self, memories: List[Dict], user_id: int, db: AsyncSession = None) -> Optional[Dict]:
        """
        判断是否应该主动关怀用户

        Args:
            memories: 相关记忆列表
            user_id: 用户ID
            db: 数据库会话（用于查询 cared_at 时间戳）

        Returns:
            如果应该关怀，返回关怀建议；否则返回None
        """
        if not memories:
            return None

        try:
            if db:
                from models.user import Memory
                last_cared = await db.execute(
                    select(Memory.cared_at)
                    .where(Memory.user_id == user_id, Memory.cared_at != None)
                    .order_by(Memory.cared_at.desc())
                    .limit(1)
                )
                last_cared_result = last_cared.scalar_one_or_none()
                if last_cared_result:
                    time_since_care = datetime.now(last_cared_result.tzinfo) - last_cared_result
                    if time_since_care < timedelta(hours=24):
                        print(f"[MemoryExtractor] 24小时内已关怀过，跳过")
                        return None

            important_memories = []
            for mem in memories:
                content = mem.get('content', '')
                if not content:
                    content = mem.get('metadata', {}).get('content', '')
                if content:
                    important_memories.append(content)

            if not important_memories:
                for mem in memories:
                    content = str(mem.get('content', '') or mem.get('metadata', {}).get('content', ''))
                    content_lower = content.lower()

                    health_keywords = ["不舒服", "生病", "感冒", "发烧", "疼", "痛", "医院", "吃不下", "没胃口"]
                    for keyword in health_keywords:
                        if keyword in content_lower:
                            return {
                                "should_care": True,
                                "care_type": "health",
                                "care_topic": f"用户提到{keyword}",
                                "care_suggestion": "用餐时可否好些了？记得多喝些热汤暖身。"
                            }

                    emotion_keywords = ["难过", "不开心", "压力", "焦虑", "抑郁", "烦躁", "生气", "郁闷", "累", "一个人吃"]
                    for keyword in emotion_keywords:
                        if keyword in content_lower:
                            return {
                                "should_care": True,
                                "care_type": "emotion",
                                "care_topic": f"用户提到{keyword}",
                                "care_suggestion": "一个人吃饭也要好好对待自己，我陪你便是。"
                            }

                return None

            if self.client:
                memories_text = "\n".join([f"- {m}" for m in important_memories[:5]])

                prompt = f"""你是苏怀真的关怀助手。苏怀真是一位进食陪伴者，在用户用餐时陪伴左右。
请根据用户的记忆，判断是否应该主动关怀用户。

用户记忆：
{memories_text}

请分析：
1. 是否有需要关怀的内容（健康问题、情绪低落、重要事件、用餐状态异常等）
2. 关怀应以餐桌上的温暖关心为主，简短1-2句话

以JSON格式返回：
{{
    "should_care": true/false,
    "care_type": "health/emotion/event/other",
    "care_topic": "关怀主题",
    "care_suggestion": "以苏怀真口吻说的1-2句关怀话语"
}}"""

                response = await self.client.chat.completions.create(
                    model=settings.LLM_MODEL or "gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": "你是苏怀真的关怀助手，苏怀真是一位进食陪伴者。只返回JSON格式数据。"},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.5,
                    max_tokens=300,
                    response_format={"type": "json_object"}
                )

                result = json.loads(response.choices[0].message.content)

                if result.get("should_care"):
                    print(f"[MemoryExtractor] LLM建议关怀: {result.get('care_topic')}")

                    if db:
                        try:
                            from models.user import Memory
                            cared_memories = await db.execute(
                                select(Memory)
                                .where(Memory.user_id == user_id)
                                .order_by(Memory.created_at.desc())
                                .limit(3)
                            )
                            for mem_obj in cared_memories.scalars().all():
                                mem_obj.is_cared = True
                                mem_obj.cared_at = datetime.now()
                            await db.commit()
                        except Exception as e:
                            print(f"[MemoryExtractor] 更新cared_at失败: {e}")

                    return result

            return None

        except Exception as e:
            print(f"[MemoryExtractor] 关怀判断失败: {e}")
            return None

    async def cleanup_user_memories(self, user_id: int, db: AsyncSession = None) -> Dict:
        """
        用户记忆生命周期管理：过期清理 + 容量限制 + 同类合并

        Returns:
            清理统计 {"expired": N, "capped": N, "merged": N}
        """
        from models.user import Memory
        stats = {"expired": 0, "capped": 0, "merged": 0}

        if not db:
            return stats

        try:
            now = datetime.now()

            expired_result = await db.execute(
                select(Memory).where(
                    Memory.user_id == user_id,
                    Memory.is_active == True
                )
            )
            all_memories = expired_result.scalars().all()

            for mem in all_memories:
                category = mem.category or "general"
                importance = mem.importance or 3

                should_expire = False
                if category in self.EXPIRABLE_CATEGORIES and importance < 4:
                    if mem.created_at:
                        age = now - mem.created_at.replace(tzinfo=None)
                        if importance <= 2 and age > timedelta(days=7):
                            should_expire = True
                        elif importance == 3 and age > timedelta(days=30):
                            should_expire = True

                if should_expire:
                    mem.is_active = False
                    stats["expired"] += 1
                    try:
                        memory_id = str(mem.id)
                        vector_db.delete_memory(memory_id)
                    except Exception:
                        pass

            if stats["expired"] > 0:
                await db.commit()
                print(f"[MemoryLifecycle] 用户{user_id}: 过期清理 {stats['expired']} 条")

            active_count = sum(1 for m in all_memories if m.is_active)
            max_memories = settings.MEMORY_MAX_PER_USER

            if active_count > max_memories:
                active_memories = [m for m in all_memories if m.is_active]
                active_memories.sort(key=lambda m: (
                    0 if (m.category or "general") in self.STABLE_CATEGORIES else 1,
                    -(m.importance or 3),
                    m.created_at or now
                ))

                to_remove = active_memories[:active_count - max_memories]
                for mem in to_remove:
                    mem.is_active = False
                    stats["capped"] += 1
                    try:
                        vector_db.delete_memory(str(mem.id))
                    except Exception:
                        pass

                if stats["capped"] > 0:
                    await db.commit()
                    print(f"[MemoryLifecycle] 用户{user_id}: 容量裁剪 {stats['capped']} 条")

            stats["merged"] = await self._merge_similar_memories(user_id, db)

            if sum(stats.values()) > 0:
                print(f"[MemoryLifecycle] 用户{user_id} 清理完成: 过期={stats['expired']}, 裁剪={stats['capped']}, 合并={stats['merged']}")

            return stats

        except Exception as e:
            print(f"[MemoryLifecycle] 清理失败: {e}")
            return stats

    async def _merge_similar_memories(self, user_id: int, db: AsyncSession) -> int:
        """
        合并同一分类下的相似记忆，减少记忆总数
        例如: "用户爱吃辣" + "用户口味偏辣" → "用户偏好辣味食物"
        """
        from models.user import Memory
        merged_count = 0

        if not self.client:
            return merged_count

        try:
            result = await db.execute(
                select(Memory).where(
                    Memory.user_id == user_id,
                    Memory.is_active == True
                )
            )
            all_memories = result.scalars().all()

            category_groups = {}
            for mem in all_memories:
                cat = mem.category or "general"
                if cat not in category_groups:
                    category_groups[cat] = []
                category_groups[cat].append(mem)

            for category, mems in category_groups.items():
                if len(mems) < 3:
                    continue

                pairs_to_merge = []
                checked = set()

                for i, mem_a in enumerate(mems):
                    if i in checked:
                        continue
                    similar = [mem_a]

                    try:
                        search_results = vector_db.search_memories(
                            user_id=user_id,
                            query=mem_a.content,
                            n_results=5
                        )
                        for result_item in search_results:
                            distance = result_item.get("distance", 1.0)
                            if distance < 0.3 and distance > 0.01:
                                rid = result_item["id"]
                                if rid.startswith("memory_"):
                                    rid = rid.replace("memory_", "")
                                for j, mem_b in enumerate(mems):
                                    if j != i and j not in checked and str(mem_b.id) == rid:
                                        similar.append(mem_b)
                                        checked.add(j)
                    except Exception:
                        continue

                    if len(similar) >= 2:
                        pairs_to_merge.append(similar)
                        checked.add(i)

                for group in pairs_to_merge:
                    if len(group) < 2:
                        continue

                    contents = [m.content for m in group if m.content]
                    if len(contents) < 2:
                        continue

                    try:
                        merge_prompt = f"""将以下多条相似记忆合并为一条简洁的记忆，保留所有关键信息：
{chr(10).join(f'- {c}' for c in contents)}

只输出合并后的一句话记忆内容，不要解释。"""

                        response = await self.client.chat.completions.create(
                            model=settings.LLM_MODEL or "gpt-3.5-turbo",
                            messages=[
                                {"role": "system", "content": "你是记忆合并助手。输出简洁的一句话。"},
                                {"role": "user", "content": merge_prompt}
                            ],
                            temperature=0.2,
                            max_tokens=100,
                        )

                        merged_content = response.choices[0].message.content.strip()
                        if not merged_content or len(merged_content) < 5:
                            continue

                        keeper = group[0]
                        keeper.content = merged_content
                        vector_db.update_memory(
                            memory_id=str(keeper.id),
                            content=merged_content
                        )

                        for mem in group[1:]:
                            mem.is_active = False
                            try:
                                vector_db.delete_memory(str(mem.id))
                            except Exception:
                                pass
                            merged_count += 1

                    except Exception as e:
                        print(f"[MemoryLifecycle] 合并失败: {e}")
                        continue

            if merged_count > 0:
                await db.commit()

            return merged_count

        except Exception as e:
            print(f"[MemoryLifecycle] 合并流程失败: {e}")
            return merged_count


# 全局实例
memory_extractor = MemoryExtractor()
