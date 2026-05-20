import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    response = await client.post("/auth/register", json={
        "username": "newuser_v06",
        "password": "newpass123",
        "nickname": "新用户",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser_v06"
    assert data["nickname"] == "新用户"


@pytest.mark.asyncio
async def test_register_duplicate(client: AsyncClient, test_user):
    response = await client.post("/auth/register", json={
        "username": test_user["username"],
        "password": "another123",
    })
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user):
    response = await client.post("/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"],
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user):
    response = await client.post("/auth/login", json={
        "username": test_user["username"],
        "password": "wrongpass",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user(client: AsyncClient, auth_headers):
    response = await client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "username" in data


@pytest.mark.asyncio
async def test_invalid_token(client: AsyncClient):
    response = await client.get("/auth/me", headers={
        "Authorization": "Bearer invalid_token_here"
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_nickname(client: AsyncClient, auth_headers):
    response = await client.put("/auth/me", headers=auth_headers, json={
        "nickname": "新昵称",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["nickname"] == "新昵称"
