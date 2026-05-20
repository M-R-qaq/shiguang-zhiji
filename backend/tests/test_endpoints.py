import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_asr_endpoint_exists(client: AsyncClient):
    response = await client.post("/asr/transcribe-base64", json={
        "audio_base64": "",
    })
    assert response.status_code in [400, 422, 500]


@pytest.mark.asyncio
async def test_tts_endpoint_exists(client: AsyncClient, auth_headers):
    response = await client.post("/tts/synthesize", headers=auth_headers, json={
        "text": "",
    })
    assert response.status_code in [400, 422, 500]


@pytest.mark.asyncio
async def test_tts_voices(client: AsyncClient, auth_headers):
    response = await client.get("/tts/voices", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_wakeword_config(client: AsyncClient, auth_headers):
    response = await client.get("/wakeword/config", headers=auth_headers)
    assert response.status_code == 200
