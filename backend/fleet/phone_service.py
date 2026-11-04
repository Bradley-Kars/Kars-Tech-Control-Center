"""backend/fleet/phone_service.py — phone (ADB) host-local port (P14).

Port of the original Rust phone (ADB) service: device info, battery, storage and
memory read over ADB against an Android phone attached to the machine that
runs this backend.

This is HOST-LOCAL: adb is invoked directly on the backend host (no SSH, no
remote server). The adb serial comes from the selected server's
``service_keys.phone_adb_serial`` so a single backend can serve several
phones, but the commands run locally.

The module is feature-flagged: when the ``adb`` binary is not installed on
the host, :meth:`RealPhoneClient.is_available` returns False and routes
report a clean 503 instead of crashing. Secrets never reach logs or error
messages — the router redacts every failure.

Tests replay recorded adb output by patching ``RealPhoneClient._run`` — no
adb binary, no real phone, no network.
"""

from __future__ import annotations

import asyncio
import shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class PhoneError(Exception):
    """Raised when a phone (ADB) query fails."""


class PhoneUnavailableError(PhoneError):
    """Raised when the adb binary is not installed on this host."""


class PhoneClient(ABC):
    """Abstract base for phone (ADB) clients."""

    @abstractmethod
    async def get_device_info(self) -> PhoneDeviceInfo:
        ...

    @abstractmethod
    async def get_battery(self) -> PhoneBattery:
        ...

    @abstractmethod
    async def get_storage(self) -> PhoneStorage:
        ...

    @abstractmethod
    async def get_memory(self) -> PhoneMemory:
        ...

    @classmethod
    @abstractmethod
    def is_available(cls) -> bool:
        """True when the host can actually run phone (ADB) commands."""


# ---------------------------------------------------------------------------
# Response shapes (mirror the original Rust phone service)
# ---------------------------------------------------------------------------


@dataclass
class PhoneDeviceInfo:
    model: str = "Unknown"
    android_version: str = "Unknown"
    api_level: str = "Unknown"
    serial: str = "Unknown"
    oneui_version: str | None = None
    manufacturer: str = "Unknown"
    brand: str = "Unknown"
    build_fingerprint: str = "Unknown"


@dataclass
class PhoneBattery:
    level: int = 0
    status: str = "Unknown"
    health: str = "Unknown"
    temperature: float = 0.0
    voltage: int = 0
    technology: str = "Li-ion"
    charging: bool = False
    plugged: str = "None"
    current_ua: int | None = None
    cycle_count: int | None = None


@dataclass
class PhoneStorage:
    total_gb: float = 0.0
    free_gb: float = 0.0
    used_gb: float = 0.0
    used_pct: float = 0.0


@dataclass
class PhoneMemory:
    total_mb: int = 0
    available_mb: int = 0
    free_mb: int = 0
    cached_mb: int = 0
    buffers_mb: int = 0
    used_pct: float = 0.0

    @property
    def used_mb(self) -> int:
        return max(self.total_mb - self.available_mb, 0)


# ---------------------------------------------------------------------------
# Pure response parsing (command-free, easy to unit test)
# ---------------------------------------------------------------------------


def _as_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_bool(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


def _prop_line(output: str, key: str) -> str | None:
    """Return the value of a ``key=value`` getprop line, or None."""
    for line in output.splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    return None


def parse_phone_device_info(output: str) -> PhoneDeviceInfo:
    """Parse one getprop call with 8 properties, one per line:

    ro.product.model, ro.build.version.release, ro.build.version.sdk,
    ro.serialno, ro.build.version.oneui (optional), ro.product.manufacturer,
    ro.product.brand, ro.build.fingerprint
    """
    lines = output.splitlines()
    return PhoneDeviceInfo(
        model=lines[0].strip() if len(lines) > 0 and lines[0].strip() else "Unknown",
        android_version=lines[1].strip() if len(lines) > 1 and lines[1].strip() else "Unknown",
        api_level=lines[2].strip() if len(lines) > 2 and lines[2].strip() else "Unknown",
        serial=lines[3].strip() if len(lines) > 3 and lines[3].strip() else "Unknown",
        oneui_version=(
            lines[4].strip() if len(lines) > 4 and lines[4].strip() else None
        ),
        manufacturer=lines[5].strip() if len(lines) > 5 and lines[5].strip() else "Unknown",
        brand=lines[6].strip() if len(lines) > 6 and lines[6].strip() else "Unknown",
        build_fingerprint=lines[7].strip() if len(lines) > 7 and lines[7].strip() else "Unknown",
    )


def parse_phone_battery(output: str) -> PhoneBattery:
    """Parse ``dumpsys battery`` output (``key: value`` lines)."""

    def field(key: str) -> str | None:
        for line in output.splitlines():
            trimmed = line.strip()
            if trimmed.startswith(key + ":"):
                return trimmed.split(":", 1)[1].strip()
        return None

    level = _as_int(field("level"))
    status = field("status") or "Unknown"
    health = field("health") or "Unknown"
    temperature = _as_float(field("temperature") or "0") / 10.0
    voltage = _as_int(field("voltage"))
    technology = field("technology") or "Li-ion"
    charging = status in ("2", "5")
    plugged_raw = field("plugged") or "0"
    plugged = {"1": "AC", "2": "USB", "4": "Wireless"}.get(plugged_raw, "None")
    current_str = field("current now")
    current_ua = _as_int(current_str) if current_str else None
    cycle_count = None
    last_event = ""
    for line in reversed(output.splitlines()):
        if "ACTION_BATTERY_CHANGED" in line:
            last_event = line
            break
    if last_event:
        for part in last_event.split(","):
            part = part.strip()
            if part.startswith("cycle_count:"):
                cycle_count = _as_int(part.split(":", 1)[1]) or None
                break
    return PhoneBattery(
        level=level,
        status=status,
        health=health,
        temperature=temperature,
        voltage=voltage,
        technology=technology,
        charging=charging,
        plugged=plugged,
        current_ua=current_ua,
        cycle_count=cycle_count,
    )


def _parse_size(token: str) -> float:
    """Parse a ``df -h`` size token (e.g. ``50G``, ``512M``, ``4096K``) to GB."""
    token = token.strip().upper()
    if not token:
        return 0.0
    if token.endswith(("G", "GB")):
        return _as_float(token.rstrip("GB").strip() or "0")
    if token.endswith(("M", "MB")):
        return _as_float(token.rstrip("MB").strip() or "0") / 1024.0
    if token.endswith(("K", "KB")):
        return _as_float(token.rstrip("KB").strip() or "0") / (1024.0 * 1024.0)
    return _as_float(token) / (1024.0 * 1024.0 * 1024.0)


def parse_phone_storage(output: str) -> PhoneStorage:
    """Parse one ``df -h /data`` data row:

    Filesystem Size Used Avail Use% Mounted on
    """
    storage = PhoneStorage()
    lines = [line for line in output.splitlines() if line.strip()]
    if len(lines) < 2:
        return storage
    parts = lines[1].split()
    if len(parts) < 5:
        return storage
    total = _parse_size(parts[1])
    used = _parse_size(parts[2])
    free = _parse_size(parts[3])
    storage.total_gb = total
    storage.used_gb = used
    storage.free_gb = free
    storage.used_pct = round((used / total) * 100.0, 1) if total > 0 else 0.0
    return storage


def parse_phone_memory(output: str) -> PhoneMemory:
    """Parse ``cat /proc/meminfo`` output (``Key: value kB`` lines)."""

    def kb(key: str) -> int:
        for line in output.splitlines():
            if line.startswith(key):
                return _as_int(line.split()[1] if len(line.split()) > 1 else "0")
        return 0

    total = kb("MemTotal:")
    free = kb("MemFree:")
    available = kb("MemAvailable:")
    cached = kb("Cached:")
    buffers = kb("Buffers:")
    used = max(total - available, 0)
    used_pct = round((used / total) * 100.0, 1) if total > 0 else 0.0
    return PhoneMemory(
        total_mb=total // 1024,
        available_mb=available // 1024,
        free_mb=free // 1024,
        cached_mb=cached // 1024,
        buffers_mb=buffers // 1024,
        used_pct=used_pct,
    )


# ---------------------------------------------------------------------------
# Real client — local adb
# ---------------------------------------------------------------------------


class RealPhoneClient(PhoneClient):
    """Real phone client running adb directly on the backend host.

    Mirrors the ``get_phone_*`` commands. The adb serial is configured
    per server (``service_keys.phone_adb_serial``) and each command runs
    ``adb -s <serial> shell <cmd>`` locally.
    """

    def __init__(self, serial: str) -> None:
        if not serial or not serial.strip():
            raise ValueError("phone_adb_serial not configured")
        self.serial = serial.strip()

    @classmethod
    def is_available(cls) -> bool:
        return shutil.which("adb") is not None

    async def _run(self, cmd: list[str]) -> str:
        """Run one adb command locally and return its stdout."""
        if not shutil.which(cmd[0]):
            raise PhoneUnavailableError(f"{cmd[0]} not installed on this host")
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            detail = stderr.decode(errors="replace").strip()
            raise PhoneError(f"command failed (exit {proc.returncode}): {detail}")
        return stdout.decode(errors="replace")

    async def get_device_info(self) -> PhoneDeviceInfo:
        output = await self._run(
            [
                "adb",
                "-s",
                self.serial,
                "shell",
                "getprop ro.product.model; "
                "getprop ro.build.version.release; "
                "getprop ro.build.version.sdk; "
                "getprop ro.serialno; "
                "getprop ro.build.version.oneui; "
                "getprop ro.product.manufacturer; "
                "getprop ro.product.brand; "
                "getprop ro.build.fingerprint",
            ]
        )
        return parse_phone_device_info(output)

    async def get_battery(self) -> PhoneBattery:
        output = await self._run(
            ["adb", "-s", self.serial, "shell", "dumpsys battery"]
        )
        return parse_phone_battery(output)

    async def get_storage(self) -> PhoneStorage:
        output = await self._run(["adb", "-s", self.serial, "shell", "df -h /data"])
        return parse_phone_storage(output)

    async def get_memory(self) -> PhoneMemory:
        output = await self._run(
            ["adb", "-s", self.serial, "shell", "cat /proc/meminfo"]
        )
        return parse_phone_memory(output)


# ---------------------------------------------------------------------------
# Fixture client — recorded responses for tests
# ---------------------------------------------------------------------------


class FixturePhoneClient(PhoneClient):
    """Fixture-based phone client for testing.

    Returns recorded adb output instead of invoking adb. No real phone is
    required.
    """

    def __init__(
        self,
        device_info: PhoneDeviceInfo | None = None,
        battery: PhoneBattery | None = None,
        storage: PhoneStorage | None = None,
        memory: PhoneMemory | None = None,
    ) -> None:
        self._device_info = device_info or PhoneDeviceInfo()
        self._battery = battery or PhoneBattery()
        self._storage = storage or PhoneStorage()
        self._memory = memory or PhoneMemory()

    @classmethod
    def is_available(cls) -> bool:
        return True

    async def get_device_info(self) -> PhoneDeviceInfo:  # noqa: D401
        return self._device_info

    async def get_battery(self) -> PhoneBattery:  # noqa: D401
        return self._battery

    async def get_storage(self) -> PhoneStorage:  # noqa: D401
        return self._storage

    async def get_memory(self) -> PhoneMemory:  # noqa: D401
        return self._memory


__all__ = [
    "PhoneError",
    "PhoneUnavailableError",
    "PhoneClient",
    "RealPhoneClient",
    "FixturePhoneClient",
    "PhoneDeviceInfo",
    "PhoneBattery",
    "PhoneStorage",
    "PhoneMemory",
    "parse_phone_device_info",
    "parse_phone_battery",
    "parse_phone_storage",
    "parse_phone_memory",
]
