"""backend/fleet/router Home Assistant route tests (P8).

Fixture-only: servers.json lives in a temp dir via KTS_SERVERS_FILE — the
real ~/.config/master-control/servers.json is never touched. The homeassistant
client is mocked, so neither httpx nor a real Home Assistant is needed.

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
from fleet.homeassistant_service import (  # noqa: E402
    HomeAssistantState,
    HomeAssistantConfig,
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
        "homeassistant_url": "http://<device>.<tailnet>.ts.net:8123",
        "homeassistant_token": "not-a-real-token",
    },
    "api_key": "sk-live-placeholder-key",
}

STATE = HomeAssistantState(
    entity_id="light.kitchen",
    state="on",
    attributes={"brightness": 255},
    last_changed="2026-11-03T10:00:00Z",
    last_updated="2026-11-03T10:00:00Z",
    context={"id": "abc123"},
)
CONFIG = HomeAssistantConfig(
    components=["frontend", "http"],
    config_dir="/config",
    elevation=0.0,
    latitude=51.5,
    location_name="Home",
    longitude=-0.1,
    time_zone="Europe/London",
    unit_system={"unit_system": "metric"},
    version="2026.11.0",
    allowlist_external_dirs=[],
    allowlist_external_urls=[],
    currency="GBP",
    external_url="https://<device>.<tailnet>.ts.net:8123",
    internal_url="http://<device>.<tailnet>.local:8123",
    theme=None,
    language="en",
)


def _seed(servers_file, *servers):
    save_servers([ServerConfig(**s) for s in servers], path=servers_file)


def _mock_client(monkeypatch):
    m = MagicMock()
    m.get_states = AsyncMock(return_value=[STATE])
    m.get_state = AsyncMock(return_value=STATE)
    m.get_config = AsyncMock(return_value=CONFIG)
    m.get_services = AsyncMock(return_value={"services": {}})
    m.get_areas = AsyncMock(return_value=[])
    m.get_devices = AsyncMock(return_value=[])
    m.get_entity_registry = AsyncMock(return_value=[])
    m.call_service = AsyncMock(return_value={})
    m.toggle_entity = AsyncMock(return_value=None)
    m.turn_on_entity = AsyncMock(return_value=None)
    m.turn_off_entity = AsyncMock(return_value=None)
    m.aclose = AsyncMock(return_value=None)
    return patch("fleet.router._homeassistant_client", return_value=m)


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


def test_homeassistant_states_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/homeassistant/get_homeassistant_states?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["entity_id"] == "light.kitchen"
    assert data[0]["state"] == "on"


def test_homeassistant_config_success(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/homeassistant/get_homeassistant_config?server_id=unraid-main",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "2026.11.0"


def test_homeassistant_no_token(app_client):
    client, _read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    r = client.get(
        "/api/fleet/homeassistant/get_homeassistant_states?server_id=unraid-main"
    )
    assert r.status_code == 401


def test_homeassistant_server_not_found(app_client, monkeypatch):
    client, read_secret, _write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.get(
            "/api/fleet/homeassistant/get_homeassistant_states?server_id=nonexistent",
            headers={"X-API-Token": read_secret},
        )
    assert r.status_code == 404


def test_homeassistant_toggle_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/homeassistant/homeassistant_toggle?server_id=unraid-main&entity_id=light.kitchen",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200


def test_homeassistant_turn_on_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/homeassistant/homeassistant_turn_on?server_id=unraid-main&entity_id=light.kitchen",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200


def test_homeassistant_turn_off_success(app_client, monkeypatch):
    client, _read_secret, write_secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    with _mock_client(monkeypatch):
        r = client.post(
            "/api/fleet/homeassistant/homeassistant_turn_off?server_id=unraid-main&entity_id=light.kitchen",
            headers={"X-API-Token": write_secret},
        )
    assert r.status_code == 200
