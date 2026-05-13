import chromadb
from chromadb.config import Settings
from typing import List, Dict, Optional
import json
from pathlib import Path


class VectorDB:
    """向量数据库管理类"""

    def __init__(self, persist_directory: str = "./chroma_db"):
        self.persist_directory = persist_directory
        Path(persist_directory).mkdir(exist_ok=True)

        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )

        self.memory_collection = self.client.get_or_create_collection(
            name="user_memories",
            metadata={"description": "用户记忆存储"}
        )

        print(f"[VectorDB] 初始化完成，持久化目录: {persist_directory}")

    def add_memory(
        self,
        memory_id: str,
        user_id: int,
        content: str,
        category: str = "general",
        metadata: Optional[Dict] = None
    ):
        if metadata is None:
            metadata = {}

        metadata.update({
            "user_id": user_id,
            "category": category,
            "memory_id": memory_id
        })

        for key, value in metadata.items():
            if isinstance(value, bool):
                metadata[key] = str(value)

        self.memory_collection.add(
            documents=[content],
            metadatas=[metadata],
            ids=[f"memory_{memory_id}"]
        )

        print(f"[VectorDB] 添加记忆: user_id={user_id}, memory_id={memory_id}")

    def _build_where(self, user_id: int, category: Optional[str] = None) -> Dict:
        """构建 ChromaDB where 条件，统一使用 $and 语法"""
        conditions = [{"user_id": user_id}]
        if category:
            conditions.append({"category": category})
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _count_matching(self, user_id: int, category: Optional[str] = None) -> int:
        """获取符合条件的文档数量，失败返回 -1"""
        try:
            where_clause = self._build_where(user_id, category)
            result = self.memory_collection.get(where=where_clause)
            count = len(result["ids"]) if result["ids"] else 0
            print(f"[VectorDB] 文档数量: user_id={user_id}, category={category}, count={count}")
            return count
        except Exception as e:
            print(f"[VectorDB] 获取文档数量失败: {e}")
            return -1

    def search_memories(
        self,
        user_id: int,
        query: str,
        n_results: int = 5,
        category: Optional[str] = None
    ) -> List[Dict]:
        try:
            where_clause = self._build_where(user_id, category)

            doc_count = self._count_matching(user_id, category)

            if doc_count == 0:
                print(f"[VectorDB] 用户 {user_id} 没有匹配的记忆")
                return []

            if doc_count > 0:
                actual_n = min(n_results, doc_count)
            else:
                # doc_count == -1: 获取数量失败，用集合总数作为安全上限
                try:
                    total = self.memory_collection.count()
                    actual_n = min(n_results, max(total, 1))
                    print(f"[VectorDB] 文档数量获取失败，使用集合总数 {total} 作为上限")
                except Exception:
                    actual_n = 1

            print(f"[VectorDB] 执行搜索: query='{query}', n_results={actual_n}, where={where_clause}")

            results = self.memory_collection.query(
                query_texts=[query],
                n_results=actual_n,
                where=where_clause
            )

            memories = []
            if results["ids"] and results["ids"][0]:
                for i, memory_id in enumerate(results["ids"][0]):
                    mem_dict = {
                        "id": memory_id,
                        "content": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    }
                    if results.get("distances") and results["distances"]:
                        mem_dict["distance"] = results["distances"][0][i]
                    else:
                        mem_dict["distance"] = None
                    memories.append(mem_dict)

            print(f"[VectorDB] 搜索记忆: user_id={user_id}, 找到 {len(memories)} 条结果")
            return memories

        except Exception as e:
            print(f"[VectorDB] 搜索记忆失败: {e}")
            import traceback
            traceback.print_exc()
            # 最终兜底：尝试 n_results=1
            try:
                print("[VectorDB] 尝试兜底搜索 (n_results=1)...")
                results = self.memory_collection.query(
                    query_texts=[query],
                    n_results=1,
                    where=self._build_where(user_id, category)
                )
                memories = []
                if results["ids"] and results["ids"][0]:
                    for i, memory_id in enumerate(results["ids"][0]):
                        mem_dict = {
                            "id": memory_id,
                            "content": results["documents"][0][i],
                            "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                            "distance": results["distances"][0][i] if results.get("distances") else None,
                        }
                        memories.append(mem_dict)
                print(f"[VectorDB] 兜底搜索完成，找到 {len(memories)} 条结果")
                return memories
            except Exception as e2:
                print(f"[VectorDB] 兜底搜索也失败: {e2}")
                return []

    def get_user_memories(
        self,
        user_id: int,
        category: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        try:
            where_clause = self._build_where(user_id, category)

            results = self.memory_collection.get(
                where=where_clause,
                limit=limit
            )

            memories = []
            if results["ids"]:
                for i, memory_id in enumerate(results["ids"]):
                    memories.append({
                        "id": memory_id,
                        "content": results["documents"][i],
                        "metadata": results["metadatas"][i] if results["metadatas"] else {}
                    })

            return memories

        except Exception as e:
            print(f"[VectorDB] 获取用户记忆失败: {e}")
            import traceback
            traceback.print_exc()
            return []

    def delete_memory(self, memory_id: str):
        try:
            self.memory_collection.delete(ids=[f"memory_{memory_id}"])
            print(f"[VectorDB] 删除记忆: memory_id={memory_id}")
        except Exception as e:
            print(f"[VectorDB] 删除记忆失败: {e}")

    def delete_user_memories(self, user_id: int):
        memories = self.get_user_memories(user_id)
        ids = [m["id"] for m in memories]
        if ids:
            self.memory_collection.delete(ids=ids)
            print(f"[VectorDB] 删除用户 {user_id} 的所有记忆: {len(ids)} 条")

    def update_memory(
        self,
        memory_id: str,
        content: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        try:
            update_data = {"ids": [f"memory_{memory_id}"]}
            if content:
                update_data["documents"] = [content]
            if metadata:
                try:
                    existing = self.memory_collection.get(ids=[f"memory_{memory_id}"])
                    if existing["metadatas"] and existing["metadatas"][0]:
                        merged = dict(existing["metadatas"][0])
                        merged.update(metadata)
                        update_data["metadatas"] = [merged]
                    else:
                        update_data["metadatas"] = [metadata]
                except Exception:
                    update_data["metadatas"] = [metadata]

            if len(update_data) > 1:
                self.memory_collection.update(**update_data)
                print(f"[VectorDB] 更新记忆: memory_id={memory_id}")
        except Exception as e:
            print(f"[VectorDB] 更新记忆失败: {e}")


# 全局实例
vector_db = VectorDB()
