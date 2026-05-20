import httpx
import asyncio
import re
import json
import hashlib
import time
import urllib.parse
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from random import randint
from core.config import settings


class BilibiliSearcher:

    def __init__(self):
        self._cache: Dict[str, tuple] = {}
        self._client: Optional[httpx.AsyncClient] = None
        self._buvid3: str = ""
        self._session_cookie: str = ""
        self._wbi_keys: Optional[tuple] = None
        self._wbi_keys_time: float = 0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            proxy = settings.SEARCH_HTTP_PROXY or None
            self._client = httpx.AsyncClient(
                timeout=20.0,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    "Referer": "https://www.bilibili.com",
                    "Origin": "https://www.bilibili.com",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
                follow_redirects=True,
                proxy=proxy,
            )
            await self._init_session()
        return self._client

    async def _init_session(self):
        try:
            resp = await self._client.get("https://www.bilibili.com")
            cookies = self._client.cookies
            self._buvid3 = cookies.get("buvid3", "")
            if not self._buvid3:
                self._buvid3 = f"{hashlib.md5(str(time.time()).encode()).hexdigest()[:32]}"
            self._session_cookie = "; ".join([f"{k}={v}" for k, v in cookies.items()])
            print(f"[BilibiliSearcher] 会话初始化成功, buvid3={self._buvid3[:8]}...")
        except Exception as e:
            print(f"[BilibiliSearcher] 会话初始化失败: {e}")
            self._buvid3 = f"{hashlib.md5(str(time.time()).encode()).hexdigest()[:32]}"

    async def _get_wbi_keys(self) -> tuple:
        now = time.time()
        if self._wbi_keys and (now - self._wbi_keys_time) < 600:
            return self._wbi_keys

        client = await self._get_client()
        try:
            resp = await client.get("https://api.bilibili.com/x/web-interface/nav")
            data = resp.json()
            wbi_img = data.get("data", {}).get("wbi_img", {})
            img_url = wbi_img.get("img_url", "")
            sub_url = wbi_img.get("sub_url", "")
            img_key = img_url.split("/")[-1].split(".")[0] if img_url else ""
            sub_key = sub_url.split("/")[-1].split(".")[0] if sub_url else ""
            if img_key and sub_key:
                self._wbi_keys = (img_key, sub_key)
                self._wbi_keys_time = now
                print(f"[BilibiliSearcher] WBI密钥获取成功")
                return self._wbi_keys
        except Exception as e:
            print(f"[BilibiliSearcher] WBI密钥获取失败: {e}")

        return ("", "")

    def _sign_wbi(self, params: dict, img_key: str, sub_key: str) -> dict:
        mixin_key_enc = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
            27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 16,
            55, 37, 6, 24, 51, 25, 30, 52, 22, 54, 48, 36, 26, 13, 44, 57,
            40, 1, 34, 17, 20, 56, 21, 0, 7, 4, 11, 59, 61, 60, 62, 63,
        ]

        raw_key = img_key + sub_key
        mixin_key = "".join(raw_key[i] for i in mixin_key_enc if i < len(raw_key))

        params_with_ts = {**params, "wts": int(time.time())}
        query = urllib.parse.urlencode(
            sorted(params_with_ts.items()),
            quote_via=urllib.parse.quote
        )
        query = re.sub(r'[!\'()*]', '', query)
        w_rid = hashlib.md5((query + mixin_key).encode()).hexdigest()
        params_with_ts["w_rid"] = w_rid
        return params_with_ts

    async def search(self, keyword: str, limit: int = 5) -> List[Dict]:
        now = datetime.now()
        expired_keys = [k for k, v in self._cache.items() if now - v[0] > timedelta(seconds=settings.BILIBILI_SEARCH_CACHE_TTL)]
        for k in expired_keys:
            del self._cache[k]

        cache_key = keyword.strip()
        if cache_key in self._cache:
            cached_time, cached_results = self._cache[cache_key]
            if datetime.now() - cached_time < timedelta(seconds=settings.BILIBILI_SEARCH_CACHE_TTL):
                print(f"[BilibiliSearcher] 缓存命中: {keyword}")
                return cached_results[:limit]

        strategies = [
            ("WBI签名搜索", self._search_wbi),
            ("综合搜索", self._search_comprehensive),
            ("B站页面抓取", self._search_html),
            ("搜索建议", self._search_suggest),
        ]

        for name, strategy_fn in strategies:
            try:
                print(f"[BilibiliSearcher] 尝试策略: {name}")
                results = await strategy_fn(keyword, limit)
                if results:
                    self._cache[cache_key] = (datetime.now(), results)
                    print(f"[BilibiliSearcher] 策略 '{name}' 成功, {len(results)} 条结果")
                    return results[:limit]
                print(f"[BilibiliSearcher] 策略 '{name}' 返回空结果")
            except Exception as e:
                print(f"[BilibiliSearcher] 策略 '{name}' 失败: {e}")
                continue

        print(f"[BilibiliSearcher] 所有策略均失败")
        return []

    async def _search_wbi(self, keyword: str, limit: int) -> List[Dict]:
        img_key, sub_key = await self._get_wbi_keys()
        if not img_key or not sub_key:
            raise Exception("WBI密钥不可用")

        client = await self._get_client()

        params = {
            "keyword": keyword,
            "page": 1,
            "page_size": limit,
            "search_type": "video",
            "order": "totalrank",
        }

        signed_params = self._sign_wbi(params, img_key, sub_key)

        headers = {
            "Cookie": f"buvid3={self._buvid3}; {self._session_cookie}",
            "Referer": f"https://search.bilibili.com/video?keyword={urllib.parse.quote(keyword)}",
        }

        response = await client.get(
            "https://api.bilibili.com/x/web-interface/wbi/search/type",
            params=signed_params,
            headers=headers,
        )

        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}")

        data = response.json()
        if data.get("code") != 0:
            raise Exception(f"API code={data.get('code')}: {data.get('message', '')}")

        return self._parse_bilibili_results(data, limit)

    async def _search_comprehensive(self, keyword: str, limit: int) -> List[Dict]:
        client = await self._get_client()

        params = {
            "keyword": keyword,
            "page": 1,
            "page_size": limit,
            "search_type": "video",
            "order": "totalrank",
        }

        headers = {
            "Cookie": f"buvid3={self._buvid3}; {self._session_cookie}",
            "Referer": "https://www.bilibili.com",
        }

        response = await client.get(
            "https://api.bilibili.com/x/web-interface/search/type",
            params=params,
            headers=headers,
        )

        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}")

        try:
            data = response.json()
        except Exception:
            raise Exception("响应非JSON格式")

        if data.get("code") != 0:
            raise Exception(f"API code={data.get('code')}: {data.get('message', '')}")

        return self._parse_bilibili_results(data, limit)

    async def _search_html(self, keyword: str, limit: int) -> List[Dict]:
        client = await self._get_client()

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": "https://www.bilibili.com",
            "Cookie": f"buvid3={self._buvid3}",
        }

        response = await client.get(
            f"https://search.bilibili.com/video?keyword={urllib.parse.quote(keyword)}",
            headers=headers,
            follow_redirects=True,
        )

        if response.status_code != 200:
            raise Exception(f"HTML搜索 HTTP {response.status_code}")

        html = response.text
        results = []

        json_blocks = re.findall(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});\s*</script>', html, re.DOTALL)
        if json_blocks:
            try:
                init_data = json.loads(json_blocks[0])
                search_data = init_data.get("searchResult", {}).get("video", [])
                for item in search_data[:limit]:
                    title = re.sub(r'<[^>]+>', '', item.get("title", ""))
                    bvid = item.get("bvid", "")
                    results.append({
                        "title": title or f"视频 {bvid}",
                        "bvid": bvid,
                        "cover": item.get("pic", ""),
                        "author": item.get("author", ""),
                        "duration": item.get("duration", ""),
                        "play_count": self._format_play_count(item.get("play", 0)),
                        "url": f"https://www.bilibili.com/video/{bvid}" if bvid else "",
                    })
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                print(f"[BilibiliSearcher] HTML解析INITIAL_STATE失败: {e}")

        if not results:
            bvid_pattern = re.compile(r'bilibili\.com/video/(BV[a-zA-Z0-9]+)')
            bvids_found = bvid_pattern.findall(html)
            seen_bvids = set()
            for bvid in bvids_found:
                if bvid in seen_bvids:
                    continue
                seen_bvids.add(bvid)
                results.append({
                    "title": f"Bilibili 视频 {bvid}",
                    "bvid": bvid,
                    "cover": "",
                    "author": "",
                    "duration": "",
                    "play_count": "",
                    "url": f"https://www.bilibili.com/video/{bvid}",
                })
                if len(results) >= limit:
                    break

        return results

    async def _search_suggest(self, keyword: str, limit: int) -> List[Dict]:
        client = await self._get_client()

        response = await client.get(
            "https://s.search.bilibili.com/main/suggest",
            params={"term": keyword, "main_ver": "v1.4"},
            headers={"Referer": "https://www.bilibili.com"},
        )

        if response.status_code != 200:
            return []

        try:
            data = response.json()
        except Exception:
            return []

        suggestions = data.get("data", {}).get("tag", [])

        results = []
        for item in suggestions[:limit]:
            name = item.get("name", keyword)
            ref = item.get("ref", 0)
            results.append({
                "title": f"搜索建议: {name}" + (f" ({ref}相关视频)" if ref else ""),
                "bvid": "",
                "cover": item.get("cover", "") or item.get("pic", ""),
                "author": "",
                "duration": "",
                "play_count": str(ref) if ref else "",
                "url": f"https://search.bilibili.com/video?keyword={urllib.parse.quote(name)}",
            })

        return results

    def _parse_bilibili_results(self, data: dict, limit: int) -> List[Dict]:
        results = []
        for item in data.get("data", {}).get("result", [])[:limit]:
            title = item.get("title", "").replace('<em class="keyword">', "").replace("</em>", "")
            results.append({
                "title": title,
                "bvid": item.get("bvid", ""),
                "cover": item.get("pic", ""),
                "author": item.get("author", ""),
                "duration": item.get("duration", ""),
                "play_count": self._format_play_count(item.get("play", 0)),
                "url": f"https://www.bilibili.com/video/{item.get('bvid', '')}",
            })
        return results

    def _format_play_count(self, count) -> str:
        try:
            count = int(count)
            if count >= 10000:
                return f"{count / 10000:.1f}万"
            return str(count)
        except (ValueError, TypeError):
            return "0"

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


bilibili_searcher = BilibiliSearcher()
