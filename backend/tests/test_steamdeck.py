"""Steam Deck endpoints integration tests (WS-2.11).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_steamdeck_get_system_stats(client):
    res = await client.get("/steamdeck/deck-001/stats")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_get_battery(client):
    res = await client.get("/steamdeck/deck-001/battery")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_get_thermal(client):
    res = await client.get("/steamdeck/deck-001/thermal")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_get_disk(client):
    res = await client.get("/steamdeck/deck-001/disk")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_get_network(client):
    res = await client.get("/steamdeck/deck-001/network")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_get_gpu(client):
    res = await client.get("/steamdeck/deck-001/gpu")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_launch_rustdesk(client):
    res = await client.post("/steamdeck/deck-001/rustdesk/launch")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_steamdeck_get_deskflow_status(client):
    res = await client.get("/steamdeck/deck-001/deskflow")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_ally_provision(client):
    res = await client.post("/steamdeck/deck-001/provision")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_ally_launch_agent(client):
    res = await client.post("/steamdeck/deck-001/agent/launch")
    assert res.status_code == 200, res.text
