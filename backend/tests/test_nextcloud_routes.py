"""backend/fleet/router Nextcloud route tests (P6).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The nextcloud
client is mocked, so neither httpx nor a real Nextcloud is needed.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from dataclasses import asdict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import ServerConfig, save_servers  # noqa: E402
from fleet.nextcloud_service import (  # noqa: E402
    NextcloudInfo,
    NextcloudSystemStatus,
    NextcloudStorage,
    NextcloudUser,
    NextcloudActivity,
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
        "nextcloud_url": "http://<device>.<tailnet>.ts.net:8080",
        "nextcloud_user": "alice",
        "nextcloud_pass": "not-a-real-nextcloud-pass",
    },
    "api_key": "sk-live-placeholder-key",
}

INFO = NextcloudInfo(
    version="34.0.3", versionstring="34.0.3", edition="Community"
)
STATUS = NextcloudSystemStatus(
    installed=True, maintenance=False, needs_db_upgrade=False,
    version="34.0.3", versionstring="34.0.3", edition="Community",
    productname="Nextcloud", extended_support=False,
)
STORAGE = NextcloudStorage(
    num_users=3, num_files=60509, num_storages=5,
    num_storages_local=2, num_storages_home=2, num_storages_other=1,
)
USERS = [
    NextcloudUser(
        id="alice", display_name="Alice", enabled=True,
        quota={"free": 100, "used": 10, "total": 100, "relative": 10},
        email="alice@example.com", groups=["admin"], backend="internal",
        subadmin=[], last_login=1_700_000_000,
    )
]
ACTIVITY = NextcloudActivity(activities=[])


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


def _mock_client(monkeypatch_or_patch, **returns):
    """Patch fleet.router._nextcloud_client to return a mock client."""
    client = MagicMock()
    client.aclose = AsyncMock()
    client.get_info = AsyncMock(return_value=returns.get("info", INFO))
    client.get_status = AsyncMock(return_value=returns.get("status", STATUS))
    client.get_storage = AsyncMock(return_value=returns.get("storage", STORAGE))
    client.get_users = AsyncMock(return_value=returns.get("users", USERS))
    client.get_activity = AsyncMock(return_value=returns.get("activity", ACTIVITY))
    return patch("fleet.router._nextcloud_client", return_value=client)


# ---------------------------------------------------------------------------
# GET /api/fleet/nextcloud/info
# ---------------------------------------------------------------------------


def test_nextcloud_info_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.get(
            "/api/fleet/nextcloud/info?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == asdict(INFO)
        m.return_value.get_info.assert_awaited_once()


def test_nextcloud_info_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/nextcloud/info?server_id=unraid-main")
    assert r.status_code == 401, r.text


def test_nextcloud_info_server_not_found(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/nextcloud/info?server_id=missing",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# GET /api/fleet/nextcloud/status
# ---------------------------------------------------------------------------


def test_nextcloud_status_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.get(
            "/api/fleet/nextcloud/status?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == asdict(STATUS)
        m.return_value.get_status.assert_awaited_once()


def test_nextcloud_status_server_not_found(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/nextcloud/status?server_id=missing",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# GET /api/fleet/nextcloud/storage
# ---------------------------------------------------------------------------


def test_nextcloud_storage_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.get(
            "/api/fleet/nextcloud/storage?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == asdict(STORAGE)
        m.return_value.get_storage.assert_awaited_once()


# ---------------------------------------------------------------------------
# GET /api/fleet/nextcloud/users
# ---------------------------------------------------------------------------


def test_nextcloud_users_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.get(
            "/api/fleet/nextcloud/users?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == [asdict(u) for u in USERS]
        m.return_value.get_users.assert_awaited_once()


# ---------------------------------------------------------------------------
# GET /api/fleet/nextcloud/activity
# ---------------------------------------------------------------------------


def test_nextcloud_activity_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        r = client.get(
            "/api/fleet/nextcloud/activity?server_id=unraid-main&limit=20",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        assert r.json() == asdict(ACTIVITY)
        m.return_value.get_activity.assert_awaited_once_with(20)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


def test_nextcloud_info_redacted_502(app_client, monkeypatch):
    from fleet.nextcloud_service import NextcloudError  # noqa: E402

    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        # The message carries a server secret (the api_key); the router must
        # redact it before the response reaches the client.
        m.return_value.get_info = AsyncMock(
            side_effect=NextcloudError("upstream failed: sk-live-placeholder-key")
        )
        r = client.get(
            "/api/fleet/nextcloud/info?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 502, r.text
        body = str(r.json())
        assert "sk-live-placeholder-key" not in body
        assert "[REDACTED]" in body


def test_nextcloud_info_nextcloud_error_502(app_client, monkeypatch):
    from fleet.nextcloud_service import NextcloudError  # noqa: E402

    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch) as m:
        m.return_value.get_info = AsyncMock(side_effect=NextcloudError("boom"))
        r = client.get(
            "/api/fleet/nextcloud/info?server_id=unraid-main",
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 502, r.text
