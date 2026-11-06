"""U8: KTS_FLEET_READONLY puts fleet write routes behind a 403.

``KTS_FLEET_READONLY=1`` blocks every fleet write route (docker actions,
run command, restart, shell, server save/remove) with HTTP 403 and detail
"fleet is read-only on this instance". When unset, read-only defaults ON
if ``KTS_SANDBOX=1``; an explicit ``KTS_FLEET_READONLY=0`` wins.

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. No real hosts are
contacted. Placeholder values only.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import ServerConfig, save_servers  # noqa: E402
from fleet.router import SshHelper  # noqa: E402
from fleet.transport import SshResult, SshCommandError  # noqa: E402

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

# Every fleet write route U8 must guard: (method, path, body)
WRITE_ROUTES = [
    ("post", "/api/fleet/servers", FIXTURE_SERVER),
    ("delete", "/api/fleet/servers/unraid-main", None),
    ("post", "/api/fleet/docker/start", {"server_id": "unraid-main", "container": "nextcloud"}),
    ("post", "/api/fleet/docker/stop", {"server_id": "unraid-main", "container": "nextcloud"}),
    ("post", "/api/fleet/docker/restart", {"server_id": "unraid-main", "container": "nextcloud"}),
    ("post", "/api/fleet/docker/logs", {"server_id": "unraid-main", "container": "nextcloud", "lines": 10}),
    ("post", "/api/fleet/meshcentral/execute_batch", {"server_id": "unraid-main", "device_ids": ["d1"], "commands": [{"command": "uptime"}]}),
    ("post", "/api/fleet/meshcentral/shell_exec", {"server_id": "unraid-main", "command": "uptime"}),
]


def _make_app_client(tmp_path, monkeypatch, readonly: bool | None):
    """Build a write-scoped TestClient with KTS_FLEET_READONLY set to
    "1"/"0" or deleted entirely (None). Returns (client, secret, servers_file)."""
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    if readonly is True:
        monkeypatch.setenv("KTS_FLEET_READONLY", "1")
    elif readonly is False:
        monkeypatch.setenv("KTS_FLEET_READONLY", "0")
    else:
        monkeypatch.delenv("KTS_FLEET_READONLY", raising=False)
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    # shell_exec also requires an admin identity (require_admin).
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "fleet-client")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), secret, servers_file


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


# ---------------------------------------------------------------------------
# GET /api/fleet/readonly reflects the env
# ---------------------------------------------------------------------------


def test_readonly_endpoint_true_when_env_one(tmp_path, monkeypatch):
    client, secret, _servers_file = _make_app_client(tmp_path, monkeypatch, True)
    r = client.get("/api/fleet/readonly", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json() == {"readonly": True}


def test_readonly_endpoint_false_when_env_zero(tmp_path, monkeypatch):
    client, secret, _servers_file = _make_app_client(tmp_path, monkeypatch, False)
    r = client.get("/api/fleet/readonly", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json() == {"readonly": False}


def test_readonly_defaults_on_with_sandbox(tmp_path, monkeypatch):
    """Unset KTS_FLEET_READONLY + KTS_SANDBOX=1 (conftest default) -> ON."""
    monkeypatch.delenv("KTS_FLEET_READONLY", raising=False)
    client, secret, _servers_file = _make_app_client(tmp_path, monkeypatch, None)
    assert os.environ.get("KTS_SANDBOX") == "1"
    r = client.get("/api/fleet/readonly", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json() == {"readonly": True}


def test_readonly_defaults_off_without_sandbox(tmp_path, monkeypatch):
    """Unset KTS_FLEET_READONLY + unset KTS_SANDBOX -> OFF."""
    monkeypatch.delenv("KTS_FLEET_READONLY", raising=False)
    monkeypatch.delenv("KTS_SANDBOX", raising=False)
    client, secret, _servers_file = _make_app_client(tmp_path, monkeypatch, None)
    r = client.get("/api/fleet/readonly", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json() == {"readonly": False}


# ---------------------------------------------------------------------------
# Every guarded write route returns 403 with the exact detail when read-only
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("method,path,body", WRITE_ROUTES)
def test_write_route_403_when_readonly(tmp_path, monkeypatch, method, path, body):
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, True)
    _seed(servers_file, FIXTURE_SERVER)
    fn = getattr(client, method)
    kwargs = {"headers": {"X-API-Token": secret}}
    if body is not None:
        kwargs["json"] = body
    r = fn(path, **kwargs)
    assert r.status_code == 403, f"{method.upper()} {path}: {r.text}"
    assert r.json() == {"detail": "fleet is read-only on this instance"}


def test_readonly_403_outranks_not_found(tmp_path, monkeypatch):
    """The 403 is raised before route logic, even for an unknown server."""
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, True)
    r = client.delete(
        "/api/fleet/servers/does-not-exist",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "fleet is read-only on this instance"


def test_no_token_still_401_when_readonly(tmp_path, monkeypatch):
    client, _secret, servers_file = _make_app_client(tmp_path, monkeypatch, True)
    r = client.post("/api/fleet/docker/start", json={"server_id": "x", "container": "y"})
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# Read route is unaffected by read-only mode
# ---------------------------------------------------------------------------


def test_list_servers_still_works_when_readonly(tmp_path, monkeypatch):
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, True)
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/servers", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1


# ---------------------------------------------------------------------------
# Writeable path still works when read-only is off
# ---------------------------------------------------------------------------


def test_docker_start_proceeds_when_not_readonly(tmp_path, monkeypatch):
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, False)
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        if command.startswith("docker start"):
            return SshResult(exit_code=0, stdout="nextcloud\n", stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.post(
        "/api/fleet/docker/start",
        json={"server_id": "unraid-main", "container": "nextcloud"},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == "Started nextcloud"


def test_shell_exec_proceeds_when_not_readonly(tmp_path, monkeypatch):
    from unittest.mock import AsyncMock, MagicMock, patch

    from fleet.remote_service import ShellResult  # noqa: E402

    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, False)
    _seed(servers_file, FIXTURE_SERVER)
    m = MagicMock()
    m.execute_shell = AsyncMock(
        return_value=ShellResult(
            device_id="d1", command="uptime", exit_code=0, stdout="up 5 days", stderr="", success=True
        )
    )
    with patch("fleet.router._remote_client", return_value=m):
        r = client.post(
            "/api/fleet/meshcentral/shell_exec",
            json={"server_id": "unraid-main", "command": "uptime"},
            headers={"X-API-Token": secret},
        )
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True


def test_save_server_proceeds_when_not_readonly(tmp_path, monkeypatch):
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, False)
    r = client.post("/api/fleet/servers", json=FIXTURE_SERVER, headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == "unraid-main"


def test_remove_server_proceeds_when_not_readonly(tmp_path, monkeypatch):
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, False)
    _seed(servers_file, FIXTURE_SERVER)
    r = client.delete("/api/fleet/servers/unraid-main", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    assert r.json() == {"removed": "unraid-main"}


def test_execute_batch_proceeds_when_not_readonly(tmp_path, monkeypatch):
    from unittest.mock import AsyncMock, MagicMock, patch

    from fleet.meshcentral_service import BatchResult  # noqa: E402

    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, False)
    _seed(servers_file, FIXTURE_SERVER)
    m = MagicMock()
    m.execute_batch = AsyncMock(
        return_value=[BatchResult(device_id="d1", success=True, output="up\n", error=None)]
    )
    with patch("fleet.router._meshcentral_client", return_value=m):
        r = client.post(
            "/api/fleet/meshcentral/execute_batch",
            json={"server_id": "unraid-main", "device_ids": ["d1"], "commands": [{"command": "uptime"}]},
            headers={"X-API-Token": secret},
        )
    assert r.status_code == 200, r.text
    assert r.json()[0]["success"] is True


def test_execute_batch_invalid_body_still_422_when_not_readonly(tmp_path, monkeypatch):
    client, secret, servers_file = _make_app_client(tmp_path, monkeypatch, False)
    r = client.post(
        "/api/fleet/meshcentral/execute_batch",
        json={"server_id": "unraid-main"},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 422, r.text
