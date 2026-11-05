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
from fleet.router import SshHelper  # noqa: E402
from fleet.transport import SshResult, SshCommandError, TransportError  # noqa: E402

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


def _patch_ssh(monkeypatch, responses: dict[str, str]):
    """Respond to SSH commands by matching the command string against keys."""
    counters: dict[str, int] = {}

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        for key, value in responses.items():
            if command == key or command.startswith(key):
                idx = counters.get(key, 0)
                counters[key] = idx + 1
                return SshResult(exit_code=0, stdout=value, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    return counters


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


# ---------------------------------------------------------------------------
# C1: Unraid deferred commands ported from the original Rust command module.
# All run over SSH (SshHelper) — the web backend has no GraphQL, so
# get_plugins lists the plugin directory over SSH. Placeholder values only.
# ---------------------------------------------------------------------------

PS_OUTPUT = "PID USER COMMAND\n1 root init\n123 root ps aux\n"
SYSLOG_OUTPUT = "Jan 1 00:00:00 kernel boot\nJan 1 00:01:00 sshd start\n"
USER_SCRIPTS_OUTPUT = "backup.sh\nmonitor.sh\n"
PLUGINS_OUTPUT = "docker\nnvidia\n"
NETWORK_OUTPUT = "eth0 192.168.1.10/24\n"
TAILSCALE_OUTPUT = "100.64.0.1 unraid-main active\n"


def _unraid_headers(secret):
    return {"X-API-Token": secret}


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_processes
# ---------------------------------------------------------------------------


def test_get_processes_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"ps aux --sort=-%cpu | head -25": PS_OUTPUT})

    r = client.get(
        "/api/fleet/unraid/get_processes?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == PS_OUTPUT


def test_get_processes_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_processes?server_id=missing",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_get_processes_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_processes?server_id=unraid-main")
    assert r.status_code == 401


def test_get_processes_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.get(
        "/api/fleet/unraid/get_processes?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_syslog
# ---------------------------------------------------------------------------


def test_get_syslog_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"tail -50 /var/log/syslog": SYSLOG_OUTPUT})

    r = client.get(
        "/api/fleet/unraid/get_syslog?server_id=unraid-main&lines=50",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == SYSLOG_OUTPUT


def test_get_syslog_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_syslog?server_id=missing",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_get_syslog_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_syslog?server_id=unraid-main&lines=50")
    assert r.status_code == 401


def test_get_syslog_invalid_lines(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_syslog?server_id=unraid-main&lines=notanumber",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 422


def test_get_syslog_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.get(
        "/api/fleet/unraid/get_syslog?server_id=unraid-main&lines=50",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_user_scripts
# ---------------------------------------------------------------------------


def test_get_user_scripts_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(
        monkeypatch, {"ls /boot/config/plugins/user.scripts/scripts/": USER_SCRIPTS_OUTPUT}
    )

    r = client.get(
        "/api/fleet/unraid/get_user_scripts?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == USER_SCRIPTS_OUTPUT


def test_get_user_scripts_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_user_scripts?server_id=missing",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_get_user_scripts_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_user_scripts?server_id=unraid-main")
    assert r.status_code == 401


def test_get_user_scripts_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.get(
        "/api/fleet/unraid/get_user_scripts?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body


# ---------------------------------------------------------------------------
# POST /api/fleet/unraid/run_user_script
# ---------------------------------------------------------------------------


def test_run_user_script_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(
        monkeypatch,
        {"/boot/config/plugins/user.scripts/scripts/backup.sh/run_script.sh": "script done\n"},
    )

    r = client.post(
        "/api/fleet/unraid/run_user_script",
        json={"server_id": "unraid-main", "script": "backup.sh"},
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == "script done\n"


def test_run_user_script_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.post(
        "/api/fleet/unraid/run_user_script",
        json={"server_id": "missing", "script": "backup.sh"},
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_run_user_script_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.post(
        "/api/fleet/unraid/run_user_script",
        json={"server_id": "unraid-main", "script": "backup.sh"},
    )
    assert r.status_code == 401


def test_run_user_script_missing_fields(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.post(
        "/api/fleet/unraid/run_user_script",
        json={"server_id": "unraid-main"},
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 422


def test_run_user_script_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.post(
        "/api/fleet/unraid/run_user_script",
        json={"server_id": "unraid-main", "script": "backup.sh"},
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_plugins
# ---------------------------------------------------------------------------


def test_get_plugins_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"ls /usr/local/emhttp/plugins": PLUGINS_OUTPUT})

    r = client.get(
        "/api/fleet/unraid/get_plugins?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == ["docker", "nvidia"]


def test_get_plugins_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_plugins?server_id=missing",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_get_plugins_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_plugins?server_id=unraid-main")
    assert r.status_code == 401


def test_get_plugins_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.get(
        "/api/fleet/unraid/get_plugins?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_network_interfaces
# ---------------------------------------------------------------------------


def test_get_network_interfaces_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"ip -br addr show": NETWORK_OUTPUT})

    r = client.get(
        "/api/fleet/unraid/get_network_interfaces?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == NETWORK_OUTPUT


def test_get_network_interfaces_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_network_interfaces?server_id=missing",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_get_network_interfaces_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_network_interfaces?server_id=unraid-main")
    assert r.status_code == 401


def test_get_network_interfaces_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.get(
        "/api/fleet/unraid/get_network_interfaces?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_tailscale_peers
# ---------------------------------------------------------------------------


def test_get_tailscale_peers_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"tailscale status": TAILSCALE_OUTPUT})

    r = client.get(
        "/api/fleet/unraid/get_tailscale_peers?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 200, r.text
    assert r.json() == TAILSCALE_OUTPUT


def test_get_tailscale_peers_not_found(app_client, monkeypatch):
    client, secret, _ = app_client
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/unraid/get_tailscale_peers?server_id=missing",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 404


def test_get_tailscale_peers_no_token(app_client, monkeypatch):
    client, _, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get("/api/fleet/unraid/get_tailscale_peers?server_id=unraid-main")
    assert r.status_code == 401


def test_get_tailscale_peers_ssh_error_redacted(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    def failing_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("connection refused: not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", failing_run)

    r = client.get(
        "/api/fleet/unraid/get_tailscale_peers?server_id=unraid-main",
        headers=_unraid_headers(secret),
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
    assert "[REDACTED]" in body
