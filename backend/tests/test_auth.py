"""Root auth endpoints integration tests (WS-2.20).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_auth_login(client):
    res = await client.post(
        "/auth/login", json={"email": "agent@kts.local", "password": "secret"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "token" in body
    assert body["token"] == "dev-token-agent@kts.local"
    assert "user" in body


@pytest.mark.asyncio
async def test_auth_logout(client):
    res = await client.post("/auth/logout")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_auth_me(client):
    res = await client.get("/auth/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == "agent-001"
    assert body["role"] == "agent"
