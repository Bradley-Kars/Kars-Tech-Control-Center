"""backend/fleet/router metric route tests (P13).

Fixture-only: the alert/metric store is a real AlertsMetricsStore backed by a
temp sqlite file, patched into fleet.router._alerts_store. servers.json lives
in a temp dir via KTS_SERVERS_FILE — the real
~/.config/master-control/servers.json is never touched. The routes are
host-local (no server_id), so no server needs to be registered.

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
    fd, db_path = tempfile.mkstemp(prefix="kts-metrics-route-test-", suffix=".db")
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


def test_metric_record_success(app_client):
    client, _read, write, store = app_client
    r = _post(client, "/api/fleet/metrics/record", {
        "device_id": "unraid-main",
        "metric": "cpu_usage",
        "value": 42.5,
    }, write)
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    points = store.query("unraid-main", "cpu_usage")
    assert [p.value for p in points] == [42.5]


def test_metric_record_validation_errors(app_client):
    client, _read, write, _store = app_client
    for body in (
        {"device_id": "d", "metric": "m"},                  # no value
        {"metric": "m", "value": 1.0},                      # no device_id
        {"device_id": "d", "value": 1.0},                   # no metric
        {"device_id": "", "metric": "m", "value": 1.0},     # empty device_id
        {"device_id": "d", "metric": "m", "value": "hot"},  # non-numeric value
    ):
        r = _post(client, "/api/fleet/metrics/record", body, write)
        assert r.status_code == 422, (body, r.text)


def test_metric_record_requires_write_token(app_client):
    client, read, _write, _store = app_client
    r = _post(client, "/api/fleet/metrics/record", {
        "device_id": "d", "metric": "m", "value": 1.0,
    }, read)
    assert r.status_code == 403, r.text


def test_metric_query(app_client):
    client, read, write, _store = app_client
    _post(client, "/api/fleet/metrics/record", {"device_id": "d1", "metric": "cpu", "value": 1.0}, write)
    _post(client, "/api/fleet/metrics/record", {"device_id": "d1", "metric": "cpu", "value": 2.0}, write)
    _post(client, "/api/fleet/metrics/record", {"device_id": "d1", "metric": "mem", "value": 3.0}, write)
    _post(client, "/api/fleet/metrics/record", {"device_id": "d2", "metric": "cpu", "value": 4.0}, write)

    r = client.get(
        "/api/fleet/metrics/query?device_id=d1&metric=cpu&from=2000-01-01T00:00:00Z",
        headers={"X-API-Token": read},
    )
    assert r.status_code == 200, r.text
    assert [p["value"] for p in r.json()] == [1.0, 2.0]

    r = client.get(
        "/api/fleet/metrics/query?device_id=d1&metric=cpu&from=2000-01-01T00:00:00Z&limit=1",
        headers={"X-API-Token": read},
    )
    assert [p["value"] for p in r.json()] == [1.0]

    r = client.get(
        "/api/fleet/metrics/query?device_id=d1&metric=nonexistent&from=2000-01-01T00:00:00Z",
        headers={"X-API-Token": read},
    )
    assert r.json() == []

    r = client.get(
        "/api/fleet/metrics/query?device_id=&metric=cpu&from=2000-01-01T00:00:00Z",
        headers={"X-API-Token": read},
    )
    assert r.status_code == 422, r.text


def test_metric_query_multi(app_client):
    client, read, write, _store = app_client
    _post(client, "/api/fleet/metrics/record", {"device_id": "d1", "metric": "cpu", "value": 1.0}, write)
    _post(client, "/api/fleet/metrics/record", {"device_id": "d1", "metric": "mem", "value": 2.0}, write)
    _post(client, "/api/fleet/metrics/record", {"device_id": "d2", "metric": "cpu", "value": 3.0}, write)

    r = client.get(
        "/api/fleet/metrics/query_multi"
        "?device_ids=d1&device_ids=d2&metrics=cpu&metrics=mem"
        "&from=2000-01-01T00:00:00Z",
        headers={"X-API-Token": read},
    )
    assert r.status_code == 200, r.text
    by_key = {(s["metric"], s["device_id"]): [p["value"] for p in s["points"]] for s in r.json()}
    assert by_key[("cpu", "d1")] == [1.0]
    assert by_key[("mem", "d1")] == [2.0]
    assert by_key[("cpu", "d2")] == [3.0]
    assert ("mem", "d2") not in by_key


def test_metric_collect_all(app_client):
    client, _read, write, _store = app_client
    r = _post(client, "/api/fleet/metrics/collect_all", {}, write)
    assert r.status_code == 200, r.text
    assert r.json()["recorded"] == 0
