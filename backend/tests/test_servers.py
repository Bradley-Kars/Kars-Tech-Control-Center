"""Servers CRUD integration tests (WS-2.1).

Hits the real backend against the real test DB. No fetch stubbing.
Each test uses a unique server ID for isolation.
"""

import pytest

BASE_PAYLOAD = {
    "name": "Test Unraid",
    "hostname": "unraid.local",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "secret"},
    "device_type": "unraid",
    "api_key": None,
    "service_keys": {},
    "meshcentral_device_id": None,
    "meshcentral_enrolled_at": None,
    "meshcentral_status": None,
    "connection_priority": ["ssh"],
}


def payload(server_id: str) -> dict:
    return {"id": server_id, **BASE_PAYLOAD}


@pytest.mark.asyncio
async def test_create_server(client):
    res = await client.post("/servers", json=payload("srv-create-001"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == "srv-create-001"
    assert body["name"] == "Test Unraid"
    assert body["hostname"] == "unraid.local"
    assert body["auth"] == {"type": "password", "password": "secret"}


@pytest.mark.asyncio
async def test_list_servers(client):
    await client.post("/servers", json=payload("srv-list-001"))
    res = await client.get("/servers")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)
    assert any(s["id"] == "srv-list-001" for s in body)


@pytest.mark.asyncio
async def test_get_server(client):
    await client.post("/servers", json=payload("srv-get-001"))
    res = await client.get("/servers/srv-get-001")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == "srv-get-001"


@pytest.mark.asyncio
async def test_get_server_not_found(client):
    res = await client.get("/servers/does-not-exist")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_server(client):
    await client.post("/servers", json=payload("srv-delete-001"))
    res = await client.delete("/servers/srv-delete-001")
    assert res.status_code == 200, res.text
    # confirm gone
    res2 = await client.get("/servers/srv-delete-001")
    assert res2.status_code == 404
