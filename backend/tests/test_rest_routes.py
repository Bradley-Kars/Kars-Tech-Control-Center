"""backend/fleet/router REST route tests (P5).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The rest_service
functions are mocked, so neither httpx nor a real service is needed.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import ServerConfig, save_servers  # noqa: E402
from fleet.rest_service import ServiceHealth  # noqa: E402

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {
        "plex_url": "http://<device>.<tailnet>.ts.net:32400",
        "plex_token": "placeholder-plex-token",
    },
    "api_key": "sk-live-placeholder-key",
}


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), secret, servers_file


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


# ---------------------------------------------------------------------------
# GET /api/fleet/rest/health
# ---------------------------------------------------------------------------


def test_rest_health_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    health = ServiceHealth(
        service="plex",
        label="Plex",
        url="http://<device>.<tailnet>.ts.net:32400",
        reachable=True,
        detail="OK",
    )
    with patch("fleet.router.probe", AsyncMock(return_value=health)) as m:
        r = client.get(
            "/api/fleet/rest/health?service=plex&server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == {
            "service": "plex",
            "label": "Plex",
            "url": "http://<device>.<tailnet>.ts.net:32400",
            "reachable": True,
            "detail": "OK",
        }
        m.assert_awaited_once()


def test_rest_health_unknown_service(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/rest/health?service=notaservice&server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 422, r.text


def test_rest_health_server_not_found(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/rest/health?service=plex&server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404, r.text


def test_rest_health_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/rest/health?service=plex&server_id=unraid-main"
    )
    assert r.status_code == 401, r.text


def test_rest_health_unreachable(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    health = ServiceHealth(
        service="flaresolverr",
        label="FlareSolverr",
        url="",
        reachable=False,
        detail="flaresolverr_url not configured",
    )
    with patch("fleet.router.probe", AsyncMock(return_value=health)):
        r = client.get(
            "/api/fleet/rest/health?service=flaresolverr&server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json()["reachable"] is False


# ---------------------------------------------------------------------------
# GET /api/fleet/rest/plex/identity
# ---------------------------------------------------------------------------


def test_rest_plex_identity_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    identity = {
        "machine_identifier": "plex-test-001",
        "version": "1.43.4.10903-e5521bd8c",
        "claimed": True,
    }
    with patch("fleet.router.plex_identity", AsyncMock(return_value=MagicMock(
        machine_identifier="plex-test-001",
        version="1.43.4.10903-e5521bd8c",
        claimed=True,
    ))) as m:
        r = client.get(
            "/api/fleet/rest/plex/identity?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == identity
        m.assert_awaited_once()


def test_rest_plex_identity_server_not_found(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/rest/plex/identity?server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# GET /api/fleet/rest/plex/libraries
# ---------------------------------------------------------------------------


def test_rest_plex_libraries_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    libraries = [
        {
            "key": "1",
            "title": "Movies",
            "library_type": "movie",
            "uuid": "u1",
            "scanning": False,
            "updated_at": 1_700_000_000,
        },
        {
            "key": "2",
            "title": "TV Shows",
            "library_type": "show",
            "uuid": "u2",
            "scanning": True,
            "updated_at": 1_700_000_001,
        },
    ]
    with patch("fleet.router.plex_libraries", AsyncMock(return_value=[
        MagicMock(
            key="1", title="Movies", library_type="movie", uuid="u1",
            scanning=False, updated_at=1_700_000_000,
        ),
        MagicMock(
            key="2", title="TV Shows", library_type="show", uuid="u2",
            scanning=True, updated_at=1_700_000_001,
        ),
    ])):
        r = client.get(
            "/api/fleet/rest/plex/libraries?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == libraries


def test_rest_plex_libraries_server_not_found(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/rest/plex/libraries?server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404, r.text
