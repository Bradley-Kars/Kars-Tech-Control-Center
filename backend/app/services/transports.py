"""Device transport layer for KTS Master Control.

Connection details are read at runtime from
`/home/bradley-kars/Documents/Hermes-Backup/secrets/servers.json`, which lives
OUTSIDE the repo and is never logged, pasted or committed. Nothing in this
module prints credential values.

Transports:
- Unraid  → GraphQL API over HTTPS (`x-api-key`) — real metrics/array/docker/disks
- Linux  → SSH via paramiko (password from servers.json)
- Phone  → ADB / SSH (degrades to an explicit error when the transport/driver
           is unavailable)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

SERVERS_JSON = Path("/home/bradley-kars/Documents/Hermes-Backup/secrets/servers.json")

_cache: dict[str, Any] = {"mtime": -1.0, "data": []}


def _load() -> list[dict[str, Any]]:
    """Load servers.json (cached by mtime). Never logs contents."""
    try:
        mtime = SERVERS_JSON.stat().st_mtime
    except OSError:
        return []
    if _cache["data"] == [] or _cache["mtime"] != mtime:
        try:
            with open(SERVERS_JSON) as f:
                _cache["data"] = json.load(f)
            _cache["mtime"] = mtime
        except (OSError, ValueError):
            return _cache["data"] or []
    return _cache["data"]


def find_entry(
    hostname: Optional[str] = None, server_id: Optional[str] = None
) -> Optional[dict[str, Any]]:
    """Locate a servers.json entry by id or hostname (exact then short-name)."""
    data = _load()
    if server_id:
        for e in data:
            if e.get("id") == server_id:
                return e
    if hostname:
        for e in data:
            if e.get("hostname") == hostname:
                return e
        short = hostname.split(".")[0]
        for e in data:
            h = e.get("hostname") or ""
            if h and h.split(".")[0] == short:
                return e
    return None


# ---------------------------------------------------------------------------
# Unraid — GraphQL
# ---------------------------------------------------------------------------


async def _unraid_post(
    entry: dict[str, Any], query: str, timeout: float = 12.0
) -> dict[str, Any]:
    import httpx

    key = entry.get("api_key")
    if not key:
        raise RuntimeError("no api_key configured for this Unraid host")
    sk = entry.get("service_keys") or {}
    url = sk.get("unraid_url") or f"https://{entry.get('hostname')}"
    async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
        resp = await client.post(
            url.rstrip("/") + "/graphql",
            json={"query": query},
            headers={"x-api-key": key, "Content-Type": "application/json"},
        )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("errors"):
        raise RuntimeError(payload["errors"][0].get("message", "graphql error"))
    return payload.get("data", {})


async def unraid_system_stats(entry: dict[str, Any]) -> dict[str, Any]:
    q = (
        "{ info { os { hostname platform uptime } versions { core { unraid } } }"
        " metrics { cpu { percentTotal }"
        " memory { percentTotal used total free available } } }"
    )
    try:
        data = await _unraid_post(entry, q)
    except Exception as exc:  # noqa: BLE001
        return {"connected": False, "source": "graphql", "error": f"{type(exc).__name__}: {exc}"}

    info = data.get("info") or {}
    os_ = info.get("os") or {}
    metrics = data.get("metrics") or {}
    cpu = (metrics.get("cpu") or {}).get("percentTotal")
    mem = metrics.get("memory") or {}
    total = mem.get("total") or 0
    used = mem.get("used") or 0
    return {
        "connected": True,
        "source": "graphql",
        "hostname": os_.get("hostname"),
        "platform": os_.get("platform"),
        "kernel": None,
        "uptime": os_.get("uptime"),
        "unraid_version": ((info.get("versions") or {}).get("core") or {}).get("unraid"),
        "cpu_usage": round(cpu, 1) if cpu is not None else None,
        "memory_usage_pct": round(mem.get("percentTotal", 0), 1) if mem else None,
        "memory_total_mb": round(total / 1048576, 0) if total else None,
        "memory_used_mb": round(used / 1048576, 0) if used else None,
    }


async def unraid_array(entry: dict[str, Any]) -> dict[str, Any]:
    q = "{ array { state capacity { kilobytes { free used total } } } }"
    try:
        data = await _unraid_post(entry, q)
    except Exception as exc:  # noqa: BLE001
        return {"connected": False, "source": "graphql", "error": f"{type(exc).__name__}: {exc}"}
    arr = data.get("array") or {}
    kb = (arr.get("capacity") or {}).get("kilobytes") or {}

    def gb(v: Any) -> Optional[float]:
        try:
            return round(int(v) / 1_048_576, 1)
        except (TypeError, ValueError):
            return None

    return {
        "connected": True,
        "source": "graphql",
        "array_state": arr.get("state"),
        "capacity": {
            "free_gb": gb(kb.get("free")),
            "used_gb": gb(kb.get("used")),
            "total_gb": gb(kb.get("total")),
        },
    }


async def unraid_docker(entry: dict[str, Any]) -> list[dict[str, Any]]:
    q = "{ docker { containers { id names image state status autoStart } } }"
    data = await _unraid_post(entry, q)
    containers = (data.get("docker") or {}).get("containers") or []
    out = []
    for c in containers:
        names = c.get("names") or []
        out.append(
            {
                "id": c.get("id") or "",
                "name": (names[0].lstrip("/") if names else ""),
                "image": c.get("image") or "",
                "state": c.get("state") or "",
                "status": c.get("status") or "",
                "autoStart": bool(c.get("autoStart")),
            }
        )
    return out


async def unraid_disks(entry: dict[str, Any]) -> list[dict[str, Any]]:
    q = "{ disks { name device type size } }"
    data = await _unraid_post(entry, q)
    return data.get("disks") or []


# ---------------------------------------------------------------------------
# SSH — Linux hosts (paramiko, password auth from servers.json)
# ---------------------------------------------------------------------------


def ssh_exec(
    entry: dict[str, Any], command: str, timeout: int = 20
) -> dict[str, Any]:
    """Run a command over SSH. Blocking — call via asyncio.to_thread."""
    try:
        import paramiko
    except ImportError:
        return {"ok": False, "stdout": "", "stderr": "", "exit_code": None,
                "error": "paramiko not installed"}

    host = entry.get("hostname")
    port = int(entry.get("port") or 22)
    user = entry.get("username") or "root"
    auth = entry.get("auth") or {}
    password = auth.get("password")
    key_path = auth.get("key_path")
    if not host:
        return {"ok": False, "stdout": "", "stderr": "", "exit_code": None,
                "error": "no hostname"}

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        connect_kw: dict[str, Any] = dict(
            hostname=str(host), port=port, username=str(user),
            timeout=timeout, banner_timeout=timeout, auth_timeout=timeout,
        )
        if password:
            connect_kw["password"] = password
        if key_path:
            connect_kw["key_filename"] = key_path
        client.connect(**connect_kw)
        _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return {"ok": code == 0, "stdout": out, "stderr": err,
                "exit_code": code, "error": None}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "stdout": "", "stderr": "", "exit_code": None,
                "error": f"{type(exc).__name__}: {exc}"}
    finally:
        client.close()


def ssh_system_stats(entry: dict[str, Any], timeout: int = 20) -> dict[str, Any]:
    """Compose host stats from a single SSH round-trip (blocking).

    Returns connected:false with an explicit error when SSH fails (e.g. host
    offline) — never fabricated numbers.
    """
    cmd = (
        "echo __UPTIME__; cat /proc/uptime 2>/dev/null; "
        "echo __MEM__; grep -E 'MemTotal|MemAvailable' /proc/meminfo; "
        "echo __LOAD__; cat /proc/loadavg; "
        "echo __CPU__; top -bn1 2>/dev/null | grep -i '%Cpu' | head -1; "
        "echo __KERNEL__; uname -r; "
        "echo __HOST__; hostname; "
        "echo __DISK__; df -h / 2>/dev/null | tail -1"
    )
    r = ssh_exec(entry, cmd, timeout=timeout)
    if not r["ok"]:
        return {"connected": False, "source": "ssh", "error": r["error"]}

    def section(text: str, name: str) -> str:
        marker = f"__{name}__"
        if marker not in text:
            return ""
        return text.split(marker, 1)[1].split("__", 1)[0].strip()

    out = r["stdout"]
    mem_block = section(out, "MEM")
    total_kb = used_pct = None
    mem_total = mem_avail = None
    for line in mem_block.splitlines():
        if "MemTotal" in line:
            mem_total = int(line.split()[1])
        elif "MemAvailable" in line:
            mem_avail = int(line.split()[1])
    if mem_total and mem_avail is not None:
        mem_used = mem_total - mem_avail
        used_pct = round(mem_used / mem_total * 100, 1)
    uptime_s = section(out, "UPTIME").split()[0] if section(out, "UPTIME") else None
    uptime_str = None
    if uptime_s:
        try:
            secs = float(uptime_s)
            uptime_str = f"{int(secs // 86400)}d {int((secs % 86400) // 3600)}h {int((secs % 3600) // 60)}m"
        except ValueError:
            pass
    cpu_line = section(out, "CPU")
    cpu_pct = None
    if "id" in cpu_line.lower() or "idle" in cpu_line.lower():
        try:
            # e.g. "%Cpu(s):  3.2 us,  1.0 sy,  0.0 ni, 95.1 id, ..."
            parts = cpu_line.replace(",", " ").split()
            for i, tok in enumerate(parts):
                if tok in ("id,", "id") and i > 0:
                    cpu_pct = round(100 - float(parts[i - 1]), 1)
                    break
        except (ValueError, IndexError):
            pass

    disk_line = section(out, "DISK")

    return {
        "connected": True,
        "source": "ssh",
        "hostname": section(out, "HOST") or entry.get("hostname"),
        "kernel": section(out, "KERNEL"),
        "uptime": uptime_str,
        "cpu_usage": cpu_pct,
        "memory_usage_pct": used_pct,
        "memory_total_mb": round(mem_total / 1024, 0) if mem_total else None,
        "memory_used_mb": round((mem_total - mem_avail) / 1024, 0) if mem_total and mem_avail is not None else None,
        "disk": disk_line,
        "load_avg": (section(out, "LOAD") or "").split()[:3],
    }


# ---------------------------------------------------------------------------
# Phone — ADB / SSH
# ---------------------------------------------------------------------------


def phone_stats(entry: dict[str, Any]) -> dict[str, Any]:
    """Phone metrics via SSH (Termux on :8022) or ADB.

    ADB binary is not installed on this host; SSH requires key/sshpass. A live
    device also must be reachable. Any gap yields an explicit error state.
    """
    import shutil

    sk = entry.get("service_keys") or {}
    phone_ssh = sk.get("phone_ssh")
    if shutil.which("adb") is None and not phone_ssh:
        return {"connected": False, "source": "adb",
                "error": "ADB not installed and no SSH endpoint configured"}
    if phone_ssh:
        # phone_ssh = "user@host:port"
        try:
            userhost, _, port = phone_ssh.rpartition(":")
            user, _, host = userhost.partition("@")
            phone_entry = dict(entry)
            phone_entry.update({"hostname": host, "port": int(port), "username": user})
            # Termux sshd: no password in file → will error unless key present
            return ssh_system_stats(phone_entry, timeout=15)
        except Exception as exc:  # noqa: BLE001
            return {"connected": False, "source": "ssh", "error": f"{type(exc).__name__}: {exc}"}
    return {"connected": False, "source": "adb", "error": "no usable phone transport"}
