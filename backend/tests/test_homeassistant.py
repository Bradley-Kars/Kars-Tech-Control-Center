"""Home Assistant endpoints integration tests (WS-2.6).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_homeassistant_states(client):
    res = await client.get("/servers/srv-test-001/homeassistant/states")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_homeassistant_config(client):
    res = await client.get("/servers/srv-test-001/homeassistant/config")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_homeassistant_areas(client):
    res = await client.get("/servers/srv-test-001/homeassistant/areas")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_homeassistant_devices(client):
    res = await client.get("/servers/srv-test-001/homeassistant/devices")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_homeassistant_entities(client):
    res = await client.get("/servers/srv-test-001/homeassistant/entities")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_homeassistant_toggle(client):
    res = await client.post("/servers/srv-test-001/homeassistant/entities/light.kitchen/toggle")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_homeassistant_turn_on(client):
    res = await client.post("/servers/srv-test-001/homeassistant/entities/light.kitchen/on")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_homeassistant_turn_off(client):
    res = await client.post("/servers/srv-test-001/homeassistant/entities/light.kitchen/off")
    assert res.status_code == 200, res.text
