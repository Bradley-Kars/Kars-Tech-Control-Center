"""backend/fleet/parsers/smart.py — parse smartctl output into a SmartInfo dict.

Mirrors src-tauri/src/parsers/smart.py. Works on captured ``smartctl -a <device>``
text; no real disk or smartctl binary required.
"""

from __future__ import annotations


def parse_smartctl(output: str, device: str) -> dict:
    """Parse smartctl output into a SmartInfo-shaped dict.

    Unknown/missing fields default to empty strings (or ``None`` for the
    optional numeric-style fields) and ``"UNKNOWN"`` health, mirroring the
    Rust parser's tolerant behaviour.
    """
    info = {
        "device": device,
        "model": "",
        "capacity": "",
        "power_on_hours": None,
        "temperature": None,
        "reallocated_sectors": None,
        "pending_sectors": None,
        "health": "UNKNOWN",
    }

    for line in output.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue

        lower = trimmed.lower()
        if lower.startswith("model family:") or lower.startswith("device model:"):
            value = trimmed.split(":", 1)[1].strip() if ":" in trimmed else ""
            if not info["model"]:
                info["model"] = value
        elif trimmed.startswith("User Capacity:"):
            info["capacity"] = (
                trimmed.split(":", 1)[1].strip() if ":" in trimmed else ""
            )
        elif "power_on_hours" in lower:
            value = _extract_smart_value(trimmed)
            if value is not None:
                info["power_on_hours"] = value
        elif "temperature_celsius" in lower or "airflow_temperature_cel" in lower:
            value = _extract_smart_value(trimmed)
            if value is not None:
                info["temperature"] = value
        elif "reallocated_sector_ct" in lower:
            value = _extract_smart_value(trimmed)
            if value is not None:
                info["reallocated_sectors"] = value
        elif "current_pending_sector" in lower:
            value = _extract_smart_value(trimmed)
            if value is not None:
                info["pending_sectors"] = value
        elif trimmed.startswith(
            "SMART overall-health self-assessment test result:"
        ):
            info["health"] = trimmed.split(":", 1)[1].strip() if ":" in trimmed else ""

    return info


def _extract_smart_value(line: str) -> str | None:
    """SMART attribute row: ``ID# NAME FLAG VALUE WORST THRESH TYPE UPDATED WHEN_FAILED RAW_VALUE``.

    Returns the VALUE column (index 3) when present.
    """
    parts = line.split()
    if len(parts) >= 4:
        return parts[3]
    return None
