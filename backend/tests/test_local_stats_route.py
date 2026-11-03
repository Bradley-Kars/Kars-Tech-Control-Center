"""backend/fleet/router.py — GET /api/fleet/local/stats (P2).

Host-only: reads /proc on the machine running the backend (no SSH, no
server_id). Fixture-only: KTS_SERVERS_FILE points at a temp servers.json —
the real ~/.config/master-control/servers.json is never touched.
Placeholder values only.
"""

import sys
import os

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), secret, servers_file


def test_local_stats_returns_system_shape(app_client):
    client, secret, _servers_file = app_client
    r = client.get("/api/fleet/local/stats", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text
    body = r.json()
    for key in (
        "hostname",
        "kernel",
        "uptime",
        "cpu_usage",
        "cpu_cores",
        "memory_total_mb",
        "memory_used_mb",
        "memory_usage_pct",
        "load_avg",
    ):
        assert key in body, f"missing {key}"
    assert isinstance(body["load_avg"], list)
    assert len(body["load_avg"]) == 3


def test_local_stats_requires_token(app_client):
    client, _secret, _servers_file = app_client
    r = client.get("/api/fleet/local/stats")
    assert r.status_code == 401
