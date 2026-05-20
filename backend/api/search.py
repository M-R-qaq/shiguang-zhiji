from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from core.config import settings
from core.security import get_current_user
from core.search_engine import bilibili_searcher
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


@router.post("", response_model=SearchResponse)
async def search_content(
    request: SearchRequest,
    current_user: User = Depends(get_current_user)
):
    """
    食光鉴搜索 API

    根据关键词搜索 Bilibili 视频内容
    """
    if not settings.BILIBILI_SEARCH_ENABLED:
        raise HTTPException(status_code=400, detail="食光鉴搜索功能未启用")

    if not request.keyword or len(request.keyword.strip()) < 2:
        raise HTTPException(status_code=400, detail="搜索关键词至少2个字符")

    if len(request.keyword) > 50:
        raise HTTPException(status_code=400, detail="搜索关键词不能超过50个字符")

    try:
        raw_results = await bilibili_searcher.search(
            keyword=request.keyword.strip(),
            limit=min(request.limit, 5)
        )

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
            for r in raw_results
        ]

        return SearchResponse(
            query=request.keyword.strip(),
            results=results
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")
