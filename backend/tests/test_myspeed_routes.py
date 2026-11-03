"""backend/fleet myspeed routes (P10).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. SSH is faked by
patching SshHelper.run, so neither asyncssh nor a real MySpeed server is
needed. Placeholder values only — no real hostnames, emails, or tokens.
"""

import sys
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.router import SshHelper  # noqa: E402
from fleet.transport import SshResult, SshCommandError, TransportError  # noqa: E402

STATS_ROW = "935|201.2|95.8|12.3|450.0|120.0|5.0"
TEST_ROW = "1|2026-10-01T10:00:00Z|215.3|98.2|11.5|3|res-abc"
SERVER_ROW = "1|Chicago|http://chicago.example:8080|||0|0"

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {"myspeed_db_path": "/mnt/user/appdata/myspeed/storage.db"},
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
    from fleet.config import ServerConfig, save_servers  # noqa: E402

    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


def _patch_ssh(monkeypatch, responses: dict[str, str]):
    """Respond to SSH sqlite3 commands by matching the SQL inside them."""

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        for key, output in responses.items():
            if key in command:
                return SshResult(exit_code=0, stdout=output, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)


# ---------------------------------------------------------------------------
# GET /api/fleet/myspeed/summary
# ---------------------------------------------------------------------------


def test_myspeed_summary_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(
        monkeypatch,
        {
            "COUNT(*)": STATS_ROW,
            "ORDER BY id DESC": TEST_ROW,
            "FROM nodes": SERVER_ROW,
        },
    )

    r = client.get(
        "/api/fleet/myspeed/summary?server_id=unraid-main&limit=50",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stats"]["total_tests"] == 935
    assert body["stats"]["avg_download"] == 201.2
    assert body["stats"]["avg_upload"] == 95.8
    assert body["stats"]["min_ping"] == 5.0
    assert len(body["recent_tests"]) == 1
    assert body["recent_tests"][0]["download"] == 215.3
    assert len(body["servers"]) == 1
    assert body["servers"][0]["name"] == "Chicago"


def test_myspeed_summary_default_limit(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    seen = []

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        seen.append(command)
        if "ORDER BY id DESC" in command:
            return SshResult(exit_code=0, stdout=TEST_ROW, stderr="")
        if "COUNT(*)" in command:
            return SshResult(exit_code=0, stdout=STATS_ROW, stderr="")
        if "FROM nodes" in command:
            return SshResult(exit_code=0, stdout=SERVER_ROW, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)

    client.get(
        "/api/fleet/myspeed/summary?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert any("LIMIT 50" in c for c in seen), seen


# ---------------------------------------------------------------------------
# GET /api/fleet/myspeed/tests
# ---------------------------------------------------------------------------


def test_myspeed_tests_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"ORDER BY id DESC": TEST_ROW})

    r = client.get(
        "/api/fleet/myspeed/tests?server_id=unraid-main&limit=10",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["server_id"] == 3


# ---------------------------------------------------------------------------
# GET /api/fleet/myspeed/servers
# ---------------------------------------------------------------------------


def test_myspeed_servers_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"FROM nodes": SERVER_ROW})

    r = client.get(
        "/api/fleet/myspeed/servers?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["name"] == "Chicago"


# ---------------------------------------------------------------------------
# auth / not found / ssh failure
# ---------------------------------------------------------------------------


def test_no_token_401(app_client, monkeypatch):
    client, _secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    for path in (
        "/api/fleet/myspeed/summary?server_id=unraid-main",
        "/api/fleet/myspeed/tests?server_id=unraid-main",
        "/api/fleet/myspeed/servers?server_id=unraid-main",
    ):
        r = client.get(path)
        assert r.status_code == 401, f"{path}: {r.text}"


def test_unknown_server_404(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.get(
        "/api/fleet/myspeed/summary?server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404, r.text
    assert "detail" in r.json()


def test_ssh_command_error_returns_502(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError(f"sqlite3: no such table: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/myspeed/summary?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body


def test_transport_error_returns_502(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        raise TransportError("network is unreachable")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/myspeed/summary?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    assert "network is unreachable" in r.json()["detail"]
