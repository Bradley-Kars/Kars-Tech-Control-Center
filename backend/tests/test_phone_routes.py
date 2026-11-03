"""backend/fleet phone routes (P14).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. adb is faked by
patching RealPhoneClient._run, so neither adb nor a real phone is needed.
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
from fleet.router import _phone_client  # noqa: E402
from fleet.phone_service import (  # noqa: E402
    RealPhoneClient,
    PhoneError,
    PhoneUnavailableError,
    PhoneDeviceInfo,
    PhoneBattery,
)

DEVICE_INFO = (
    "Galaxy S24 Ultra\n"
    "14\n"
    "34\n"
    "RF8A700000\n"
    "6.1\n"
    "Samsung\n"
    "samsung\n"
    "samsung/beowulf/...\n"
)

BATTERY = (
    "level: 85\n"
    "status: 2\n"
    "health: 1\n"
    "temperature: 285\n"
    "voltage: 4320\n"
    "technology: Li-ion\n"
    "plugged: 1\n"
    "current now: -500\n"
)

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "phone",
    "service_keys": {"phone_adb_serial": "RF8A700000"},
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


def _patch_phone_run(monkeypatch, outputs: dict[str, str]):
    """Respond to adb shell commands by matching a substring of the command."""

    async def fake_run(self, cmd):  # noqa: ARG001
        for key, output in outputs.items():
            if key in " ".join(cmd):
                return output
        raise PhoneError(f"unexpected adb command: {' '.join(cmd)}")

    monkeypatch.setattr(RealPhoneClient, "_run", fake_run)


# ---------------------------------------------------------------------------
# GET /api/fleet/phone/device_info
# ---------------------------------------------------------------------------


def test_phone_device_info_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_phone_run(monkeypatch, {"getprop": DEVICE_INFO})

    r = client.get(
        "/api/fleet/phone/device_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["model"] == "Galaxy S24 Ultra"
    assert body["serial"] == "RF8A700000"
    assert body["oneui_version"] == "6.1"


def test_phone_battery_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_phone_run(monkeypatch, {"dumpsys battery": BATTERY})

    r = client.get(
        "/api/fleet/phone/battery?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["level"] == 85
    assert body["charging"] is True
    assert body["plugged"] == "AC"


# ---------------------------------------------------------------------------
# auth / not found / unavailable / error
# ---------------------------------------------------------------------------


def test_no_token_401(app_client, monkeypatch):
    client, _secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_phone_run(monkeypatch, {})

    for path in (
        "/api/fleet/phone/device_info?server_id=unraid-main",
        "/api/fleet/phone/battery?server_id=unraid-main",
    ):
        r = client.get(path)
        assert r.status_code == 401, f"{path}: {r.text}"


def test_unknown_server_404(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_phone_run(monkeypatch, {})

    r = client.get(
        "/api/fleet/phone/device_info?server_id=missing",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404, r.text
    assert "detail" in r.json()


def test_adb_unavailable_returns_503(app_client, monkeypatch):
    """adb not installed on the host -> clean 503, no crash, no secrets."""

    async def fake_unavailable(self, cmd):  # noqa: ARG001
        raise PhoneUnavailableError("adb not installed on this host")

    monkeypatch.setattr(RealPhoneClient, "_run", fake_unavailable)

    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/phone/device_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 503, r.text
    body = r.json()
    assert "detail" in body
    assert "not-a-real-password" not in str(body)


def test_adb_command_error_returns_502_redacted(app_client, monkeypatch):
    """An adb failure -> redacted 502, secrets never reach the client."""

    async def fake_error(self, cmd):  # noqa: ARG001
        raise PhoneError("device offline: not-a-real-password")

    monkeypatch.setattr(RealPhoneClient, "_run", fake_error)

    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    r = client.get(
        "/api/fleet/phone/device_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    body = str(r.json())
    assert "not-a-real-password" not in body
