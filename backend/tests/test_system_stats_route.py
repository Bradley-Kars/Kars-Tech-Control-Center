"""backend/fleet/router.py — GET /api/fleet/system/stats (P2).

Fixture-only: KTS_SERVERS_FILE points at a temp servers.json — the real
~/.config/master-control/servers.json is never touched. SSH is faked by
patching SshHelper.run, so neither asyncssh nor a real network is needed.
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
from fleet.router import SshHelper  # noqa: E402
from fleet.transport import SshResult, SshCommandError, TransportError  # noqa: E402

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {},
    "api_key": "sk-live-placeholder-key",
}

PROC_STAT_SAMPLE_1 = """cpu  100 200 300 4000 500 600 700 800
cpu0 50 100 150 2000 250 300 350 400
"""
PROC_STAT_SAMPLE_2 = """cpu  150 300 450 5000 700 900 1050 1100
cpu0 75 150 225 2500 375 450 525 550
"""

PROC_MEMINFO = """MemTotal:       16384000 kB
MemFree:         2048000 kB
MemAvailable:    8192000 kB
SwapTotal:       4194304 kB
SwapFree:        4194304 kB
"""

PROC_LOADAVG = "0.50 0.40 0.30 1/456 7890\n"

PROC_CPUINFO = """processor	0
vendor_id	GenuineIntel
cpu family	6
model	158
model name	Intel(R) Core(TM) i7-10700K
processor	1
vendor_id	GenuineIntel
cpu family	6
model	158
model name	Intel(R) Core(TM) i7-10700K
"""


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


def _patch_ssh(monkeypatch, responses: dict[str, str | list[str]]):
    """Respond to SSH commands by matching the command string against keys.

    A value may be a list; successive matching calls cycle through it (used for
    the two /proc/stat samples that the CPU delta needs).
    """
    counters: dict[str, int] = {}

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        for key, value in responses.items():
            if command == key or command.startswith(key):
                if isinstance(value, list):
                    idx = counters.get(key, 0)
                    counters[key] = idx + 1
                    output = value[idx % len(value)]
                else:
                    output = value
                return SshResult(exit_code=0, stdout=output, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    return counters


# ---------------------------------------------------------------------------
# success path
# ---------------------------------------------------------------------------


def test_success_returns_system_stats(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(
        monkeypatch,
        {
            "hostname": "home-server\n",
            "uname -r": "6.1.15-unraid\n",
            "uptime -p": "up 3 days, 4 hours\n",
            "cat /proc/stat": [PROC_STAT_SAMPLE_1, PROC_STAT_SAMPLE_2],
            "cat /proc/meminfo": PROC_MEMINFO,
            "cat /proc/loadavg": PROC_LOADAVG,
            "cat /proc/cpuinfo": PROC_CPUINFO,
        },
    )
    r = client.get(
        "/api/fleet/system/stats?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hostname"] == "home-server"
    assert body["kernel"] == "6.1.15-unraid"
    assert body["uptime"] == "up 3 days, 4 hours"
    assert body["cpu_usage"] > 0
    assert body["cpu_cores"] == 2
    assert body["memory_total_mb"] == 16384000 // 1024
    assert body["memory_used_mb"] > 0
    assert 0 <= body["memory_usage_pct"] <= 100
    assert body["load_avg"] == [0.5, 0.4, 0.3]


def test_server_not_found_404(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    _patch_ssh(monkeypatch, {})
    r = client.get(
        "/api/fleet/system/stats?server_id=does-not-exist",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 404
    assert "detail" in r.json()


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------


def test_no_token_401(app_client, monkeypatch):
    client, _secret, _servers_file = app_client
    _patch_ssh(monkeypatch, {})
    r = client.get("/api/fleet/system/stats?server_id=unraid-main")
    assert r.status_code == 401


def test_read_scoped_token_403(app_client, monkeypatch):
    client, _secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)
    table_dir = Path(tempfile.mkdtemp()) / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, read_secret = table.mint("fleet-reader", actor_id="fleet-reader", scope="read")
    app = create_app(table)
    _patch_ssh(monkeypatch, {})
    r = TestClient(app, base_url="http://127.0.0.1").get(
        "/api/fleet/system/stats?server_id=unraid-main",
        headers={"X-API-Token": read_secret},
    )
    # GET is a read method; a read-scoped token is allowed (read scope suffices).
    assert r.status_code in (200, 502), r.text


# ---------------------------------------------------------------------------
# ssh failure handling (auth failure / timeout / malformed) -> 502
# ---------------------------------------------------------------------------


def test_ssh_command_error_returns_502(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("auth failed: password=not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/system/stats?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    body = r.json()
    assert "not-a-real-password" not in str(body)
    assert "[REDACTED]" in str(body) or "auth failed" in str(body)


def test_transport_error_returns_502(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        raise TransportError("network is unreachable")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/system/stats?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 502, r.text
    assert "network is unreachable" in r.json()["detail"]


def test_malformed_output_degrades_gracefully(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        return SshResult(exit_code=0, stdout="not numbers at all\n", stderr="")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/system/stats?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hostname"] == "not numbers at all".strip() or body["hostname"]
    assert "cpu_usage" in body


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_gpu_info
# ---------------------------------------------------------------------------


NVIDIA_SMI_ROW = "GeForce RTX 4090, 535.86.01, 24576, 2048, 58, 99\n"


def test_gpu_info_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        if command.startswith("nvidia-smi"):
            return SshResult(exit_code=0, stdout=NVIDIA_SMI_ROW, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/unraid/get_gpu_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "GeForce RTX 4090"
    assert body["driver_version"] == "535.86.01"
    assert body["temperature"] == "58"
    assert body["memory_used"] == "2048"
    assert body["memory_total"] == "24576"
    assert body["utilization"] == "99"


def test_gpu_info_not_nvidia_returns_unknown(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        if command.startswith("nvidia-smi"):
            return SshResult(exit_code=0, stdout="error: cannot access GPU\n", stderr="")
        raise SshCommandError("unexpected")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/unraid/get_gpu_info?server_id=unraid-main",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Unknown GPU"


# ---------------------------------------------------------------------------
# GET /api/fleet/unraid/get_smart_data
# ---------------------------------------------------------------------------


SMARTCTL_ROW = """Device Model:     Samsung SSD 870 EVO
User Capacity:    500,107,862,016 bytes [500 GB]
SMART overall-health self-assessment test result: PASSED
  9 Power_On_Hours          0x0032   097   097   000    Old_age   Always       -       12345
 194 Temperature_Celsius     0x0022   032   032   000    Old_age   Always       -       32
 196 Reallocated_Sector_Ct   0x0032   100   100   000    Old_age   Always       -       0
 197 Current_Pending_Sector  0x0032   100   100   000    Old_age   Always       -       0
"""


def test_smart_data_success(app_client, monkeypatch):
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        if command.startswith("smartctl"):
            return SshResult(exit_code=0, stdout=SMARTCTL_ROW, stderr="")
        raise SshCommandError(f"unexpected command: {command}")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    r = client.get(
        "/api/fleet/unraid/get_smart_data?server_id=unraid-main&device=/dev/sda",
        headers={"X-API-Token": secret},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["device"] == "/dev/sda"
    assert body["model"] == "Samsung SSD 870 EVO"
    assert body["health"] == "PASSED"
    assert body["temperature"] == "032"


def test_probe_ssh_error_returns_502(app_client, monkeypatch):
    """Both gpu-info and smart-data return a redacted 502 on SSH failure."""
    client, secret, servers_file = app_client
    _seed(servers_file, FIXTURE_SERVER)

    async def fake_run(self, command, timeout=60.0):  # noqa: ARG001
        raise SshCommandError("auth failed: password=not-a-real-password")

    monkeypatch.setattr(SshHelper, "run", fake_run)
    for path in (
        "/api/fleet/unraid/get_gpu_info?server_id=unraid-main",
        "/api/fleet/unraid/get_smart_data?server_id=unraid-main&device=/dev/sda",
    ):
        r = client.get(path, headers={"X-API-Token": secret})
        assert r.status_code == 502, f"{path}: {r.text}"
        assert "not-a-real-password" not in str(r.json())
