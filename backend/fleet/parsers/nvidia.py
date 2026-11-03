"""backend/fleet/parsers/nvidia.py — parse nvidia-smi output into a GpuInfo dict.

Mirrors src-tauri/src/parsers/nvidia.rs. The SSH probe uses the machine-readable
CSV form:

    nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,temperature.gpu,utilization.gpu --format=csv,noheader,nounits

which yields one row: ``name, driver_version, memory.total, memory.used, temperature.gpu, utilization.gpu``.

Returns None when the output is not recognisable nvidia-smi output, so callers
can fall back to an "unknown GPU" sentinel.
"""

from __future__ import annotations


def parse_nvidia_smi(output: str) -> dict | None:
    """Parse a single CSV row of nvidia-smi output into a GpuInfo-shaped dict.

    Returns ``None`` when the output does not look like nvidia-smi CSV (e.g.
    empty, an error message, or fewer than 6 comma-separated fields).
    """
    if not output or not output.strip():
        return None

    line = output.strip().splitlines()[0].strip()
    if not line:
        return None

    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 6:
        return None

    name = parts[0]
    if not name:
        return None

    return {
        "name": name,
        "driver_version": parts[1],
        "cuda_version": "",  # not part of the CSV query above
        "temperature": parts[4],
        "power_usage": "",
        "power_cap": "",
        "memory_used": parts[3],
        "memory_total": parts[2],
        "utilization": parts[5],
        "fan_speed": "",
    }
