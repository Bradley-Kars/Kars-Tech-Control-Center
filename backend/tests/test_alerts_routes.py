"""backend/fleet/router alert route tests (P13).

Fixture-only: the alert store is a real AlertsMetricsStore backed by a temp
sqlite file, patched into fleet.router._alerts_store. servers.json lives in a
temp dir via KTS_SERVERS_FILE — the real ~/.config/master-control/servers.json
is never touched. The routes are host-local (no server_id), so no server
needs to be registered.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import os
import sys
import tempfile
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.alerts_service import AlertsMetricsStore  # noqa: E402


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    servers_file = tmp_path / "servers.json"
    servers_file.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    fd, db_path = tempfile.mkstemp(prefix="kts-alerts-route-test-", suffix=".db")
    os.close(fd)
    store = AlertsMetricsStore(db_path)
    monkeypatch.setattr("fleet.router._alerts_store", lambda: store)
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, read_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="read")
    _, write_secret = table.mint("fleet-client", actor_id="fleet-actor", scope="write")
    app = create_app(table)
    return (
        TestClient(app, base_url="http://127.0.0.1"),
        read_secret,
        write_secret,
        store,
    )


def _post(client, path, body, secret):
    return client.post(path, json=body, headers={"X-API-Token": secret})


def test_alert_create_success(app_client):
    client, _read, write, store = app_client
    r = _post(client, "/api/fleet/alerts/create", {
        "severity": "critical",
        "title": "Disk full",
        "message": "root at 98%",
        "device_id": "unraid-main",
        "source": "smart",
        "auto_ack_rule": "disk>90",
    }, write)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"] == 1
    assert data["severity"] == "critical"
    assert data["title"] == "Disk full"
    assert data["acknowledged"] is False
    assert data["created_at"].endswith("Z")
    assert store.get(1) is not None


def test_alert_create_validation_errors(app_client):
    client, _read, write, _store = app_client
    r = _post(client, "/api/fleet/alerts/create", {
        "severity": "bogus", "title": "t", "message": "m",
    }, write)
    assert r.status_code == 422, r.text
    r = _post(client, "/api/fleet/alerts/create", {
        "severity": "warning", "message": "m",
    }, write)
    assert r.status_code == 422, r.text
    r = _post(client, "/api/fleet/alerts/create", {
        "severity": "warning", "title": "", "message": "m",
    }, write)
    assert r.status_code == 422, r.text


def test_alert_create_requires_write_token(app_client):
    client, read, _write, _store = app_client
    r = _post(client, "/api/fleet/alerts/create", {
        "severity": "info", "title": "t", "message": "m",
    }, read)
    assert r.status_code == 403, r.text


def test_alert_create_requires_token(app_client):
    client, _read, _write, _store = app_client
    r = client.post("/api/fleet/alerts/create", json={
        "severity": "info", "title": "t", "message": "m",
    })
    assert r.status_code == 401, r.text


def test_alert_list_newest_first(app_client):
    client, read, _write, store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "a", "message": "m"}, _write)
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "b", "message": "m"}, _write)
    r = client.get("/api/fleet/alerts/list", headers={"X-API-Token": read})
    assert r.status_code == 200, r.text
    data = r.json()
    assert [a["title"] for a in data] == ["b", "a"]


def test_alert_list_filters(app_client):
    client, read, _write, store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "critical", "title": "c", "message": "m", "device_id": "d1"}, _write)
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "i", "message": "m", "device_id": "d1"}, _write)
    _post(client, "/api/fleet/alerts/create", {"severity": "warning", "title": "w", "message": "m", "device_id": "d2"}, _write)

    r = client.get("/api/fleet/alerts/list?severity=critical", headers={"X-API-Token": read})
    assert [a["title"] for a in r.json()] == ["c"]

    r = client.get("/api/fleet/alerts/list?device_id=d2", headers={"X-API-Token": read})
    assert [a["title"] for a in r.json()] == ["w"]

    # acknowledge c, then filter acknowledged=false excludes it
    _post(client, "/api/fleet/alerts/acknowledge", {"id": 1, "acknowledged_by": "user"}, _write)
    r = client.get("/api/fleet/alerts/list?acknowledged=false", headers={"X-API-Token": read})
    assert [a["title"] for a in r.json()] == ["w", "i"]


def test_alert_list_limit_offset(app_client):
    client, read, _write, _store = app_client
    for title in ("a", "b", "c"):
        _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": title, "message": "m"}, _write)
    r = client.get("/api/fleet/alerts/list?limit=1&offset=1", headers={"X-API-Token": read})
    assert [a["title"] for a in r.json()] == ["b"]


def test_alert_get(app_client):
    client, read, _write, store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "warning", "title": "get-me", "message": "m"}, _write)
    r = client.get("/api/fleet/alerts/get?id=1", headers={"X-API-Token": read})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "get-me"
    r = client.get("/api/fleet/alerts/get?id=999999", headers={"X-API-Token": read})
    assert r.status_code == 404, r.text
    r = client.get("/api/fleet/alerts/get", headers={"X-API-Token": read})
    assert r.status_code == 422, r.text


def test_alert_acknowledge(app_client):
    client, read, write, store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "ack-me", "message": "m"}, write)
    r = _post(client, "/api/fleet/alerts/acknowledge", {"id": 1, "acknowledged_by": "ops"}, write)
    assert r.status_code == 200, r.text
    assert r.json()["acknowledged"] is True
    assert r.json()["acknowledged_by"] == "ops"
    assert store.get(1).acknowledged is True
    r = _post(client, "/api/fleet/alerts/acknowledge", {"id": 999999, "acknowledged_by": "ops"}, write)
    assert r.status_code == 404, r.text


def test_alert_acknowledge_all(app_client):
    client, read, write, _store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "a", "message": "m", "device_id": "d1"}, write)
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "b", "message": "m", "device_id": "d1"}, write)
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "c", "message": "m", "device_id": "d2"}, write)
    r = _post(client, "/api/fleet/alerts/acknowledge_all", {"device_id": "d1", "acknowledged_by": "auto"}, write)
    assert r.status_code == 200, r.text
    assert r.json()["acknowledged"] == 2
    r = client.get("/api/fleet/alerts/list?device_id=d1&acknowledged=false", headers={"X-API-Token": read})
    assert r.json() == []
    r = client.get("/api/fleet/alerts/list?device_id=d2&acknowledged=false", headers={"X-API-Token": read})
    assert len(r.json()) == 1


def test_alert_delete(app_client):
    client, read, write, store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "bye", "message": "m"}, write)
    r = _post(client, "/api/fleet/alerts/delete", {"id": 1}, write)
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] is True
    assert store.get(1) is None
    r = _post(client, "/api/fleet/alerts/delete", {"id": 1}, write)
    assert r.status_code == 404, r.text


def test_alert_auto_ack_run(app_client):
    client, read, write, store = app_client
    _post(client, "/api/fleet/alerts/create", {"severity": "info", "title": "old info", "message": "m"}, write)
    _post(client, "/api/fleet/alerts/create", {"severity": "critical", "title": "recent crit", "message": "m"}, write)
    # backdate the info alert past the one-hour threshold
    old = store.get(1)
    old.created_at = "2020-01-01T00:00:00Z"
    old.updated_at = old.created_at
    import sqlite3
    conn = sqlite3.connect(store.db_path)
    conn.execute(
        "UPDATE alerts SET created_at=?, updated_at=? WHERE id=?",
        (old.created_at, old.created_at, old.id),
    )
    conn.commit()
    conn.close()

    r = _post(client, "/api/fleet/alerts/auto_ack_run", {}, write)
    assert r.status_code == 200, r.text
    assert r.json()["acknowledged"] == 1
    assert store.get(1).acknowledged is True
    assert store.get(1).acknowledged_by == "auto"
    assert store.get(2).acknowledged is False
