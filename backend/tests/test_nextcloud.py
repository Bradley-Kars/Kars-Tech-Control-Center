"""Nextcloud endpoints integration tests (WS-2.4).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_nextcloud_info(client):
    res = await client.get("/servers/srv-test-001/nextcloud/info")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_nextcloud_status(client):
    res = await client.get("/servers/srv-test-001/nextcloud/status")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_nextcloud_storage(client):
    res = await client.get("/servers/srv-test-001/nextcloud/storage")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_nextcloud_users(client):
    res = await client.get("/servers/srv-test-001/nextcloud/users")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_get_nextcloud_activity(client):
    res = await client.get("/servers/srv-test-001/nextcloud/activity?limit=10")
    assert res.status_code == 200, res.text
