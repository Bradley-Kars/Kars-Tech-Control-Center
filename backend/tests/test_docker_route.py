"""backend/fleet/docker.py — Docker containers over SSH (P3).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. SSH is faked by
patching SshHelper.run, so neither asyncssh nor a real Docker daemon is
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

DOCKER_PS_OUTPUT = """{"ID":"7f1a2b3c4d5e","Names":"nextcloud","Image":"linuxserver/nextcloud:latest","State":"running","Status":"Up 2 hours"}
{"ID":"8e9d0c1b2a3f","Names":"plex","Image":"plexinc/pms-docker:latest","State":"exited","Status":"Exited (0) 3 days ago"}
"""


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


def _patch_ssh(monkeypatch, responses: dict[str, str | list[str]]):
    """Respond to SSH commands by matching the command string against keys.

    A value may be a list; successive matching calls cycle through it.
    """
    counters: dict[str, int] = {}

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        for key, value in responses.items():
            if command == key or command.startswith(key):
                if isinstance(value, list):
                    idx = counters.get(key, 0)
                    counters[key] = idx + 1
                    output = value[idx % len(value)]
                else:
                    output = value
                return SshResult(exit_code=0, stdout=output, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    return counters


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_docker_containers
# ---------------------------------------------------------------------------


def test_list_containers_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"docker ps": DOCKER_PS_OUTPUT})

    r = client.get(
        "/api/fleet/unraid/get_docker_containers?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 2
    first, second = body
    assert first["id"] == "7f1a2b3c4d5e"
    assert first["name"] == "nextcloud"
    assert first["image"] == "linuxserver/nextcloud:latest"
    assert first["status"] == "Up 2 hours"
    assert first["state"] == "running"
    assert first["auto_start"] is False
    assert second["id"] == "8e9d0c1b2a3f"
    assert second["name"] == "plex"
    assert second["state"] == "exited"


def test_list_containers_empty(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"docker ps": ""})

    r = client.get(
        "/api/fleet/unraid/get_docker_containers?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


# ---------------------------------------------------------------------------
# POST /api/fleet/docker/start|stop|restart
# ---------------------------------------------------------------------------


def test_docker_start_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"docker start": "nextcloud\n"})

    r = client.post(
        "/api/fleet/docker/start",
        json={"server_id": "unraid-main", "container": "nextcloud"},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == "Started nextcloud"


def test_docker_stop_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"docker stop": "nextcloud\n"})

    r = client.post(
        "/api/fleet/docker/stop",
        json={"server_id": "unraid-main", "container": "nextcloud"},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == "Stopped nextcloud"


def test_docker_restart_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"docker restart": "nextcloud\n"})

    r = client.post(
        "/api/fleet/docker/restart",
        json={"server_id": "unraid-main", "container": "nextcloud"},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == "Restarted nextcloud"


# ---------------------------------------------------------------------------
# POST /api/fleet/docker/logs
# ---------------------------------------------------------------------------


def test_docker_logs_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {"docker logs": "[2026-11-03] request started\n[2026-11-03] request finished\n"})

    r = client.post(
        "/api/fleet/docker/logs",
        json={"server_id": "unraid-main", "container": "nextcloud", "lines": 50},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "request started" in body
    assert "request finished" in body


# ---------------------------------------------------------------------------
# validation / not found
# ---------------------------------------------------------------------------


def test_server_not_found_404(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    for path, method, payload in (
        ("/api/fleet/unraid/get_docker_containers?server_id=missing", "get", None),
        ("/api/fleet/docker/start", "post", {"server_id": "missing", "container": "nextcloud"}),
    ):
        fn = getattr(client, method)
        r = fn(path, json=payload, headers={"X-API-Token": secret}) if payload else fn(path, headers={"X-API-Token": secret})
        assert r.status_code == 404, f"{path}: {r.text}"
        assert "detail" in r.json()


def test_missing_container_422(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.post(
        "/api/fleet/docker/start",
        json={"server_id": "unraid-main"},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 422, r.text


def test_empty_container_422(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    r = client.post(
        "/api/fleet/docker/stop",
        json={"server_id": "unraid-main", "container": ""},
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------


def test_no_token_401(app_client, monkeypatch):
    client, _secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})

    for path in (
        "/api/fleet/unraid/get_docker_containers?server_id=unraid-main",
        "/api/fleet/docker/start",
    ):
        if path.startswith("/api/fleet/unraid"):
            r = client.get(path)
        else:
            r = client.post(path, json={"server_id": "unraid-main", "container": "nextcloud"})
        assert r.status_code == 401, f"{path}: {r.text}"


# ---------------------------------------------------------------------------
# ssh failure handling -> 502, redacted
# ---------------------------------------------------------------------------


def test_ssh_command_error_returns_502(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError(f"docker: container not found: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.post(
        "/api/fleet/docker/start",
        json={"server_id": "unraid-main", "container": "ghost"},
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
        "/api/fleet/unraid/get_docker_containers?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    assert "network is unreachable" in r.json()["detail"]
