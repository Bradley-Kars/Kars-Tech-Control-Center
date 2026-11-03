"""backend/fleet/router.py tests — /api/fleet server CRUD.

Identity enforcement: the same create_app() middleware as the existing
/api/tickets, /api/unraid, /api/adguard and /api/nextcloud routes
(401 without token, scope=write required for POST/DELETE).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched.

Placeholder values only — no real hostnames, emails, or tokens.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.config import (  # noqa: E402
    ServerConfig,
    load_servers,
    redact_server,
    save_servers,
)

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

FIXTURE_SERVER_KEY = {
    "id": "rog-ally",
    "name": "ROG Ally",
    "hostname": "rog-ally.local",
    "port": 22,
    "username": "user",
    "auth": {"type": "key", "key_path": "/home/user/.ssh/id_ed25519"},
    "device_type": "handheld",
    "service_keys": {},
}


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    """App + write-scoped client token, with KTS_SERVERS_FILE pointed at a
    temp servers.json. Returns (client, secret, servers_path)."""
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    # base_url=127.0.0.1 so TrustedHostMiddleware (W5.3) accepts the request
    # (TestClient defaults to host "testserver", which is rejected with 400).
    return TestClient(app, base_url="http://127.0.0.1"), secret, servers_file


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


# ---------------------------------------------------------------------------
# GET /api/fleet/servers
# ---------------------------------------------------------------------------


class TestListServers:
    def test_no_token_401(self, app_client):
        client, _secret, servers_file = app_client
        r = client.get("/api/fleet/servers")
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_empty_returns_zero(self, app_client):
        client, secret, servers_file = app_client
        r = client.get("/api/fleet/servers", headers={"X-API-Token": secret})
        assert r.status_code == 200
        body = r.json()
        assert body == {"servers": [], "count": 0}

    def test_list_returns_redacted_servers(self, app_client):
        client, secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER, FIXTURE_SERVER_KEY)
        r = client.get("/api/fleet/servers", headers={"X-API-Token": secret})
        assert r.status_code == 200
        body = r.json()
        assert body["count"] == 2
        ids = {s["id"] for s in body["servers"]}
        assert ids == {"unraid-main", "rog-ally"}
        # secrets never reach the client
        for s in body["servers"]:
            auth = s.get("auth", {})
            if "password" in auth:
                assert auth["password"] == "[REDACTED]"
            assert s.get("api_key") == "[REDACTED]" or "api_key" not in s
        unraid = next(s for s in body["servers"] if s["id"] == "unraid-main")
        assert unraid["hostname"] == "<device>.<tailnet>.ts.net"

    def test_read_scoped_token_can_list(self, app_client):
        client, _secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER)
        table_dir = Path(tempfile.mkdtemp()) / "auth"
        # build a second app with a read-scoped token
        table = TokenTable(table_dir / "token-table.json")
        _, read_secret = table.mint("fleet-reader", actor_id="fleet-reader", scope="read")
        app = create_app(table)
        r = TestClient(app, base_url="http://127.0.0.1").get("/api/fleet/servers", headers={"X-API-Token": read_secret})
        assert r.status_code == 200
        assert r.json()["count"] == 1


# ---------------------------------------------------------------------------
# POST /api/fleet/servers (save_server)
# ---------------------------------------------------------------------------


class TestSaveServer:
    def test_no_token_401(self, app_client):
        client, _secret, servers_file = app_client
        r = client.post("/api/fleet/servers", json=FIXTURE_SERVER)
        assert r.status_code == 401

    def test_read_scoped_token_403(self, app_client):
        client, _secret, servers_file = app_client
        table_dir = Path(tempfile.mkdtemp()) / "auth"
        table = TokenTable(table_dir / "token-table.json")
        _, read_secret = table.mint("fleet-reader", actor_id="fleet-reader", scope="read")
        app = create_app(table)
        r = TestClient(app, base_url="http://127.0.0.1").post("/api/fleet/servers", json=FIXTURE_SERVER, headers={"X-API-Token": read_secret})
        assert r.status_code == 403

    def test_non_dict_body_422(self, app_client):
        client, secret, servers_file = app_client
        r = client.post(
            "/api/fleet/servers",
            content=b"not json",
            headers={"X-API-Token": secret, "content-type": "application/json"},
        )
        assert r.status_code == 422
        assert "detail" in r.json()

    def test_empty_body_422(self, app_client):
        client, secret, servers_file = app_client
        r = client.post("/api/fleet/servers", json={}, headers={"X-API-Token": secret})
        assert r.status_code == 422

    def test_missing_required_field_422(self, app_client):
        client, secret, servers_file = app_client
        bad = dict(FIXTURE_SERVER)
        del bad["id"]
        r = client.post("/api/fleet/servers", json=bad, headers={"X-API-Token": secret})
        assert r.status_code == 422
        assert "detail" in r.json()

    def test_create_returns_redacted_server_and_persists(self, app_client):
        client, secret, servers_file = app_client
        r = client.post("/api/fleet/servers", json=FIXTURE_SERVER, headers={"X-API-Token": secret})
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == "unraid-main"
        assert body["auth"]["password"] == "[REDACTED]"
        assert body["api_key"] == "[REDACTED]"
        # persisted on disk (real file keeps secrets, mode 0600)
        assert servers_file.exists()
        servers = load_servers(path=servers_file)
        assert len(servers) == 1
        assert servers[0].id == "unraid-main"
        assert servers[0].auth.password == "not-a-real-password"
        # GET reflects the creation
        listed = client.get("/api/fleet/servers", headers={"X-API-Token": secret})
        assert listed.json()["count"] == 1

    def test_upsert_replaces_by_id(self, app_client):
        client, secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER)
        updated = dict(FIXTURE_SERVER)
        updated["name"] = "Unraid Main (renamed)"
        r = client.post("/api/fleet/servers", json=updated, headers={"X-API-Token": secret})
        assert r.status_code == 200
        listed = client.get("/api/fleet/servers", headers={"X-API-Token": secret})
        assert listed.json()["count"] == 1
        assert listed.json()["servers"][0]["name"] == "Unraid Main (renamed)"


# ---------------------------------------------------------------------------
# DELETE /api/fleet/servers/{id} (remove_server)
# ---------------------------------------------------------------------------


class TestRemoveServer:
    def test_no_token_401(self, app_client):
        client, _secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER)
        r = client.delete("/api/fleet/servers/unraid-main")
        assert r.status_code == 401

    def test_read_scoped_token_403(self, app_client):
        client, _secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER)
        table_dir = Path(tempfile.mkdtemp()) / "auth"
        table = TokenTable(table_dir / "token-table.json")
        _, read_secret = table.mint("fleet-reader", actor_id="fleet-reader", scope="read")
        app = create_app(table)
        r = TestClient(app, base_url="http://127.0.0.1").delete("/api/fleet/servers/unraid-main", headers={"X-API-Token": read_secret})
        assert r.status_code == 403

    def test_unknown_id_404(self, app_client):
        client, secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER)
        r = client.delete("/api/fleet/servers/does-not-exist", headers={"X-API-Token": secret})
        assert r.status_code == 404
        assert "detail" in r.json()

    def test_delete_removes_and_persists(self, app_client):
        client, secret, servers_file = app_client
        _seed(servers_file, FIXTURE_SERVER, FIXTURE_SERVER_KEY)
        r = client.delete("/api/fleet/servers/unraid-main", headers={"X-API-Token": secret})
        assert r.status_code == 200
        assert r.json() == {"removed": "unraid-main"}
        servers = load_servers(path=servers_file)
        assert [s.id for s in servers] == ["rog-ally"]
        listed = client.get("/api/fleet/servers", headers={"X-API-Token": secret})
        assert listed.json()["count"] == 1
        assert listed.json()["servers"][0]["id"] == "rog-ally"
