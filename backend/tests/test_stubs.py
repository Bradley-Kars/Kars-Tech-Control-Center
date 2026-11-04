"""backend/tests/stubs/ stub HTTP server tests.

Starts each stub on a free localhost port and hits the endpoints the Rust
parsers / Python clients expect. Fixture-only: no real network, no real
hostnames or tokens.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest

from tests.stubs import (
    AdGuardStub,
    HomeAssistantStub,
    LidarrStub,
    NextcloudStub,
    PlexStub,
    StubCluster,
    UnraidStub,
    start_all_stubs,
    stop_all_stubs,
)


async def _run(coro):
    return await coro


def _start_stop(stub, fn):
    """Start a stub, run an async fn(httpx.AsyncClient, stub), then stop it."""

    async def main():
        await stub.start()
        try:
            async with httpx.AsyncClient() as client:
                return await fn(client, stub)
        finally:
            await stub.stop()

    return asyncio.run(main())


# --------------------------------------------------------------------------- #
# Plex
# --------------------------------------------------------------------------- #
def test_plex_stub_identity():
    def fn(client, stub):
        return client.get(f"{stub.url}/identity")

    resp = _start_stop(PlexStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    assert data["MediaContainer"]["machineIdentifier"] == "plex-test-001"
    assert data["MediaContainer"]["version"] == "1.43.4.10903-e5521bd8c"
    assert data["MediaContainer"]["claimed"] is True


def test_plex_stub_library_sections():
    def fn(client, stub):
        return client.get(f"{stub.url}/library/sections")

    resp = _start_stop(PlexStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    titles = [d["title"] for d in data["MediaContainer"]["Directory"]]
    assert titles == ["Movies", "TV Shows"]
    assert data["MediaContainer"]["Directory"][0]["type"] == "movie"


# --------------------------------------------------------------------------- #
# Nextcloud
# --------------------------------------------------------------------------- #
def test_nextcloud_stub_server_info():
    def fn(client, stub):
        return client.get(f"{stub.url}/ocs/v2.php/apps/serverinfo/api/v1/info")

    resp = _start_stop(NextcloudStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    system = data["ocs"]["data"]["nextcloud"]["system"]
    assert system["version"] == "28.0.0"
    assert system["edition"] == "Community"


def test_nextcloud_stub_status_and_capabilities():
    def fn(client, stub):
        return client.get(f"{stub.url}/ocs/v2.php/cloud/status")

    resp = _start_stop(NextcloudStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ocs"]["data"]["version"] == "28.0.0"
    assert data["ocs"]["data"]["edition"] == "community"

    def fn2(client, stub):
        return client.get(f"{stub.url}/ocs/v2.php/cloud/capabilities")

    resp2 = _start_stop(NextcloudStub(), fn2)
    assert resp2.status_code == 200
    cap = resp2.json()["ocs"]["data"]["capabilities"]
    assert cap["core"]["pollinterval"] == 3600


# --------------------------------------------------------------------------- #
# Home Assistant
# --------------------------------------------------------------------------- #
def test_homeassistant_stub_states():
    def fn(client, stub):
        return client.get(f"{stub.url}/api/states")

    resp = _start_stop(HomeAssistantStub(), fn)
    assert resp.status_code == 200
    states = resp.json()
    assert len(states) == 2
    assert states[0]["entity_id"] == "light.kitchen"
    assert states[0]["state"] == "on"


def test_homeassistant_stub_state_and_config():
    def fn(client, stub):
        return client.get(f"{stub.url}/api/states/light.kitchen")

    resp = _start_stop(HomeAssistantStub(), fn)
    assert resp.status_code == 200
    assert resp.json()["entity_id"] == "light.kitchen"

    def fn2(client, stub):
        return client.get(f"{stub.url}/api/config")

    resp2 = _start_stop(HomeAssistantStub(), fn2)
    assert resp2.status_code == 200
    assert resp2.json()["version"] == "2026.1.0"


# --------------------------------------------------------------------------- #
# AdGuard
# --------------------------------------------------------------------------- #
def test_adguard_stub_status():
    def fn(client, stub):
        return client.get(f"{stub.url}/control/status")

    resp = _start_stop(AdGuardStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    assert data["protection_enabled"] is True
    assert data["running"] is True


# --------------------------------------------------------------------------- #
# Lidarr
# --------------------------------------------------------------------------- #
def test_lidarr_stub_system_status():
    def fn(client, stub):
        return client.get(f"{stub.url}/api/v1/system/status")

    resp = _start_stop(LidarrStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    assert data["appName"] == "Lidarr"
    assert data["isProduction"] is True


# --------------------------------------------------------------------------- #
# Unraid emhttp
# --------------------------------------------------------------------------- #
def test_unraid_stub_docker_and_disks():
    def fn(client, stub):
        return client.get(f"{stub.url}/api/v2/docker")

    resp = _start_stop(UnraidStub(), fn)
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()["containers"]]
    assert names == ["nextcloud", "lidarr"]

    def fn2(client, stub):
        return client.get(f"{stub.url}/api/v2/disks")

    resp2 = _start_stop(UnraidStub(), fn2)
    assert resp2.status_code == 200
    assert resp2.json()["disks"][0]["name"] == "disk1"


def test_unraid_stub_docker_action():
    def fn(client, stub):
        return client.post(f"{stub.url}/api/v2/docker/container/nextcloud", data={"action": "start"})

    resp = _start_stop(UnraidStub(), fn)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "nextcloud"
    assert data["action"] == "start"


# --------------------------------------------------------------------------- #
# Cluster (e2e entry point)
# --------------------------------------------------------------------------- #
def test_stub_cluster_starts_all():
    async def main():
        cluster = StubCluster()
        await cluster.start()
        try:
            assert len(cluster.all) == 6
            # Every stub answers on its own port.
            async with httpx.AsyncClient() as client:
                r1 = await client.get(f"{cluster.plex.url}/identity")
                r2 = await client.get(f"{cluster.adguard.url}/control/status")
                r3 = await client.get(f"{cluster.unraid.url}/api/v2/docker")
            assert r1.status_code == 200
            assert r2.status_code == 200
            assert r3.status_code == 200
        finally:
            await cluster.stop()

    asyncio.run(main())


def test_start_all_stubs_helper():
    async def main():
        cluster = await start_all_stubs()
        try:
            assert len(cluster.all) == 6
        finally:
            await stop_all_stubs(cluster)

    asyncio.run(main())


# --------------------------------------------------------------------------- #
# Request recording
# --------------------------------------------------------------------------- #
def test_stub_records_requests():
    stub = PlexStub()

    async def main():
        await stub.start()
        try:
            async with httpx.AsyncClient() as client:
                await client.get(f"{stub.url}/identity")
                await client.get(f"{stub.url}/library/sections")
            assert len(stub.requests) == 2
            assert stub.requests[0]["method"] == "GET"
            assert stub.requests[0]["path"] == "/identity"
            assert stub.requests[1]["path"] == "/library/sections"
        finally:
            await stub.stop()

    asyncio.run(main())


@pytest.mark.parametrize(
    "stub_factory,path",
    [
        (PlexStub, "/identity"),
        (NextcloudStub, "/ocs/v2.php/cloud/status"),
        (HomeAssistantStub, "/api/states"),
        (AdGuardStub, "/control/status"),
        (LidarrStub, "/api/v1/system/status"),
        (UnraidStub, "/api/v2/docker"),
    ],
)
def test_every_stub_answers_ok(stub_factory, path):
    def fn(client, stub):
        return client.get(f"{stub.url}{path}")

    resp = _start_stop(stub_factory(), fn)
    assert resp.status_code == 200, f"{stub_factory.__name__} {path} -> {resp.status_code}"
