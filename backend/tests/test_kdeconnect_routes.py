"""backend/fleet kdeconnect routes (P14).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. gdbus/kdeconnect is
faked by patching RealKdeConnectClient._run, so neither binary is needed.
Placeholder values only — no real hostnames, emails, or tokens.
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
from fleet.router import _kdeconnect_client  # noqa: E402
from fleet.kdeconnect_service import (  # noqa: E402
    RealKdeConnectClient,
    KdeConnectError,
    KdeConnectUnavailableError,
    KdeConnectBattery,
)

BATTERY_GDBUS = "({'charge': <85>, 'isCharging': <true>, 'hasBattery': <true>, 'iconName': <'battery-full'>},)"
CONNECTIVITY_GDBUS = (
    "({'cellularNetworkStrength': <4>, 'cellularNetworkType': <'LTE'>, 'iconName': <'network-cellular'>},)"
)
DEVICES_GDBUS = "(['phone-abc', 'tablet-def'],)"

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "phone",
    "service_keys": {"kdeconnect_device_id": "phone-abc"},
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


def _patch_kdeconnect_run(monkeypatch, outputs: dict[str, str]):
    """Respond to gdbus commands by matching a substring of the command."""

    async def fake_run(self, cmd):  # noqa: ARG001
        joined = " ".join(cmd)
        for key, output in outputs.items():
            if key in joined:
                return output
        raise KdeConnectError(f"unexpected gdbus command: {joined}")

    monkeypatch.setattr(RealKdeConnectClient, "_run", fake_run)


# ---------------------------------------------------------------------------
# GET /api/fleet/kdeconnect/battery
# ---------------------------------------------------------------------------


def test_kdeconnect_battery_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_kdeconnect_run(monkeypatch, {"GetAll": BATTERY_GDBUS})

    r = client.get(
        "/api/fleet/kdeconnect/battery?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["charge"] == 85
    assert body["is_charging"] is True
    assert body["has_battery"] is True
    assert body["icon_name"] == "battery-full"


def test_kdeconnect_connectivity_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_kdeconnect_run(monkeypatch, {"GetAll": CONNECTIVITY_GDBUS})

    r = client.get(
        "/api/fleet/kdeconnect/connectivity?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cellular_network_strength"] == 4
    assert body["cellular_network_type"] == "LTE"


def test_kdeconnect_list_devices_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_kdeconnect_run(monkeypatch, {"devices": DEVICES_GDBUS})

    r = client.get(
        "/api/fleet/kdeconnect/list_devices?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == ["phone-abc", "tablet-def"]


# ---------------------------------------------------------------------------
# auth / not found / unavailable / error
# ---------------------------------------------------------------------------


def test_no_token_401(app_client, monkeypatch):
    client, _secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_kdeconnect_run(monkeypatch, {})

    for path in (
        "/api/fleet/kdeconnect/battery?server_id=unraid-main",
        "/api/fleet/kdeconnect/connectivity?server_id=unraid-main",
        "/api/fleet/kdeconnect/list_devices?server_id=unraid-main",
    ):
        r = client.get(path)
        assert r.status_code == 401, f"{path}: {r.text}"


def test_unknown_server_404(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_kdeconnect_run(monkeypatch, {})

    r = client.get(
        "/api/fleet/kdeconnect/battery?server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404, r.text
    assert "detail" in r.json()


def test_kdeconnect_unavailable_returns_503(app_client, monkeypatch):
    """kdeconnect not installed on the host -> clean 503, no crash."""

    async def fake_unavailable(self, cmd):  # noqa: ARG001
        raise KdeConnectUnavailableError("kdeconnect not installed on this host")

    monkeypatch.setattr(RealKdeConnectClient, "_run", fake_unavailable)

    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/kdeconnect/battery?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 503, r.text
    body = r.json()
    assert "detail" in body
    assert "not-a-real-password" not in str(body)


def test_kdeconnect_command_error_returns_502_redacted(app_client, monkeypatch):
    """A gdbus failure -> redacted 502, secrets never reach the client."""

    async def fake_error(self, cmd):  # noqa: ARG001
        raise KdeConnectError("device unreachable: not-a-real-password")

    monkeypatch.setattr(RealKdeConnectClient, "_run", fake_error)

    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/kdeconnect/battery?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
