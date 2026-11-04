"""backend/fleet/router Lidarr route tests (P9).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The lidarr
client is mocked, so neither httpx nor a real Lidarr is needed.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import ServerConfig, save_servers  # noqa: E402
from fleet.lidarr_service import (  # noqa: E402
    LidarrQueue,
    LidarrSystemStatus,
    LidarrWantedMissing,
)

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {
        "lidarr_url": "http://<device>.<tailnet>.ts.net:8686",
        "lidarr_api_key": "not-a-real-api-key",
    },
    "api_key": "sk-live-placeholder-key",
}

STATUS = LidarrSystemStatus(
    app_name="Lidarr",
    instance_name="Music",
    version="2.0.0.1234",
    build_time="2026-01-01T00:00:00Z",
    is_debug=False,
    is_production=True,
    is_admin=True,
    startup_path="/config",
    app_data="/config",
    os_name="Linux",
    os_version="6.8.0",
    is_linux=True,
    is_osx=False,
    is_windows=False,
    branch="master",
    authentication="None",
    url_base="/lidarr",
)


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


@contextmanager
def _mock_client(monkeypatch):
    m = MagicMock()
    m.get_status = AsyncMock(return_value=STATUS)
    m.get_health = AsyncMock(return_value=[])
    m.get_artists = AsyncMock(return_value=[])
    m.get_albums = AsyncMock(return_value=[])
    m.get_wanted = AsyncMock(return_value=LidarrWantedMissing())
    m.get_queue = AsyncMock(return_value=LidarrQueue())
    m.get_diskspace = AsyncMock(return_value=[])
    m.refresh_series = AsyncMock(return_value=None)
    m.search_missing = AsyncMock(return_value=None)
    m.aclose = AsyncMock(return_value=None)
    with patch("fleet.router._lidarr_client", return_value=m):
        yield m


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, read_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="read")
    _, write_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), read_secret, write_secret, servers_file


def test_lidarr_status_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_status?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["app_name"] == "Lidarr"
    assert data["version"] == "2.0.0.1234"


def test_lidarr_health_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_health?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    assert r.json() == []


def test_lidarr_artists_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_artists?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    assert r.json() == []


def test_lidarr_albums_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_albums?server_id=unraid-main&artistId=1&monitored=true",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    assert r.json() == []


def test_lidarr_wanted_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_wanted?server_id=unraid-main&page=1&pageSize=20",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200


def test_lidarr_queue_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_queue?server_id=unraid-main&page=1&pageSize=25",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200


def test_lidarr_diskspace_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_diskspace?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200


def test_lidarr_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get(
        "/api/fleet/lidarr/get_lidarr_status?server_id=unraid-main"
    )
    assert r.status_code == 401


def test_lidarr_server_not_found(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/lidarr/get_lidarr_status?server_id=nonexistent",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 404


def test_lidarr_refresh_artist_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.post(
            "/api/fleet/lidarr/lidarr_refresh_artist?server_id=unraid-main&artist_id=1",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
    # The route must call the real service method (refresh_series, matching
    # the original Rust Lidarr service), not a non-existent refresh_artist.
    m.refresh_series.assert_called_once_with(1)


def test_lidarr_search_missing_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/lidarr/lidarr_search_missing?server_id=unraid-main&artist_id=1",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
