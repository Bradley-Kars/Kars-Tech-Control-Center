"""backend/fleet/phone_service.py unit tests (P14).

Fixture-only: no adb binary required, no real phone, no network.
Placeholder values only — no real hostnames or tokens.
"""

from __future__ import annotations

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.phone_service import (  # noqa: E402
    PhoneError,
    PhoneUnavailableError,
    PhoneClient,
    RealPhoneClient,
    FixturePhoneClient,
    PhoneDeviceInfo,
    PhoneBattery,
    PhoneStorage,
    PhoneMemory,
    parse_phone_device_info,
    parse_phone_battery,
    parse_phone_storage,
    parse_phone_memory,
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

STORAGE = (
    "Filesystem     Size  Used Avail Use% Mounted on\n"
    "/dev/block     50G   20G   30G  40% /data\n"
)

MEMINFO = (
    "MemTotal:       12345678 kB\n"
    "MemFree:        123456 kB\n"
    "MemAvailable:   6789012 kB\n"
    "Cached:         1000000 kB\n"
    "Buffers:        200000 kB\n"
)


# ---------------------------------------------------------------------------
# Pure parsing
# ---------------------------------------------------------------------------


def test_parse_phone_device_info():
    info = parse_phone_device_info(DEVICE_INFO)
    assert info.model == "Galaxy S24 Ultra"
    assert info.android_version == "14"
    assert info.api_level == "34"
    assert info.serial == "RF8A700000"
    assert info.oneui_version == "6.1"
    assert info.manufacturer == "Samsung"
    assert info.brand == "samsung"
    assert info.build_fingerprint == "samsung/beowulf/..."


def test_parse_phone_device_info_missing_optional_oneui():
    # oneui line present but empty -> None (getprop still emits one line per prop)
    output = (
        "Galaxy S24 Ultra\n"
        "14\n"
        "34\n"
        "RF8A700000\n"
        "\n"
        "Samsung\n"
        "samsung\n"
        "samsung/beowulf/...\n"
    )
    info = parse_phone_device_info(output)
    assert info.model == "Galaxy S24 Ultra"
    assert info.oneui_version is None


def test_parse_phone_device_info_empty():
    info = parse_phone_device_info("")
    assert info.model == "Unknown"
    assert info.serial == "Unknown"
    assert info.oneui_version is None


def test_parse_phone_battery():
    batt = parse_phone_battery(BATTERY)
    assert batt.level == 85
    assert batt.status == "2"
    assert batt.health == "1"
    assert batt.temperature == 28.5
    assert batt.voltage == 4320
    assert batt.technology == "Li-ion"
    assert batt.charging is True  # status "2" == charging
    assert batt.plugged == "AC"  # plugged "1" == AC
    assert batt.current_ua == -500


def test_parse_phone_battery_not_charging():
    output = BATTERY.replace("status: 2\n", "status: 3\n").replace("plugged: 1\n", "plugged: 0\n")
    batt = parse_phone_battery(output)
    assert batt.charging is False
    assert batt.plugged == "None"


def test_parse_phone_battery_empty():
    batt = parse_phone_battery("")
    assert batt.level == 0
    assert batt.charging is False


def test_parse_phone_storage():
    storage = parse_phone_storage(STORAGE)
    assert storage.total_gb == 50.0
    assert storage.used_gb == 20.0
    assert storage.free_gb == 30.0
    assert storage.used_pct == 40.0


def test_parse_phone_storage_megabytes():
    output = (
        "Filesystem     Size  Used Avail Use% Mounted on\n"
        "/dev/block     512M  256M  256M  50% /data\n"
    )
    storage = parse_phone_storage(output)
    assert storage.total_gb == 0.5
    assert storage.used_gb == 0.25
    assert storage.free_gb == 0.25


def test_parse_phone_memory():
    mem = parse_phone_memory(MEMINFO)
    assert mem.total_mb == 12056  # 12345678 / 1024
    assert mem.available_mb == 6629  # 6789012 / 1024
    assert mem.free_mb == 120  # 123456 / 1024
    assert mem.cached_mb == 976  # 1000000 / 1024
    assert mem.buffers_mb == 195  # 200000 / 1024
    assert mem.used_mb == 5427  # total - available


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fixture_client_returns_recorded_data():
    device_info = PhoneDeviceInfo(model="Galaxy S24 Ultra", serial="RF8A700000")
    battery = PhoneBattery(level=42, charging=True)
    client = FixturePhoneClient(device_info=device_info, battery=battery)
    got = await client.get_device_info()
    assert got.model == "Galaxy S24 Ultra"
    got_batt = await client.get_battery()
    assert got_batt.level == 42
    assert got_batt.charging is True


@pytest.mark.asyncio
async def test_fixture_client_defaults_when_not_given():
    client = FixturePhoneClient()
    assert await client.get_device_info() == PhoneDeviceInfo()
    assert await client.get_battery() == PhoneBattery()
    assert await client.get_storage() == PhoneStorage()
    assert await client.get_memory() == PhoneMemory()


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


def test_real_client_requires_serial():
    with pytest.raises(ValueError, match="phone_adb_serial not configured"):
        RealPhoneClient(serial="")


def test_phone_client_cannot_be_instantiated_directly():
    with pytest.raises(TypeError):
        PhoneClient()  # type: ignore[abstract]


@pytest.mark.asyncio
async def test_real_client_unavailable_when_adb_missing(monkeypatch):
    client = RealPhoneClient(serial="RF8A700000")

    async def fake_run(self, cmd):  # noqa: ARG001
        raise PhoneUnavailableError("adb not installed on this host")

    monkeypatch.setattr(RealPhoneClient, "_run", fake_run)
    with pytest.raises(PhoneUnavailableError, match="adb not installed"):
        await client.get_device_info()


@pytest.mark.asyncio
async def test_real_client_runs_adb_and_parses(monkeypatch):
    client = RealPhoneClient(serial="RF8A700000")

    async def fake_run(self, cmd):  # noqa: ARG001
        assert cmd[0] == "adb"
        assert "-s" in cmd and "RF8A700000" in cmd
        return DEVICE_INFO

    monkeypatch.setattr(RealPhoneClient, "_run", fake_run)
    info = await client.get_device_info()
    assert info.model == "Galaxy S24 Ultra"
    assert info.serial == "RF8A700000"
