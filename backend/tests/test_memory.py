import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_add_memory(client: AsyncClient, auth_headers):
    response = await client.post("/memory", headers=auth_headers, json={
        "content": "我喜欢吃辣的食物",
        "category": "food_preference",
        "importance": 4,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "我喜欢吃辣的食物"
    assert data["category"] == "food_preference"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_memories(client: AsyncClient, auth_headers):
    response = await client.get("/memory", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_memories_by_category(client: AsyncClient, auth_headers):
    response = await client.get("/memory?category=food_preference", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_search_memories(client: AsyncClient, auth_headers):
    await client.post("/memory", headers=auth_headers, json={
        "content": "我最爱的季节是秋天",
        "category": "preference",
        "importance": 3,
    })

    response = await client.post("/memory/search", headers=auth_headers, json={
        "query": "季节偏好",
    })
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_delete_memory(client: AsyncClient, auth_headers):
    add_resp = await client.post("/memory", headers=auth_headers, json={
        "content": "待删除的记忆",
        "category": "general",
    })
    memory_id = add_resp.json()["id"]

    response = await client.delete(f"/memory/{memory_id}", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_memory_invalid_category(client: AsyncClient, auth_headers):
    response = await client.post("/memory", headers=auth_headers, json={
        "content": "测试无效分类",
        "category": "invalid_category",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "general"
