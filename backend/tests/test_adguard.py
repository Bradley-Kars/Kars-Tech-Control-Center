"""AdGuard endpoints integration tests (WS-2.8).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_adguard_status(client):
    res = await client.get("/servers/srv-test-001/adguard/status")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_adguard_stats(client):
    res = await client.get("/servers/srv-test-001/adguard/stats")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_adguard_query_log(client):
    res = await client.get("/servers/srv-test-001/adguard/query-log?limit=10&offset=0")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_adguard_clients(client):
    res = await client.get("/servers/srv-test-001/adguard/clients")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_adguard_filters(client):
    res = await client.get("/servers/srv-test-001/adguard/filters")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_adguard_dhcp(client):
    res = await client.get("/servers/srv-test-001/adguard/dhcp")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_adguard_enable(client):
    res = await client.post("/servers/srv-test-001/adguard/enable")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_adguard_disable(client):
    res = await client.post("/servers/srv-test-001/adguard/disable")
    assert res.status_code == 200, res.text
