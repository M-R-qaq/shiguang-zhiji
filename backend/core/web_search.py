import httpx
import asyncio
from typing import List, Dict, Optional
from core.config import settings


class WebSearcher:
    def __init__(self):
        self.api_key = settings.TAVILY_API_KEY
        self.base_url = "https://api.tavily.com"
        self.max_results = settings.WEB_SEARCH_MAX_RESULTS
        self.content_max_results = settings.WEB_SEARCH_CONTENT_MAX_RESULTS
        self.timeout = settings.WEB_SEARCH_TIMEOUT
        self._cache: Dict[str, tuple] = {}
        self._cache_ttl = 300

    def is_enabled(self) -> bool:
        return bool(
            settings.WEB_SEARCH_ENABLED
            and self.api_key
        )

    async def search(self, query: str, max_results: Optional[int] = None) -> List[Dict]:
        if not self.is_enabled():
            print("[WebSearch] 未启用或缺少API Key")
            return []

        current_time = asyncio.get_event_loop().time()
        expired_keys = [k for k, v in self._cache.items() if current_time - v[0] > self._cache_ttl]
        for k in expired_keys:
            del self._cache[k]

        cache_key = query.strip().lower()
        if cache_key in self._cache:
            cached_time, cached_results = self._cache[cache_key]
            if asyncio.get_event_loop().time() - cached_time < self._cache_ttl:
                print(f"[WebSearch] 使用缓存: {query}")
                return cached_results

        try:
            print(f"[WebSearch] 搜索: {query}")
            results = await self._call_tavily(query, max_results or self.max_results)
            self._cache[cache_key] = (asyncio.get_event_loop().time(), results)
            return results
        except Exception as e:
            print(f"[WebSearch] 搜索失败: {e}")
            return []

    async def search_content(self, query: str, max_results: Optional[int] = None) -> List[Dict]:
        if not self.is_enabled():
            print("[WebSearch] 内容搜索未启用或缺少API Key")
            return []

        current_time = asyncio.get_event_loop().time()
        expired_keys = [k for k, v in self._cache.items() if current_time - v[0] > self._cache_ttl]
        for k in expired_keys:
            del self._cache[k]

        cache_key = f"content:{query.strip().lower()}"
        if cache_key in self._cache:
            cached_time, cached_results = self._cache[cache_key]
            if asyncio.get_event_loop().time() - cached_time < self._cache_ttl:
                print(f"[WebSearch] 内容搜索使用缓存: {query}")
                return cached_results

        try:
            print(f"[WebSearch] 内容搜索: {query}")
            results = await self._call_tavily(query, max_results or self.content_max_results)
            self._cache[cache_key] = (asyncio.get_event_loop().time(), results)
            return results
        except Exception as e:
            print(f"[WebSearch] 内容搜索失败: {e}")
            return []

    async def _call_tavily(self, query: str, max_results: int) -> List[Dict]:
        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": "basic",
            "include_answer": True,
            "include_raw_content": False,
            "max_results": max_results,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/search",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        answer = data.get("answer", "")
        raw_results = data.get("results", [])

        formatted = []
        if answer:
            formatted.append({
                "title": "AI摘要",
                "content": answer,
                "url": "",
                "source": "tavily_answer",
            })

        for r in raw_results:
            formatted.append({
                "title": r.get("title", ""),
                "content": r.get("content", ""),
                "url": r.get("url", ""),
                "source": "tavily",
            })

        print(f"[WebSearch] 返回 {len(formatted)} 条结果")
        return formatted


web_searcher = WebSearcher()
