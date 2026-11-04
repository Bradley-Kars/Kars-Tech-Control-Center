"""backend/fleet/router.py — POST /api/fleet/test_connection (P1).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. SSH is faked by
patching SshHelper.run, so neither asyncssh nor a real network is needed.
Placeholder values only — no real hostnames, emails, or tokens.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable
from core.bridge import create_app
from fleet.router import SshHelper
from fleet.transport import SshResult, SshCommandError, TransportError

FIXTURE_CONFIG = {
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

EMPTY_SERVICES = {
    "graphql": False,
    "nextcloud": False,
    "lidarr": False,
    "homeassistant": False,
    "adguard": False,
    "phone": False,
    "plex": False,
    "scrutiny": False,
    "uptimekuma": False,
    "invoiceninja": False,
    "aurral": False,
    "your_spotify": False,
    "dozzle": False,
}


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    """App + write-scoped client token; servers.json in a temp dir."""
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), secret, servers_file


class TestTestConnection:
    # --- auth & validation ---------------------------------------------

    def test_no_token_401(self, app_client, monkeypatch):
        client, _secret, _servers_file = app_client
        self._patch_ssh(monkeypatch, success=True)
        r = client.post("/api/fleet/test_connection", json=FIXTURE_CONFIG)
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_read_scoped_token_403(self, app_client, monkeypatch):
        client, _secret, _servers_file = app_client
        self._patch_ssh(monkeypatch, success=True)
        table_dir = Path(tempfile.mkdtemp()) / "auth"
        table = TokenTable(table_dir / "token-table.json")
        _, read_secret = table.mint("fleet-reader", actor_id="fleet-reader", scope="read")
        app = create_app(table)
        r = (
            TestClient(app, base_url="http://127.0.0.1")
            .post(
                "/api/fleet/test_connection",
                json=FIXTURE_CONFIG,
                headers={"X-API-Token": read_secret},
            )
        )
        assert r.status_code == 403

    def test_non_dict_body_422(self, app_client, monkeypatch):
        client, secret, _servers_file = app_client
        self._patch_ssh(monkeypatch, success=True)
        r = client.post(
            "/api/fleet/test_connection",
            content=b"not json",
            headers={"X-API-Token": secret, "content-type": "application/json"},
        )
        assert r.status_code == 422
        assert "detail" in r.json()

    def test_empty_body_422(self, app_client, monkeypatch):
        client, secret, _servers_file = app_client
        self._patch_ssh(monkeypatch, success=True)
        r = client.post(
            "/api/fleet/test_connection", json={}, headers={"X-API-Token": secret}
        )
        assert r.status_code == 422
        assert "detail" in r.json()

    def test_missing_id_422(self, app_client, monkeypatch):
        client, secret, _servers_file = app_client
        self._patch_ssh(monkeypatch, success=True)
        bad = dict(FIXTURE_CONFIG)
        del bad["id"]
        r = client.post(
            "/api/fleet/test_connection", json=bad, headers={"X-API-Token": secret}
        )
        assert r.status_code == 422
        assert "detail" in r.json()

    # --- success path ---------------------------------------------------

    def test_success_returns_result(self, app_client, monkeypatch):
        client, secret, servers_file = app_client
        commands: list[str] = []

        async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
            commands.append(command)
            if command == "hostname":
                return SshResult(exit_code=0, stdout="home-server\n", stderr="")
            if command == "uname -r":
                return SshResult(exit_code=0, stdout="6.1.15-unraid\n", stderr="")
            raise SshCommandError(f"unexpected command: {command}")

        monkeypatch.setattr(SshHelper, "run", fake_run)
        r = client.post(
            "/api/fleet/test_connection",
            json=FIXTURE_CONFIG,
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {
            "success": True,
            "message": "Connected to home-server",
            "hostname": "home-server",
            "os": "6.1.15-unraid",
            "services": EMPTY_SERVICES,
        }
        assert commands == ["hostname", "uname -r"]
        # the probe config is not persisted
        assert not servers_file.exists()

    def test_ssh_command_error_returns_success_false_and_redacts_password(
        self, app_client, monkeypatch
    ):
        client, secret, _servers_file = app_client

        async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
            raise SshCommandError(
                "connect failed: password=not-a-real-password for user root"
            )

        monkeypatch.setattr(SshHelper, "run", fake_run)
        r = client.post(
            "/api/fleet/test_connection",
            json=FIXTURE_CONFIG,
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is False
        assert "[REDACTED]" in body["message"]
        assert "not-a-real-password" not in body["message"]
        assert body["hostname"] == "unknown"
        assert body["os"] == "unknown"
        assert body["services"] == EMPTY_SERVICES

    def test_transport_error_returns_success_false(self, app_client, monkeypatch):
        client, secret, _servers_file = app_client

        async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
            raise TransportError("network is unreachable")

        monkeypatch.setattr(SshHelper, "run", fake_run)
        r = client.post(
            "/api/fleet/test_connection",
            json=FIXTURE_CONFIG,
            headers={"X-API-Token": secret},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is False
        assert "network is unreachable" in body["message"]
        assert body["hostname"] == "unknown"

    # --- helper ---------------------------------------------------------

    def _patch_ssh(self, monkeypatch, success: bool):
        async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
            if success:
                return SshResult(exit_code=0, stdout="home-server\n", stderr="")
            raise SshCommandError("boom")

        monkeypatch.setattr(SshHelper, "run", fake_run)
