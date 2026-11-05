"""backend/fleet/router *arr route tests (A3).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The *arr client
is mocked, so neither httpx nor a real *arr server is needed.

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
from fleet.arr_service import (  # noqa: E402
    ArrApp,
    ArrSystemStatus,
    ArrHealthIssue,
    ArrQueue,
    ArrWantedMissing,
    ArrLibraryTotal,
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
        "lidarr_api_key": "not-a-real-lidarr-key",
        "sonarr_url": "http://<device>.<tailnet>.ts.net:8989",
        "sonarr_api_key": "not-a-real-sonarr-key",
        "radarr_url": "http://<device>.<tailnet>.ts.net:7878",
        "radarr_api_key": "not-a-real-radarr-key",
    },
    "api_key": "sk-live-placeholder-key",
}

APPS = [ArrApp.Lidarr, ArrApp.Sonarr, ArrApp.Radarr]

STATUS = ArrSystemStatus(
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

HEALTH = [ArrHealthIssue(source="DiskSpace", issue_type="Warning", message="Disk space low")]
QUEUE = ArrQueue(page=1, page_size=25, total_records=0, records=[])
WANTED = ArrWantedMissing(page=1, page_size=25, total_records=0, records=[])


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


@contextmanager
def _mock_client(monkeypatch):
    m = MagicMock()
    m.get_status = AsyncMock(return_value=STATUS)
    m.get_health = AsyncMock(return_value=HEALTH)
    m.get_artists = AsyncMock(return_value=[])
    m.get_albums = AsyncMock(return_value=[])
    m.get_wanted = AsyncMock(return_value=WANTED)
    m.get_queue = AsyncMock(return_value=QUEUE)
    m.get_diskspace = AsyncMock(return_value=[])
    m.get_calendar = AsyncMock(return_value=[])
    m.get_library_total = AsyncMock(return_value=ArrLibraryTotal(count=42))
    m.refresh_series = AsyncMock(return_value=None)
    m.search_missing = AsyncMock(return_value=None)
    m.aclose = AsyncMock(return_value=None)
    with patch("fleet.router._arr_client", return_value=m):
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


def _get(client, path, token):
    return client.get(path, headers={"X-API-Token": token})


# --- GET routes, parametrized over the three *arr apps -----------------------

@pytest.mark.parametrize("app", APPS)
def test_arr_status_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/status?server_id=unraid-main&app={app.value}",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json()["version"] == "2.0.0.1234"
    m.get_status.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_health_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/health?server_id=unraid-main&app={app.value}",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json() == [
        {"source": "DiskSpace", "issue_type": "Warning", "message": "Disk space low", "wiki_url": None}
    ]
    m.get_health.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_artists_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/artists?server_id=unraid-main&app={app.value}",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json() == []
    m.get_artists.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_albums_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/albums?server_id=unraid-main&app={app.value}&artist_id=1&monitored=true",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json() == []
    m.get_albums.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_albums_omits_optional_filters(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/albums?server_id=unraid-main&app={app.value}",
            read_secret,
        )
    assert r.status_code == 200
    m.get_albums.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_wanted_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/wanted?server_id=unraid-main&app={app.value}&page=1&page_size=20",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json()["total_records"] == 0
    m.get_wanted.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_queue_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/queue?server_id=unraid-main&app={app.value}&page=1&page_size=25",
            read_secret,
        )
    assert r.status_code == 200
    m.get_queue.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_diskspace_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/diskspace?server_id=unraid-main&app={app.value}",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json() == []
    m.get_diskspace.assert_called_once()


@pytest.mark.parametrize("app", APPS)
def test_arr_calendar_success(app_client, monkeypatch, app):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            f"/api/fleet/arr/calendar?server_id=unraid-main&app={app.value}&days=7",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json() == []
    m.get_calendar.assert_called_once()


def test_arr_library_total_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = _get(
            client,
            "/api/fleet/arr/library_total?server_id=unraid-main&app=lidarr",
            read_secret,
        )
    assert r.status_code == 200
    assert r.json()["count"] == 42
    m.get_library_total.assert_called_once()


# --- POST routes (scope=write required) --------------------------------------

@pytest.mark.parametrize("app", APPS)
def test_arr_refresh_series_success(app_client, monkeypatch, app):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.post(
            f"/api/fleet/arr/refresh_series?server_id=unraid-main&app={app.value}&artist_id=1",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
    assert r.json()["status"] == "refreshed"
    m.refresh_series.assert_called_once_with(1)


@pytest.mark.parametrize("app", APPS)
def test_arr_search_missing_success(app_client, monkeypatch, app):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.post(
            f"/api/fleet/arr/search_missing?server_id=unraid-main&app={app.value}&artist_id=1",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
    assert r.json()["status"] == "searching"
    m.search_missing.assert_called_once_with(1)


# --- Auth / validation / error paths -----------------------------------------

def test_arr_status_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/arr/status?server_id=unraid-main&app=lidarr")
    assert r.status_code == 401


def test_arr_refresh_series_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.post(
        "/api/fleet/arr/refresh_series?server_id=unraid-main&app=lidarr&artist_id=1"
    )
    assert r.status_code == 401


def test_arr_refresh_series_read_token_forbidden(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/arr/refresh_series?server_id=unraid-main&app=lidarr&artist_id=1",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 403


def test_arr_server_not_found(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = _get(
            client,
            "/api/fleet/arr/status?server_id=nonexistent&app=lidarr",
            read_secret,
        )
    assert r.status_code == 404


def test_arr_unknown_app_rejected(app_client):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    # No mock: the real _arr_client raises ValueError for an unknown app,
    # which the route turns into a redacted 502.
    r = _get(
        client,
        "/api/fleet/arr/status?server_id=unraid-main&app=notanapp",
        read_secret,
    )
    assert r.status_code == 502


def test_arr_transport_error_redacted_502(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    class BoomArrClient:
        def __init__(self, app):
            self.app = app

        async def get_status(self):
            raise OSError("connection refused")

    with patch("fleet.router._arr_client", return_value=BoomArrClient("lidarr")):
        r = _get(
            client,
            "/api/fleet/arr/status?server_id=unraid-main&app=lidarr",
            read_secret,
        )
    assert r.status_code == 502
    assert "not-a-real" not in r.text  # secrets redacted
