"""MySpeed endpoints integration tests (WS-2.7).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_myspeed_summary(client):
    res = await client.get("/servers/srv-test-001/myspeed/summary")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_myspeed_tests(client):
    res = await client.get("/servers/srv-test-001/myspeed/tests?limit=5")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_myspeed_servers(client):
    res = await client.get("/servers/srv-test-001/myspeed/servers")
    assert res.status_code == 200, res.text
