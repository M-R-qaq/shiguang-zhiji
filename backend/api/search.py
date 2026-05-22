import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
from core.security import get_current_user
from core.web_search import web_searcher
from models.user import User


router = APIRouter(prefix="/search", tags=["食光鉴搜索"])


class SearchRequest(BaseModel):
    keyword: str
    limit: int = 5


class VideoResult(BaseModel):
    title: str
    bvid: str = ""
    cover: str = ""
    author: str = ""
    duration: str = ""
    play_count: str = ""
    url: str = ""


class SearchResponse(BaseModel):
    query: str
    results: List[VideoResult] = []


def _convert_tavily_to_video_results(tavily_results: List[Dict]) -> List[Dict]:
    video_results = []
    for r in tavily_results:
        url = r.get("url", "")
        bvid = ""
        bv_match = re.search(r'BV[a-zA-Z0-9]+', url)
        if bv_match:
            bvid = bv_match.group(0)
        video_results.append({
            "title": r.get("title", ""),
            "bvid": bvid,
            "cover": "",
            "author": "",
            "duration": "",
            "play_count": "",
            "url": url,
        })
    return video_results


@router.post("", response_model=SearchResponse)
async def search_content(
    request: SearchRequest,
    current_user: User = Depends(get_current_user)
):
    if not web_searcher.is_enabled():
        raise HTTPException(status_code=400, detail="食光鉴搜索功能未启用")

    if not request.keyword or len(request.keyword.strip()) < 2:
        raise HTTPException(status_code=400, detail="搜索关键词至少2个字符")

    if len(request.keyword) > 50:
        raise HTTPException(status_code=400, detail="搜索关键词不能超过50个字符")

    try:
        raw_results = await web_searcher.search_content(
            query=request.keyword.strip(),
            max_results=min(request.limit, 5)
        )

        video_data = _convert_tavily_to_video_results(raw_results)

        results = [
            VideoResult(
                title=r["title"],
                bvid=r.get("bvid", ""),
                cover=r.get("cover", ""),
                author=r.get("author", ""),
                duration=r.get("duration", ""),
                play_count=r.get("play_count", ""),
                url=r.get("url", "")
            )
            for r in video_data
        ]

        return SearchResponse(
            query=request.keyword.strip(),
            results=results
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")
