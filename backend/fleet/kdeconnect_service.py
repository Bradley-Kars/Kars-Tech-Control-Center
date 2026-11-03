"""backend/fleet/kdeconnect_service.py — KDE Connect host-local port (P14).

Port of src-tauri/src/services/kdeconnect.rs: battery, connectivity report
and device list over D-Bus/gdbus against a KDE Connect paired device on the
machine that runs this backend.

This is HOST-LOCAL: gdbus is invoked directly on the backend host (no SSH, no
remote server). The KDE Connect device id comes from the selected server's
``service_keys.kdeconnect_device_id``.

The module is feature-flagged: when the ``gdbus`` binary is not installed on
the host, :meth:`RealKdeConnectClient.is_available` returns False and routes
report a clean 503 instead of crashing. Secrets never reach logs or error
messages — the router redacts every failure.

Tests replay recorded gdbus output by patching ``RealKdeConnectClient._run``
— no gdbus binary, no real device, no network.
"""

from __future__ import annotations

import asyncio
import shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class KdeConnectError(Exception):
    """Raised when a KDE Connect (gdbus) query fails."""


class KdeConnectUnavailableError(KdeConnectError):
    """Raised when the gdbus binary is not installed on this host."""


class KdeConnectClient(ABC):
    """Abstract base for KDE Connect clients."""

    @abstractmethod
    async def get_battery(self) -> KdeConnectBattery:
        ...

    @abstractmethod
    async def get_connectivity(self) -> KdeConnectConnectivity:
        ...

    @abstractmethod
    async def list_devices(self) -> list[str]:
        ...

    @classmethod
    @abstractmethod
    def is_available(cls) -> bool:
        """True when the host can actually run KDE Connect (gdbus) commands."""


# ---------------------------------------------------------------------------
# Response shapes (mirror src-tauri/src/services/kdeconnect.rs)
# ---------------------------------------------------------------------------


@dataclass
class KdeConnectBattery:
    charge: int = 0
    is_charging: bool = False
    has_battery: bool = False
    icon_name: str = ""


@dataclass
class KdeConnectConnectivity:
    cellular_network_strength: int = 0
    cellular_network_type: str = "Unknown"
    icon_name: str = ""


@dataclass
class KdeConnectDeviceInfo:
    id: str = ""
    name: str = "Unknown"
    device_type: str = "unknown"
    is_paired: bool = False
    is_reachable: bool = False
    icon_name: str = ""


# ---------------------------------------------------------------------------
# gdbus variant parsing (subset of org.freedesktop.DBus.Properties.GetAll output)
# ---------------------------------------------------------------------------


def _split_top_level(text: str, sep: str) -> list[str]:
    """Split `text` on `sep` ignoring separators inside {}, [], (), <>."""
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    opens = "{[<("
    closes = "}]>)"
    for ch in text:
        if ch in opens:
            depth += 1
            current.append(ch)
        elif ch in closes:
            depth -= 1
            current.append(ch)
        elif ch == sep and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        parts.append("".join(current).strip())
    return parts


def _parse_value(text: str):
    text = text.strip()
    if not text:
        return None
    if text.startswith("{") and text.endswith("}"):
        return _parse_dict(text)
    if text.startswith("[") and text.endswith("]"):
        return _parse_array(text)
    if text.startswith("<") and text.endswith(">"):
        inner = text[1:-1].strip()
        if inner == "true":
            return True
        if inner == "false":
            return False
        try:
            return int(inner)
        except ValueError:
            pass
        try:
            return float(inner)
        except ValueError:
            pass
        if (inner.startswith("'") and inner.endswith("'")) or (
            inner.startswith('"') and inner.endswith('"')
        ):
            return inner[1:-1]
        return inner
    if (text.startswith("'") and text.endswith("'")) or (
        text.startswith('"') and text.endswith('"')
    ):
        return text[1:-1]
    return text


def _parse_dict(text: str) -> dict:
    inner = text[1:-1].strip()
    result: dict = {}
    if not inner:
        return result
    for pair in _split_top_level(inner, ","):
        if ":" not in pair:
            continue
        key, _, value = pair.partition(":")
        result[_parse_value(key)] = _parse_value(value)
    return result


def _parse_array(text: str) -> list:
    inner = text[1:-1].strip()
    if not inner:
        return []
    return [_parse_value(item) for item in _split_top_level(inner, ",")]


def parse_gdbus_variant(text: str):
    """Parse a gdbus method-call return value into a Python object.

    Handles the subset produced by GetAll, including the single-element
    tuple wrapper gdbus appends: ``({'charge': <85>, ...},)``.
    """
    text = text.strip()
    # Unwrap single-element tuple wrappers: ( X , )  or  ( X )
    while text.startswith("(") and text.endswith(")"):
        inner = text[1:-1].strip()
        if inner.rstrip().endswith(","):
            text = inner.rstrip()[:-1].strip()
        else:
            text = inner
            break
    return _parse_value(text)


# ---------------------------------------------------------------------------
# Pure response parsing (command-free, easy to unit test)
# ---------------------------------------------------------------------------


def parse_kdeconnect_battery(text: str) -> KdeConnectBattery:
    """Parse the GetAll result for org.kde.kdeconnect.device.battery."""
    data = parse_gdbus_variant(text) or {}
    return KdeConnectBattery(
        charge=_as_int(data.get("charge")),
        is_charging=bool(data.get("isCharging", False)),
        has_battery=bool(data.get("hasBattery", False)),
        icon_name=str(data.get("iconName") or ""),
    )


def parse_kdeconnect_connectivity(text: str) -> KdeConnectConnectivity:
    """Parse the GetAll result for org.kde.kdeconnect.device.connectivity_report."""
    data = parse_gdbus_variant(text) or {}
    return KdeConnectConnectivity(
        cellular_network_strength=_as_int(data.get("cellularNetworkStrength")),
        cellular_network_type=str(data.get("cellularNetworkType") or "Unknown"),
        icon_name=str(data.get("iconName") or ""),
    )


def parse_kdeconnect_devices(text: str) -> list[str]:
    """Parse the `devices` result: an array of device id strings."""
    data = parse_gdbus_variant(text)
    if isinstance(data, list):
        return [str(item) for item in data]
    return []


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Real client — local gdbus
# ---------------------------------------------------------------------------


class RealKdeConnectClient(KdeConnectClient):
    """Real KDE Connect client running gdbus directly on the backend host.

    Mirrors the Tauri ``get_kdeconnect_*`` commands. The device id is
    configured per server (``service_keys.kdeconnect_device_id``).
    """

    def __init__(self, device_id: str) -> None:
        if not device_id or not device_id.strip():
            raise ValueError("kdeconnect_device_id not configured")
        self.device_id = device_id.strip()

    @classmethod
    def is_available(cls) -> bool:
        return shutil.which("gdbus") is not None

    async def _run(self, cmd: list[str]) -> str:
        """Run one gdbus command locally and return its stdout."""
        if not shutil.which(cmd[0]):
            raise KdeConnectUnavailableError(f"{cmd[0]} not installed on this host")
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            detail = stderr.decode(errors="replace").strip()
            raise KdeConnectError(f"command failed (exit {proc.returncode}): {detail}")
        return stdout.decode(errors="replace")

    def _battery_cmd(self) -> list[str]:
        return [
            "gdbus",
            "call",
            "--session",
            "--dest",
            "org.kde.kdeconnect",
            "--object-path",
            f"/modules/kdeconnect/devices/{self.device_id}/battery",
            "--method",
            "org.freedesktop.DBus.Properties.GetAll",
            "org.kde.kdeconnect.device.battery",
        ]

    def _connectivity_cmd(self) -> list[str]:
        return [
            "gdbus",
            "call",
            "--session",
            "--dest",
            "org.kde.kdeconnect",
            "--object-path",
            f"/modules/kdeconnect/devices/{self.device_id}/connectivity_report",
            "--method",
            "org.freedesktop.DBus.Properties.GetAll",
            "org.kde.kdeconnect.device.connectivity_report",
        ]

    def _list_devices_cmd(self) -> list[str]:
        return [
            "gdbus",
            "call",
            "--session",
            "--dest",
            "org.kde.kdeconnect",
            "--object-path",
            "/modules/kdeconnect",
            "--method",
            "org.kde.kdeconnect.daemon",
            "devices",
        ]

    async def get_battery(self) -> KdeConnectBattery:
        output = await self._run(self._battery_cmd())
        return parse_kdeconnect_battery(output)

    async def get_connectivity(self) -> KdeConnectConnectivity:
        output = await self._run(self._connectivity_cmd())
        return parse_kdeconnect_connectivity(output)

    async def list_devices(self) -> list[str]:
        output = await self._run(self._list_devices_cmd())
        return parse_kdeconnect_devices(output)


# ---------------------------------------------------------------------------
# Fixture client — recorded responses for tests
# ---------------------------------------------------------------------------


class FixtureKdeConnectClient(KdeConnectClient):
    """Fixture-based KDE Connect client for testing.

    Returns recorded gdbus output instead of invoking gdbus. No real device
    is required.
    """

    def __init__(
        self,
        battery: KdeConnectBattery | None = None,
        connectivity: KdeConnectConnectivity | None = None,
        devices: list[str] | None = None,
    ) -> None:
        self._battery = battery or KdeConnectBattery()
        self._connectivity = connectivity or KdeConnectConnectivity()
        self._devices = devices or []

    @classmethod
    def is_available(cls) -> bool:
        return True

    async def get_battery(self) -> KdeConnectBattery:  # noqa: D401
        return self._battery

    async def get_connectivity(self) -> KdeConnectConnectivity:  # noqa: D401
        return self._connectivity

    async def list_devices(self) -> list[str]:  # noqa: D401
        return list(self._devices)


__all__ = [
    "KdeConnectError",
    "KdeConnectUnavailableError",
    "KdeConnectClient",
    "RealKdeConnectClient",
    "FixtureKdeConnectClient",
    "KdeConnectBattery",
    "KdeConnectConnectivity",
    "KdeConnectDeviceInfo",
    "parse_kdeconnect_battery",
    "parse_kdeconnect_connectivity",
    "parse_kdeconnect_devices",
    "parse_gdbus_variant",
]
