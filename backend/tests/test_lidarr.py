"""Lidarr endpoints integration tests (WS-2.5).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_lidarr_status(client):
    res = await client.get("/servers/srv-test-001/lidarr/status")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_lidarr_health(client):
    res = await client.get("/servers/srv-test-001/lidarr/health")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_lidarr_artists(client):
    res = await client.get("/servers/srv-test-001/lidarr/artists")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_get_lidarr_albums(client):
    res = await client.get("/servers/srv-test-001/lidarr/albums")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_lidarr_wanted(client):
    res = await client.get("/servers/srv-test-001/lidarr/wanted")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_lidarr_queue(client):
    res = await client.get("/servers/srv-test-001/lidarr/queue")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_lidarr_diskspace(client):
    res = await client.get("/servers/srv-test-001/lidarr/diskspace")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_lidarr_refresh_artist(client):
    res = await client.post("/servers/srv-test-001/lidarr/artists/1/refresh")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_lidarr_search_missing(client):
    res = await client.post("/servers/srv-test-001/lidarr/artists/1/search-missing")
    assert res.status_code == 200, res.text
