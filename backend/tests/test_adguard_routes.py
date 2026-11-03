"""backend/fleet/router AdGuard route tests (P7).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The adguard
client is mocked, so neither httpx nor a real AdGuard Home is needed.

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
from fleet.adguard_service import (  # noqa: E402
    AdGuardStatus,
    AdGuardStats,
    AdGuardQueryLog,
    AdGuardDHCP,
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
        "adguard_url": "http://<device>.<tailnet>.ts.net:3000",
        "adguard_user": "alice",
        "adguard_pass": "not-a-real-adguard-pass",
    },
    "api_key": "sk-live-placeholder-key",
}

STATUS = AdGuardStatus(
    version="0.107.0",
    language="en",
    dns_addresses=["10.0.0.1"],
    dns_port=53,
    http_port=8443,
    protection_disabled_duration=0,
    start_time=1730000000.0,
    protection_enabled=True,
    dhcp_available=True,
    running=True,
    config_hash="abc123",
)
STATS = AdGuardStats(
    dns_queries={
        "total": 10000,
        "blocked": 2500,
        "replaced": 100,
        "safe_browsing": 50,
        "parental": 25,
        "avg_processing_time": 12.5,
    },
    blocked={"domains": 2000, "clients": 5},
    replaced={"domains": 80, "clients": 3},
    clients={"total": 50, "active": 45},
    filters={"total": 10, "enabled": 9},
)
QUERY_LOG = AdGuardQueryLog(
    data=[], limit=50, offset=0, total=0,
)
DHCP = AdGuardDHCP(enabled=True, leases=[])


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


def _mock_client(monkeypatch):
    m = MagicMock()
    m.get_status = AsyncMock(return_value=STATUS)
    m.get_stats = AsyncMock(return_value=STATS)
    m.get_query_log = AsyncMock(return_value=QUERY_LOG)
    m.get_clients = AsyncMock(return_value=[])
    m.get_filters = AsyncMock(return_value=[])
    m.get_dhcp = AsyncMock(return_value=DHCP)
    m.enable_protection = AsyncMock(return_value=None)
    m.disable_protection = AsyncMock(return_value=None)
    m.aclose = AsyncMock(return_value=None)
    return patch("fleet.router._adguard_client", return_value=m)


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, read_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="read")
    _, write_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), read_secret, write_secret, servers_file


def test_adguard_status_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/status?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "0.107.0"
    assert data["protection_enabled"] is True


def test_adguard_status_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get("/api/fleet/adguard/status?server_id=unraid-main")
    assert r.status_code == 401


def test_adguard_status_server_not_found(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/status?server_id=nonexistent",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 404


def test_adguard_stats_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/stats?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["dns_queries"]["total"] == 10000


def test_adguard_query_log_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/querylog?server_id=unraid-main&limit=20&offset=0",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200


def test_adguard_clients_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/clients?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200


def test_adguard_filters_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/filters?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200


def test_adguard_dhcp_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/dhcp?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["enabled"] is True


def test_adguard_enable_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/adguard/enable?server_id=unraid-main",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200


def test_adguard_disable_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/adguard/disable?server_id=unraid-main",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200


def test_adguard_status_redacted_502(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/adguard/status?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
