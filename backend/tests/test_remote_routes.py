"""backend/fleet/router remote shell/file/process route tests (P12).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The remote
client is mocked, so neither SSH nor a real MeshCentral is needed.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import ServerConfig, save_servers  # noqa: E402
from fleet.remote_service import ShellResult, RemoteFileInfo, RemoteProcess  # noqa: E402

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {},
    "meshcentral_device_id": "QZUw1234",
}

SHELL_RESULT = ShellResult(
    device_id="QZUw1234",
    command="uptime",
    exit_code=0,
    stdout="up 5 days",
    stderr="",
    success=True,
)

FILES = [
    RemoteFileInfo(path="/etc/hosts", is_dir=False, size=123, modified="2026-11-03 10:00", permissions="644"),
]

PROCESSES = [
    RemoteProcess(pid=1, name="systemd", cpu_percent=0.1, memory_percent=0.5, user="root", command="systemd"),
]


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


def _mock_client(monkeypatch):
    m = MagicMock()
    m.execute_shell = AsyncMock(return_value=SHELL_RESULT)
    m.list_dir = AsyncMock(return_value=FILES)
    m.get_processes = AsyncMock(return_value=PROCESSES)
    return patch("fleet.router._remote_client", return_value=m)


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    # C3 default-deny: the minted tokens must be listed admin identities.
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "fleet-client")
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, read_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="read")
    _, write_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), read_secret, write_secret, servers_file


# ---------------------------------------------------------------------------
# shell_exec (POST -> scope=write required)
# ---------------------------------------------------------------------------

def test_shell_exec_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main", "command": "uptime", "timeout_secs": 30},
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["device_id"] == "QZUw1234"
    assert data["command"] == "uptime"
    assert data["exit_code"] == 0
    assert data["success"] is True


def test_shell_exec_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.post("/api/fleet/meshcentral/shell_exec", json={"server_id": "unraid-main", "command": "uptime"})
    assert r.status_code == 401


def test_shell_exec_read_scope_rejected(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main", "command": "uptime"},
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 403


def test_shell_exec_missing_body(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 422


def test_shell_exec_missing_command(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main"},
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 422


def test_shell_exec_server_not_found(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "nonexistent", "command": "uptime"},
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 404


def test_shell_exec_ssh_failure_redacted_502(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    m = MagicMock()
    m.execute_shell = AsyncMock(side_effect=Exception("SSH connection failed: not-a-real-password leaked"))
    m.list_dir = AsyncMock(return_value=FILES)
    m.get_processes = AsyncMock(return_value=PROCESSES)
    with patch("fleet.router._remote_client", return_value=m):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main", "command": "uptime"},
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 502
    body = r.json()["detail"]
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body or "probe failed" in body


# ---------------------------------------------------------------------------
# list_dir (GET -> read scope sufficient)
# ---------------------------------------------------------------------------

def test_list_dir_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/list_dir?server_id=unraid-main&path=/etc",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["path"] == "/etc/hosts"
    assert data[0]["is_dir"] is False


def test_list_dir_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/meshcentral/list_dir?server_id=unraid-main&path=/etc")
    assert r.status_code == 401


def test_list_dir_server_not_found(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/list_dir?server_id=nonexistent&path=/etc",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# get_processes (GET -> read scope sufficient)
# ---------------------------------------------------------------------------

def test_get_processes_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_processes?server_id=unraid-main&limit=10",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["pid"] == 1
    assert data[0]["name"] == "systemd"


def test_get_processes_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/meshcentral/get_processes?server_id=unraid-main&limit=10")
    assert r.status_code == 401


def test_get_processes_invalid_limit(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_processes?server_id=unraid-main&limit=notanumber",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Admin enforcement on shell routes (T2)
# ---------------------------------------------------------------------------


def _admin_app_client(tmp_path, monkeypatch, admin_identities, token_label):
    """App + token with `token_label`; KTS_ADMINS_FILE lists
    `admin_identities`. Returns (client, secret, servers_file)."""
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint(token_label, actor_id="fleet-actor", scope="write")
    admins_file = tmp_path / "admins.json"
    admins_file.write_text(json.dumps(admin_identities))
    monkeypatch.setenv("KTS_ADMINS_FILE", str(admins_file))
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), secret, servers_file


def test_shell_exec_requires_admin(tmp_path, monkeypatch):
    """Token whose label is NOT in the admin list -> 403 on shell_exec."""
    client, secret, servers_file = _admin_app_client(
        tmp_path, monkeypatch, ["someone-else"], "fleet-client"
    )
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main", "command": "uptime"},
            headers={"X-API-Token": secret},
        )
    assert r.status_code == 403


def test_shell_exec_allows_admin(tmp_path, monkeypatch):
    """Token whose label IS in the admin list -> shell_exec proceeds."""
    client, secret, servers_file = _admin_app_client(
        tmp_path, monkeypatch, ["fleet-client"], "fleet-client"
    )
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main", "command": "uptime"},
            headers={"X-API-Token": secret},
        )
    assert r.status_code == 200


def test_list_dir_requires_admin(tmp_path, monkeypatch):
    """Non-admin identity -> 403 on list_dir."""
    client, secret, servers_file = _admin_app_client(
        tmp_path, monkeypatch, ["someone-else"], "fleet-client"
    )
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/list_dir?server_id=unraid-main&path=/etc",
            headers={"X-API-Token": secret},
        )
    assert r.status_code == 403


def test_get_processes_requires_admin(tmp_path, monkeypatch):
    """Non-admin identity -> 403 on get_processes."""
    client, secret, servers_file = _admin_app_client(
        tmp_path, monkeypatch, ["someone-else"], "fleet-client"
    )
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_processes?server_id=unraid-main&limit=10",
            headers={"X-API-Token": secret},
        )
    assert r.status_code == 403


