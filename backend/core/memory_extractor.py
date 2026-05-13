from typing import List, Dict, Optional, Tuple
from openai import AsyncOpenAI
import json
import re
from datetime import datetime
from core.config import settings
from core.vector_db import vector_db


class MemoryExtractor:
    """记忆提取器 - 从对话中提取重要用户信息"""

    # 记忆分类
    CATEGORIES = {
        "personal_info": "个人信息（姓名、年龄、职业、爱好等）",
        "health": "健康信息（身体状况、疾病、用药等）",
        "emotion": "情绪状态（心情、压力、烦恼等）",
        "event": "重要事件（生日、纪念日、旅行等）",
        "preference": "偏好信息（喜欢的食物、音乐、电影等）",
        "relationship": "人际关系（家人、朋友、同事等）",
        "work_study": "工作学习（工作内容、学习进度等）",
        "general": "其他重要信息"
    }

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

    def _simple_keyword_extraction(self, text: str) -> List[Dict]:
        """
        基于关键词的简单记忆提取（无API时的回退方案）
        """
        memories = []
        text_lower = text.lower()

        # 健康相关关键词
        health_keywords = ["不舒服", "生病", "感冒", "发烧", "头疼", "胃痛", "过敏", "吃药", "医院", "体检"]
        for keyword in health_keywords:
            if keyword in text_lower:
                memories.append({
                    "content": f"用户提到{keyword}",
                    "category": "health",
                    "importance": 3
                })
                break

        # 情绪相关关键词
        emotion_keywords = ["开心", "难过", "压力", "焦虑", "抑郁", "烦躁", "生气", "郁闷", "无聊", "累"]
        for keyword in emotion_keywords:
            if keyword in text_lower:
                memories.append({
                    "content": f"用户提到心情或状态：{keyword}",
                    "category": "emotion",
                    "importance": 3
                })
                break

        # 偏好相关关键词
        preference_keywords = ["喜欢", "爱吃", "爱好", "讨厌", "不喜欢", "偏爱"]
        for keyword in preference_keywords:
            if keyword in text_lower:
                # 提取关键词附近的内容
                pattern = f"{keyword}([^，。,.!！?？]*)"
                match = re.search(pattern, text)
                if match:
                    detail = match.group(1).strip()[:50]
                    memories.append({
                        "content": f"用户{keyword}{detail}",
                        "category": "preference",
                        "importance": 2
                    })
                break

        # 事件相关关键词
        event_keywords = ["生日", "约会", "聚会", "旅行", "结婚", "纪念日", "考试", "面试"]
        for keyword in event_keywords:
            if keyword in text_lower:
                memories.append({
                    "content": f"用户提到重要事件：{keyword}",
                    "category": "event",
                    "importance": 4
                })
                break

        return memories

    async def extract_memories(
        self,
        user_message: str,
        assistant_message: str,
        existing_memories: List[Dict] = None,
        user_id: int = None
    ) -> Tuple[List[Dict], bool]:
        """
        从对话轮次中提取重要记忆

        Args:
            user_message: 用户消息
            assistant_message: AI回复
            existing_memories: 已存在的记忆列表（用于去重）
            user_id: 用户ID（用于向量去重检查）

        Returns:
            (提取的记忆列表, 是否使用了备用方案)
        """
        used_fallback = False

        if not user_message or len(user_message.strip()) < 2:
            return [], used_fallback

        try:
            # 优先使用 LLM 提取
            if self.client:
                memories = await self._llm_extract(user_message, assistant_message, existing_memories)
            else:
                # 回退到关键词提取
                print("[MemoryExtractor] 使用关键词提取作为备用方案")
                memories = self._simple_keyword_extraction(user_message)
                used_fallback = True

            # 去重处理
            if memories and (existing_memories or user_id):
                memories = await self._deduplicate_memories(
                    memories,
                    existing_memories,
                    user_id
                )

            # 重要性评估
            memories = self._assess_importance(memories)

            print(f"[MemoryExtractor] 最终提取到 {len(memories)} 条记忆")
            for mem in memories:
                print(f"  - [{mem.get('category')}] {mem.get('content')} (重要性: {mem.get('importance')})")

            return memories, used_fallback

        except Exception as e:
            print(f"[MemoryExtractor] 记忆提取失败，使用备用方案: {e}")
            try:
                # 最终回退：关键词提取
                memories = self._simple_keyword_extraction(user_message)
                used_fallback = True
                return memories, used_fallback
            except Exception as e2:
                print(f"[MemoryExtractor] 备用方案也失败: {e2}")
                return [], True

    async def _llm_extract(
        self,
        user_message: str,
        assistant_message: str,
        existing_memories: List[Dict] = None
    ) -> List[Dict]:
        """使用 LLM 提取记忆"""
        category_desc = "\n".join([f"- {k}: {v}" for k, v in self.CATEGORIES.items()])

        existing_content = ""
        if existing_memories:
            existing_content = "已存在的记忆（不要重复提取）：\n"
            for mem in existing_memories[:10]:
                content = mem.get('content', '') or mem.get('metadata', {}).get('content', '')
                if content:
                    existing_content += f"- {content}\n"

        prompt = f"""你是一个智能记忆提取助手。你的任务是从用户和AI的对话中提取关于用户的重要信息作为记忆。

对话内容：
用户: {user_message}
AI: {assistant_message}

{existing_content}

记忆分类：
{category_desc}

请提取记忆，要求：
1. 只提取关于用户的客观事实信息
2. 不要提取主观推测或无关内容
3. 每个记忆要简洁清晰（一句话）
4. 给每个记忆打分：1=不重要 5=非常重要
5. 选择最合适的分类

请以JSON格式返回结果：
{{
    "memories": [
        {{
            "content": "记忆内容",
            "category": "分类key",
            "importance": 1-5
        }}
    ]
}}

如果没有可提取的记忆，返回 {{"memories": []}}
"""

        # 调用 LLM
        response = await self.client.chat.completions.create(
            model=settings.LLM_MODEL or "gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "你是一个专业的记忆提取助手。只返回JSON格式数据。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=500,
            response_format={"type": "json_object"}
        )

        result_text = response.choices[0].message.content
        result = json.loads(result_text)

        return result.get("memories", [])

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
        vector_existing_contents = set()
        if user_id:
            try:
                for new_mem in new_memories:
                    # 搜索相似度超过阈值的已有记忆
                    similar = vector_db.search_memories(
                        user_id=user_id,
                        query=new_mem['content'],
                        n_results=3
                    )
                    for sim_mem in similar:
                        # 相似度距离小于阈值认为是重复
                        distance = sim_mem.get('distance', 1.0)
                        if distance < 0.2:  # 阈值可以调整
                            content = sim_mem.get('content', '')
                            vector_existing_contents.add(content.lower().strip())
            except Exception as e:
                print(f"[MemoryExtractor] 向量去重失败，使用简单去重: {e}")

        # 去重
        for mem in new_memories:
            content = mem.get('content', '').lower().strip()
            if not content:
                continue

            # 检查内容重复
            if content in existing_contents:
                print(f"[MemoryExtractor] 发现重复记忆（简单匹配），跳过: {content}")
                continue

            # 检查向量去重
            if content in vector_existing_contents:
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
            high_importance_keywords = ["生病", "住院", "手术", "癌症", "抑郁", "自杀", "分手", "离婚", "失业"]
            for keyword in high_importance_keywords:
                if keyword in content:
                    importance = 5
                    break

            # 中高重要性关键词
            if importance == 3:
                mid_high_keywords = ["生日", "纪念日", "面试", "考试", "压力", "焦虑"]
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

    async def should_care(self, memories: List[Dict], user_id: int) -> Optional[Dict]:
        """
        判断是否应该主动关怀用户

        Args:
            memories: 相关记忆列表
            user_id: 用户ID

        Returns:
            如果应该关怀，返回关怀建议；否则返回None
        """
        if not memories:
            return None

        try:
            # 收集所有重要记忆（重要性>=3）
            important_memories = []
            for mem in memories:
                content = mem.get('content', '')
                if not content:
                    content = mem.get('metadata', {}).get('content', '')
                if content:
                    important_memories.append(content)

            if not important_memories:
                # 没有重要记忆，检查是否有用户最近的健康/情绪问题
                # 使用简单规则判断
                for mem in memories:
                    content = str(mem.get('content', '') or mem.get('metadata', {}).get('content', ''))
                    content_lower = content.lower()

                    # 健康关怀
                    health_keywords = ["不舒服", "生病", "感冒", "发烧", "疼", "痛", "医院"]
                    for keyword in health_keywords:
                        if keyword in content_lower:
                            return {
                                "should_care": True,
                                "care_type": "health",
                                "care_topic": f"用户提到{keyword}",
                                "care_suggestion": "建议关心用户的健康状况"
                            }

                    # 情绪关怀
                    emotion_keywords = ["难过", "不开心", "压力", "焦虑", "抑郁", "烦躁", "生气", "郁闷", "累"]
                    for keyword in emotion_keywords:
                        if keyword in content_lower:
                            return {
                                "should_care": True,
                                "care_type": "emotion",
                                "care_topic": f"用户提到{keyword}",
                                "care_suggestion": "建议关心用户的情绪状态"
                            }

                return None

            # 使用 LLM 进行更智能的关怀判断
            if self.client:
                memories_text = "\n".join([f"- {m}" for m in important_memories[:5]])

                prompt = f"""根据用户的记忆，判断是否应该主动关怀用户。

用户记忆：
{memories_text}

请分析：
1. 是否有需要关怀的内容（健康问题、情绪低落、重要事件等）
2. 关怀的方式应该是怎样的

以JSON格式返回：
{{
    "should_care": true/false,
    "care_type": "health/emotion/event/other",
    "care_topic": "关怀主题",
    "care_suggestion": "建议的关怀话语"
}}
"""

                response = await self.client.chat.completions.create(
                    model=settings.LLM_MODEL or "gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": "你是一个关怀助手。只返回JSON格式数据。"},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.5,
                    max_tokens=300,
                    response_format={"type": "json_object"}
                )

                result = json.loads(response.choices[0].message.content)

                if result.get("should_care"):
                    print(f"[MemoryExtractor] LLM建议关怀: {result.get('care_topic')}")
                    return result

            return None

        except Exception as e:
            print(f"[MemoryExtractor] 关怀判断失败: {e}")
            return None


# 全局实例
memory_extractor = MemoryExtractor()
