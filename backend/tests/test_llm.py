import pytest
import re
from api.llm import extract_shiguangjian_keyword


def test_extract_shiguangjian_keyword_with_marker():
    text = "我在食光鉴中看到了一些有趣的内容。\n【食光鉴|美食纪录片】"
    keyword, cleaned = extract_shiguangjian_keyword(text)
    assert keyword == "美食纪录片"


def test_extract_shiguangjian_keyword_no_marker():
    text = "今天天气不错，适合吃火锅。"
    keyword, cleaned = extract_shiguangjian_keyword(text)
    assert keyword is None


def test_extract_shiguangjian_keyword_multiple_markers():
    text = "【食光鉴|烹饪教程】还有【食光鉴|食材选购】"
    keyword, cleaned = extract_shiguangjian_keyword(text)
    assert keyword is not None
    assert len(keyword) > 0


def test_extract_shiguangjian_keyword_empty_string():
    keyword, cleaned = extract_shiguangjian_keyword("")
    assert keyword is None


def test_extract_shiguangjian_keyword_marker_only():
    text = "【食光鉴|测试】"
    keyword, cleaned = extract_shiguangjian_keyword(text)
    assert keyword == "测试"


@pytest.mark.asyncio
async def test_health_check(client):
    from httpx import AsyncClient
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "0.7.0"


@pytest.mark.asyncio
async def test_root_endpoint(client):
    from httpx import AsyncClient
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] is not None
    assert data["version"] == "0.7.0"
    assert isinstance(data["features"], list)
