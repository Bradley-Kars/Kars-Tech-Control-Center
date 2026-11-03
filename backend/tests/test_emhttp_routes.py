"""backend/fleet/router emhttp routes tests (P4).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. The emhttp client
is mocked, so neither httpx nor a real Unraid server is needed.
Placeholder values only — no real hostnames, emails, or tokens.
"""

import sys
import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {},
    "api_key": "sk-live-placeholder-key",
}

ARRAY_INFO = {"serverName": "tower", "flashSize": "32.00 GB"}
PARITY_STATUS = {"status": "active", "sync": 100.0}
SHARES = {"shares": [{"name": "array"}, {"name": "media"}]}
DISKS = {"disks": [{"name": "disk1", "device": "sda", "status": "READY"}]}


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
    from fleet.config import ServerConfig, save_servers  # noqa: E402

    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


def _patch_emhttp(monkeypatch, responses: dict[str, dict]):
    """Patch fleet.router.RealEmhttpClient to return configured fixtures."""
    mock_client = MagicMock()
    mock_client.get_array_info = AsyncMock(return_value=responses.get("array_info", {}))
    mock_client.get_array_check_status = AsyncMock(
        return_value=responses.get("parity", {})
    )
    mock_client.get_shares = AsyncMock(return_value=responses.get("shares", {}))
    mock_client.get_disks = AsyncMock(return_value=responses.get("disks", {}))

    def fake_factory(*args, **kwargs):  # noqa: ARG001
        return mock_client

    monkeypatch.setattr("fleet.router.RealEmhttpClient", fake_factory)
    return mock_client


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_array_info
# ---------------------------------------------------------------------------


def test_get_array_info_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_emhttp(monkeypatch, {"array_info": ARRAY_INFO})

    r = client.get(
        "/api/fleet/unraid/get_array_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == ARRAY_INFO


def test_get_array_info_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_emhttp(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_array_info?server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404


def test_get_array_info_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_emhttp(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_array_info?server_id=unraid-main")
    assert r.status_code == 401


def test_get_array_info_emhttp_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_emhttp(monkeypatch, {})

    from fleet.emhttp import EmhttpError  # noqa: E402
    from fleet.router import RealEmhttpClient  # noqa: E402

    def failing_factory(*args, **kwargs):  # noqa: ARG001
        mock = MagicMock()
        mock.get_array_info = AsyncMock(
            side_effect=EmhttpError("connection refused: sk-live-placeholder-key")
        )
        return mock

    monkeypatch.setattr("fleet.router.RealEmhttpClient", failing_factory)

    r = client.get(
        "/api/fleet/unraid/get_array_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    body = r.json()
    assert "sk-live-placeholder-key" not in str(body)
    assert "[REDACTED]" in str(body)


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_array_check_status (parity)
# ---------------------------------------------------------------------------


def test_get_array_check_status_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_emhttp(monkeypatch, {"parity": PARITY_STATUS})

    r = client.get(
        "/api/fleet/unraid/get_array_check_status?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == PARITY_STATUS


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_shares
# ---------------------------------------------------------------------------


def test_get_shares_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_emhttp(monkeypatch, {"shares": SHARES})

    r = client.get(
        "/api/fleet/unraid/get_shares?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == SHARES


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_disks
# ---------------------------------------------------------------------------


def test_get_disks_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_emhttp(monkeypatch, {"disks": DISKS})

    r = client.get(
        "/api/fleet/unraid/get_disks?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == DISKS
