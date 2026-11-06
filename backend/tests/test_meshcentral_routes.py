"""backend/fleet/router MeshCentral route tests (P11).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The meshcentral
client is mocked, so neither SSH nor a real MeshCentral is needed.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import ServerConfig, save_servers  # noqa: E402
from fleet.meshcentral_service import (  # noqa: E402
    MeshDevice, DeviceStatus, BatchCommand, BatchResult,
    EnrollmentInfo, SyncResult,
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
        "meshcentral_url": "http://<device>.<tailnet>.ts.net:8444",
        "meshcentral_admin_user": "admin",
        "meshcentral_admin_pass": "not-a-real-mc-pass",
        "meshcentral_group_id": "group123",
    },
    "api_key": "sk-live-placeholder-key",
}

DEVICES = [
    MeshDevice(id="QZUw1234", name="HTPC", group="Home", conn=1, pwr=1),
    MeshDevice(id="ABCD5678", name="Laptop", group="Home", conn=0, pwr=0),
]
DEVICE_STATUS = DeviceStatus(connected=True, cpu_usage=12.5, source="meshcentral")
BATCH_RESULTS = [
    BatchResult(device_id="QZUw1234", success=True, output="uptime: 5 days"),
]
ENROLLMENT_INFO = EnrollmentInfo(
    agent_url="http://<device>.<tailnet>.ts.net:8444/meshagents?id=6&meshid=group123",
    settings_url="http://<device>.<tailnet>.ts.net:8444/meshsettings?id=group123",
    group_id="group123",
    install_command_linux="curl ...",
    install_command_windows="$u = '...'",
)
SYNC_RESULT = SyncResult(
    devices_found=2, devices_matched=1, devices_new=1, devices_updated=1,
    errors=[],
)
FLEET_STATS = {
    "devices_found": 2, "online": 1, "offline": 1, "connected": 0,
    "source": "meshcentral",
}


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


def _mock_client(monkeypatch):
    m = MagicMock()
    m.list_devices = AsyncMock(return_value=DEVICES)
    m.get_device_status = AsyncMock(return_value=DEVICE_STATUS)
    m.execute_batch = AsyncMock(return_value=BATCH_RESULTS)
    m.get_terminal_url = MagicMock(return_value="http://<device>.<tailnet>.ts.net:8444/terminal?device=QZUw1234")
    m.get_file_manager_url = MagicMock(return_value="http://<device>.<tailnet>.ts.net:8444/filemanager?device=QZUw1234")
    m.get_enrollment_info = MagicMock(return_value=ENROLLMENT_INFO)
    m.sync_to_servers_json = AsyncMock(return_value=SYNC_RESULT)
    m.get_fleet_stats = AsyncMock(return_value=FLEET_STATS)
    m.aclose = AsyncMock(return_value=None)
    return patch("fleet.router._meshcentral_client", return_value=m)


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    # U8: KTS_SANDBOX=1 (set in conftest) defaults fleet read-only ON;
    # write-route tests exercise the writeable path.
    monkeypatch.setenv("KTS_FLEET_READONLY", "0")
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, read_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="read")
    _, write_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), read_secret, write_secret, servers_file


# ---------------------------------------------------------------------------
# list_devices
# ---------------------------------------------------------------------------

def test_meshcentral_list_devices_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/list_devices?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["id"] == "QZUw1234"
    assert data[0]["name"] == "HTPC"


def test_meshcentral_list_devices_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/meshcentral/list_devices?server_id=unraid-main")
    assert r.status_code == 401


def test_meshcentral_list_devices_server_not_found(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/list_devices?server_id=nonexistent",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# get_device_status
# ---------------------------------------------------------------------------

def test_meshcentral_get_device_status_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_device_status?server_id=unraid-main&device_id=QZUw1234",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["connected"] is True


def test_meshcentral_get_device_status_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get(
        "/api/fleet/meshcentral/get_device_status?server_id=unraid-main&device_id=QZUw1234"
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# execute_batch (write scope required)
# ---------------------------------------------------------------------------

def test_meshcentral_execute_batch_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/execute_batch",
            json={"server_id": "unraid-main", "device_ids": ["QZUw1234"],
                  "commands": [{"command": "uptime"}]},
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["device_id"] == "QZUw1234"
    assert data[0]["success"] is True


def test_meshcentral_execute_batch_read_scope_rejected(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/execute_batch",
            json={"server_id": "unraid-main", "device_ids": ["QZUw1234"],
                  "commands": [{"command": "uptime"}]},
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 403


def test_meshcentral_execute_batch_missing_body(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/execute_batch",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# get_terminal_url / get_file_manager_url
# ---------------------------------------------------------------------------

def test_meshcentral_get_terminal_url(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_terminal_url?server_id=unraid-main&device_id=QZUw1234",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, str)
    assert "terminal" in data
    assert "QZUw1234" in data


def test_meshcentral_get_file_manager_url(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_file_manager_url?server_id=unraid-main&device_id=QZUw1234",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, str)
    assert "filemanager" in data
    assert "QZUw1234" in data


# ---------------------------------------------------------------------------
# get_enrollment_info
# ---------------------------------------------------------------------------

def test_meshcentral_get_enrollment_info(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_enrollment_info?server_id=unraid-main&device_type=linux",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["group_id"] == "group123"
    assert "meshagents" in data["agent_url"]


# ---------------------------------------------------------------------------
# sync_fleet (write scope required)
# ---------------------------------------------------------------------------

def test_meshcentral_sync_fleet_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/sync_fleet",
            json={"server_id": "unraid-main"},
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["devices_found"] == 2


def test_meshcentral_sync_fleet_read_scope_rejected(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/meshcentral/sync_fleet",
            json={"server_id": "unraid-main"},
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# get_fleet_stats
# ---------------------------------------------------------------------------

def test_meshcentral_get_fleet_stats(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/meshcentral/get_fleet_stats?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["devices_found"] == 2
    assert data["online"] == 1


# ---------------------------------------------------------------------------
# Redacted 502 on SSH failure
# ---------------------------------------------------------------------------

def test_meshcentral_list_devices_ssh_failure_redacted_502(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    m = MagicMock()
    m.list_devices = AsyncMock(side_effect=Exception("SSH connection failed: not-a-real-password leaked"))
    m.get_device_status = AsyncMock(return_value=DEVICE_STATUS)
    m.execute_batch = AsyncMock(return_value=BATCH_RESULTS)
    m.get_terminal_url = MagicMock(return_value="http://x/terminal?device=QZUw1234")
    m.get_file_manager_url = MagicMock(return_value="http://x/filemanager?device=QZUw1234")
    m.get_enrollment_info = MagicMock(return_value=ENROLLMENT_INFO)
    m.sync_to_servers_json = AsyncMock(return_value=SYNC_RESULT)
    m.get_fleet_stats = AsyncMock(return_value=FLEET_STATS)
    m.aclose = AsyncMock(return_value=None)
    with patch("fleet.router._meshcentral_client", return_value=m):
        r = client.get(
            "/api/fleet/meshcentral/list_devices?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 502
    body = r.json()["detail"]
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body or "probe failed" in body
