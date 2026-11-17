"""Servers CRUD endpoints (WS-2.1).

GET/POST /servers, GET/DELETE /servers/{id}
GET /local/system/stats — real host telemetry (without a Tauri runtime).
"""

import asyncio
import glob
import json as _json
import subprocess
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.servers import (
    create_server,
    delete_server,
    get_server,
    get_servers,
    update_server,
)
from app.schemas.servers import ServerCreate, ServerOut, ServerUpdate

router = APIRouter()


@router.post("/servers", response_model=ServerOut)
async def save_server(
    server_in: ServerCreate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Create a server (formerly Tauri `save_server`).

    Flattens the nested `auth` dict (Password/Key variants) into the
    flattened `auth_type`/`auth_password`/`auth_key_path`/`auth_passphrase`
    columns per SPEC.md schema design.
    """
    payload = server_in.model_dump()
    auth = payload.pop("auth", {}) or {}
    auth_type = auth.get("type", "password")
    payload["auth_type"] = auth_type
    if auth_type == "password":
        payload["auth_password"] = auth.get("password")
        payload["auth_key_path"] = None
        payload["auth_passphrase"] = None
    else:
        payload["auth_password"] = None
        payload["auth_key_path"] = auth.get("key_path")
        payload["auth_passphrase"] = auth.get("passphrase")
    db_server = await create_server(db, payload)
    return db_server


@router.get("/servers", response_model=list[ServerOut])
async def get_servers_list(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """List servers (formerly Tauri `get_servers`)."""
    return await get_servers(db, skip=skip, limit=limit)


@router.get("/servers/{server_id}", response_model=ServerOut)
async def get_server_endpoint(
    server_id: str,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Get one server by id."""
    db_server = await get_server(db, server_id)
    if not db_server:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server


@router.delete("/servers/{server_id}", response_model=ServerOut)
async def remove_server(
    server_id: str,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Delete a server (formerly Tauri `remove_server`)."""
    db_server = await delete_server(db, server_id)
    if not db_server:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server


@router.patch("/servers/{server_id}", response_model=ServerOut)
async def update_server_endpoint(
    server_id: str,
    server_in: ServerUpdate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Update a server."""
    payload = server_in.model_dump(exclude_unset=True)
    db_server = await update_server(db, server_id, payload)
    if not db_server:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server


# ---------------------------------------------------------------------------
# Local host telemetry (formerly Tauri `getLocalSystemStats`)
# ---------------------------------------------------------------------------


def _read(path: str) -> str:
    """Read a sysfs/procfs file, returning '' on any error."""
    try:
        with open(path) as f:
            return f.read()
    except OSError:
        return ""


def _cpu_usage() -> float:
    """CPU usage % from two /proc/stat samples 200 ms apart."""
    import time

    def cpu_times() -> tuple[int, int]:
        for line in _read("/proc/stat").splitlines():
            if line.startswith("cpu "):
                parts = list(map(int, line.split()[1:9]))
                return sum(parts), parts[3]
        return 0, 0

    t1, i1 = cpu_times()
    time.sleep(0.2)
    t2, i2 = cpu_times()
    if t2 == t1:
        return 0.0
    return round(((t2 - t1) - (i2 - i1)) / (t2 - t1) * 100, 1)


def _memory() -> dict[str, float]:
    values: dict[str, int] = {}
    for line in _read("/proc/meminfo").splitlines():
        if ":" in line:
            key, val = line.split(":", 1)
            try:
                values[key.strip()] = int(val.strip().split()[0])
            except (ValueError, IndexError):
                continue
    total_kb = values.get("MemTotal", 0)
    free_kb = values.get("MemFree", 0) + values.get("Buffers", 0) + values.get("Cached", 0)
    used_kb = max(0, total_kb - free_kb)
    return {
        "total_mb": round(total_kb / 1024, 1),
        "used_mb": round(used_kb / 1024, 1),
        "free_mb": round(free_kb / 1024, 1),
        "usage_pct": round(used_kb / total_kb * 100, 1) if total_kb else 0.0,
    }


def _uptime() -> str:
    try:
        seconds = float(_read("/proc/uptime").split()[0])
    except (ValueError, IndexError):
        return "unknown"
    return (
        f"{int(seconds // 86400)}d "
        f"{int((seconds % 86400) // 3600)}h "
        f"{int((seconds % 3600) // 60)}m"
    )


def _cpu_info() -> dict[str, Any]:
    cpuinfo = _read("/proc/cpuinfo")
    cores = cpuinfo.count("processor\t:")
    brand = "unknown"
    for line in cpuinfo.splitlines():
        if line.startswith("model name"):
            brand = line.split(":", 1)[1].strip()
            break
    return {"cores": cores, "threads": cores, "brand": brand}


def _load_avg() -> list[float]:
    try:
        return [float(p) for p in _read("/proc/loadavg").split()[:3]]
    except (ValueError, IndexError):
        return [0.0, 0.0, 0.0]


def _sensors_json() -> dict[str, Any]:
    """Parse `sensors -j` (lm-sensors) output, or {} if unavailable."""
    try:
        out = subprocess.run(
            ["sensors", "-j"], capture_output=True, text=True, timeout=5
        ).stdout
        return _json.loads(out)
    except Exception:
        return {}


def _cpu_temp() -> Optional[float]:
    """CPU package temperature (°C).

    Prefer kernel thermal zones (x86_pkg_temp / TCPU), then fall back to
    lm-sensors `coretemp` / `thinkpad` package readings.
    """
    for zone in sorted(glob.glob("/sys/class/thermal/thermal_zone*")):
        ztype = _read(f"{zone}/type").strip()
        if ztype in ("x86_pkg_temp", "TCPU", "cpu-thermal", "acpitz"):
            raw = _read(f"{zone}/temp").strip()
            try:
                val = int(raw) / 1000.0
                if val > 0:
                    return round(val, 1)
            except ValueError:
                continue
    # lm-sensors fallback
    sensors = _sensors_json()
    for chip, vals in sensors.items():
        if not isinstance(vals, dict):
            continue
        if "coretemp" in chip:
            pkg = vals.get("Package id 0", {})
            if isinstance(pkg, dict) and "temp1_input" in pkg:
                return round(float(pkg["temp1_input"]), 1)
        if "thinkpad" in chip:
            cpu = vals.get("CPU", {})
            if isinstance(cpu, dict) and "temp1_input" in cpu:
                return round(float(cpu["temp1_input"]), 1)
    return None


def _fans() -> list[dict[str, Any]]:
    """Fan readings (rpm) from lm-sensors."""
    fans: list[dict[str, Any]] = []
    for chip, vals in _sensors_json().items():
        if not isinstance(vals, dict):
            continue
        for key, val in vals.items():
            if key.startswith("fan") and isinstance(val, dict):
                rpm = val.get(f"{key}_input")
                if rpm is not None:
                    try:
                        fans.append({"label": key, "rpm": int(rpm)})
                    except (ValueError, TypeError):
                        continue
    return fans


def _gpus() -> list[dict[str, Any]]:
    """Detect GPUs via lspci.

    No discrete GPU present → returns the Intel/AMD iGPU so the UI shows
    the real adapter instead of "No dGPU".
    """
    try:
        out = subprocess.run(["lspci"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return []

    gpus: list[dict[str, Any]] = []
    for line in out.splitlines():
        low = line.lower()
        if not any(
            k in low
            for k in ("vga compatible controller", "3d controller", "display controller")
        ):
            continue
        name = line.split(":", 2)[-1].strip() if line.count(":") >= 2 else line.strip()
        vendor = next(
            (v for v in ("Intel", "AMD", "NVIDIA") if v.lower() in name.lower()),
            "Unknown",
        )
        is_dgpu = vendor in ("NVIDIA", "AMD") and "integrated" not in name.lower()
        gpus.append(
            {
                "name": name,
                "vendor": vendor,
                "type": "dgpu" if is_dgpu else "igpu",
                "utilization_pct": None,
                "temperature_c": None,
                "memory_used_mb": None,
                "memory_total_mb": None,
            }
        )
    return gpus


def _collect_local_stats() -> dict[str, Any]:
    """Blocking host telemetry collector (run off the event loop)."""
    memory = _memory()
    cpu = _cpu_info()
    gpus = _gpus()
    cpu_temp = _cpu_temp()
    hostname = _read("/proc/sys/kernel/hostname").strip() or "localhost"
    kernel = _read("/proc/sys/kernel/osrelease").strip()
    arch = _read("/proc/sys/kernel/arch").strip() or "x86_64"
    os_release = next(
        (
            line.split("=", 1)[1].strip('"')
            for line in _read("/etc/os-release").splitlines()
            if line.startswith("PRETTY_NAME=")
        ),
        "Linux",
    )

    return {
        "system": {
            "hostname": hostname,
            "kernel": kernel,
            "os_release": os_release,
            "arch": arch,
            "uptime": _uptime(),
            "cpu_usage": _cpu_usage(),
            "cpu_cores": cpu["cores"],
            "cpu_threads": cpu["threads"],
            "cpu_brand": cpu["brand"],
            "memory_total_mb": int(memory["total_mb"]),
            "memory_used_mb": int(memory["used_mb"]),
            "memory_free_mb": int(memory["free_mb"]),
            "memory_usage_pct": int(memory["usage_pct"]),
            "load_avg": _load_avg(),
            "platform": "linux",
            "source": "local",
        },
        "thermal": {
            "cpu_temp_c": cpu_temp,
            "gpu_temp_c": None,
            "average": cpu_temp,
            "fans": _fans(),
        },
        # Frontend expects a single GPU object under `gpu`
        "gpu": gpus[0] if gpus else None,
        "gpus": gpus,
    }


@router.get("/local/system/stats")
async def get_local_system_stats() -> Any:
    """Get local system stats (formerly Tauri `getLocalSystemStats`)."""
    return await asyncio.to_thread(_collect_local_stats)
