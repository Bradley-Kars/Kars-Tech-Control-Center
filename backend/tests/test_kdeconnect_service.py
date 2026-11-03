"""backend/fleet/kdeconnect_service.py unit tests (P14).

Fixture-only: no kdeconnect/gdbus binary required, no real device, no network.
Placeholder values only — no real hostnames or tokens.
"""

from __future__ import annotations

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.kdeconnect_service import (  # noqa: E402
    KdeConnectError,
    KdeConnectUnavailableError,
    KdeConnectClient,
    RealKdeConnectClient,
    FixtureKdeConnectClient,
    KdeConnectBattery,
    KdeConnectConnectivity,
    KdeConnectDeviceInfo,
    parse_kdeconnect_battery,
    parse_kdeconnect_connectivity,
    parse_kdeconnect_devices,
    parse_gdbus_variant,
)

BATTERY_GDBUS = "({'charge': <85>, 'isCharging': <true>, 'hasBattery': <true>, 'iconName': <'battery-full'>},)"
CONNECTIVITY_GDBUS = (
    "({'cellularNetworkStrength': <4>, 'cellularNetworkType': <'LTE'>, 'iconName': <'network-cellular'>},)"
)
DEVICES_GDBUS = "(['phone-abc', 'tablet-def'],)"


# ---------------------------------------------------------------------------
# gdbus variant parsing
# ---------------------------------------------------------------------------


def test_parse_gdbus_variant_battery_dict():
    data = parse_gdbus_variant(BATTERY_GDBUS)
    assert data == {
        "charge": 85,
        "isCharging": True,
        "hasBattery": True,
        "iconName": "battery-full",
    }


def test_parse_gdbus_variant_plain_dict():
    data = parse_gdbus_variant("{'name': <'alpha'>, 'count': <3>}")
    assert data == {"name": "alpha", "count": 3}


def test_parse_gdbus_variant_bool_and_string():
    assert parse_gdbus_variant("<true>") is True
    assert parse_gdbus_variant("<false>") is False
    assert parse_gdbus_variant("<'hello'>") == "hello"
    assert parse_gdbus_variant("<42>") == 42


# ---------------------------------------------------------------------------
# Pure parsing
# ---------------------------------------------------------------------------


def test_parse_kdeconnect_battery():
    batt = parse_kdeconnect_battery(BATTERY_GDBUS)
    assert batt.charge == 85
    assert batt.is_charging is True
    assert batt.has_battery is True
    assert batt.icon_name == "battery-full"


def test_parse_kdeconnect_battery_defaults_on_missing():
    batt = parse_kdeconnect_battery("({})")
    assert batt.charge == 0
    assert batt.is_charging is False
    assert batt.has_battery is False
    assert batt.icon_name == ""


def test_parse_kdeconnect_connectivity():
    con = parse_kdeconnect_connectivity(CONNECTIVITY_GDBUS)
    assert con.cellular_network_strength == 4
    assert con.cellular_network_type == "LTE"
    assert con.icon_name == "network-cellular"


def test_parse_kdeconnect_devices():
    devices = parse_kdeconnect_devices(DEVICES_GDBUS)
    assert devices == ["phone-abc", "tablet-def"]


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fixture_client_returns_recorded_data():
    battery = KdeConnectBattery(charge=30, is_charging=False, has_battery=True, icon_name="battery-low")
    client = FixtureKdeConnectClient(battery=battery)
    got = await client.get_battery()
    assert got.charge == 30
    assert got.is_charging is False


@pytest.mark.asyncio
async def test_fixture_client_defaults_when_not_given():
    client = FixtureKdeConnectClient()
    assert await client.get_battery() == KdeConnectBattery()
    assert await client.get_connectivity() == KdeConnectConnectivity()
    assert await client.list_devices() == []


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


def test_real_client_requires_device_id():
    with pytest.raises(ValueError, match="kdeconnect_device_id not configured"):
        RealKdeConnectClient(device_id="")


def test_kdeconnect_client_cannot_be_instantiated_directly():
    with pytest.raises(TypeError):
        KdeConnectClient()  # type: ignore[abstract]


@pytest.mark.asyncio
async def test_real_client_unavailable_when_gdbus_missing(monkeypatch):
    client = RealKdeConnectClient(device_id="phone-abc")

    async def fake_run(self, cmd):  # noqa: ARG001
        raise KdeConnectUnavailableError("kdeconnect not installed on this host")

    monkeypatch.setattr(RealKdeConnectClient, "_run", fake_run)
    with pytest.raises(KdeConnectUnavailableError, match="kdeconnect not installed"):
        await client.get_battery()


@pytest.mark.asyncio
async def test_real_client_runs_gdbus_and_parses(monkeypatch):
    client = RealKdeConnectClient(device_id="phone-abc")

    async def fake_run(self, cmd):  # noqa: ARG001
        assert "gdbus" in cmd
        assert "phone-abc" in " ".join(cmd)
        return BATTERY_GDBUS

    monkeypatch.setattr(RealKdeConnectClient, "_run", fake_run)
    batt = await client.get_battery()
    assert batt.charge == 85
    assert batt.is_charging is True
