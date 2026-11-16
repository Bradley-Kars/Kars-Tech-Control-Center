"""KDE Connect endpoints integration tests (WS-2.10).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_kdeconnect_battery(client):
    res = await client.get("/kdeconnect/device-001/battery")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_kdeconnect_notifications(client):
    res = await client.get("/kdeconnect/device-001/notifications")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_kdeconnect_mpris_play(client):
    res = await client.post("/kdeconnect/device-001/mpris/play")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_kdeconnect_mpris_pause(client):
    res = await client.post("/kdeconnect/device-001/mpris/pause")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_kdeconnect_ring_device(client):
    res = await client.post("/kdeconnect/device-001/ring")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_kdeconnect_send_ping(client):
    res = await client.post("/kdeconnect/device-001/ping?message=hello")
    assert res.status_code == 200, res.text
