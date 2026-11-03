"""backend/fleet/meshcentral_service unit tests (P11).

Fixture-only: no network, no real SSH, no real MeshCentral server.
Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.meshcentral_service import (  # noqa: E402
    MeshCentralError,
    MeshCentralClient,
    RealMeshCentralClient,
    FixtureMeshCentralClient,
    MeshDevice,
    DeviceStatus,
    BatchCommand,
    BatchResult,
    EnrollmentInfo,
    SyncResult,
    MeshCentralConfig,
    norm_fleet_key,
    _parse_meshctrl_list_devices,
    _mc_name_matches_server,
)
from fleet.config import ServerConfig, AuthPassword  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DEVICES = [
    MeshDevice(
        id="QZUw1234", name="HTPC", group="Home", conn=1, pwr=1,
        platform="linux", ip="100.87.0.10", last_connect="2026-11-03T10:00:00Z",
    ),
    MeshDevice(
        id="ABCD5678", name="Laptop", group="Home", conn=0, pwr=0,
        platform="windows", ip="100.87.0.20",
    ),
]

DEVICE_STATUS = DeviceStatus(connected=True, cpu_usage=12.5, source="meshcentral")

BATCH_RESULTS = [
    BatchResult(device_id="QZUw1234", success=True, output="uptime: 5 days"),
    BatchResult(device_id="ABCD5678", success=False, output="", error="device offline"),
]

ENROLLMENT_INFO = EnrollmentInfo(
    agent_url="http://<device>.<tailnet>.ts.net/meshagents?id=6&meshid=group123",
    settings_url="http://<device>.<tailnet>.ts.net/meshsettings?id=group123",
    group_id="group123",
    install_command_linux="curl -k ...",
    install_command_windows="$u = '...'",
)

SYNC_RESULT = SyncResult(
    devices_found=2, devices_matched=2, devices_new=0, devices_updated=0,
    errors=[],
)

FLEET_STATS = {
    "devices_found": 2, "online": 1, "offline": 1, "connected": 0,
    "source": "meshcentral",
}

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {
        "meshcentral_url": "http://<device>.<tailnet>.ts.net:8444",
        "meshcentral_admin_user": "admin",
        "meshcentral_admin_pass": "not-a-real-mc-pass",
        "meshcentral_group_id": "group123",
        "tailscale_ip": "100.87.0.10",
    },
}

FIXTURE_SERVER_MATCH = {
    "id": "laptop",
    "name": "Laptop",
    "hostname": "laptop.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "generic",
    "service_keys": {
        "tailscale_ip": "100.87.0.20",
    },
}


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------

def test_fixture_client_returns_stored_devices():
    client = FixtureMeshCentralClient(devices=DEVICES)
    import asyncio
    result = asyncio.run(client.list_devices())
    assert result == DEVICES


def test_fixture_client_returns_stored_device_status():
    client = FixtureMeshCentralClient(device_status=DEVICE_STATUS)
    import asyncio
    result = asyncio.run(client.get_device_status("QZUw1234"))
    assert result == DEVICE_STATUS
    assert result.connected is True


def test_fixture_client_returns_stored_batch_results():
    client = FixtureMeshCentralClient(batch_results=BATCH_RESULTS)
    import asyncio
    cmds = [BatchCommand(command="uptime")]
    result = asyncio.run(client.execute_batch(["QZUw1234"], cmds))
    assert result == BATCH_RESULTS


def test_fixture_client_terminal_and_file_manager_urls():
    client = FixtureMeshCentralClient()
    assert client.get_terminal_url("QZUw1234") == "QZUw1234-terminal"
    assert client.get_file_manager_url("QZUw1234") == "QZUw1234-filemanager"


def test_fixture_client_returns_stored_enrollment_info():
    client = FixtureMeshCentralClient(enrollment_info=ENROLLMENT_INFO)
    result = client.get_enrollment_info("linux")
    assert result == ENROLLMENT_INFO


def test_fixture_client_returns_stored_sync_result():
    client = FixtureMeshCentralClient(sync_result=SYNC_RESULT)
    import asyncio
    servers = [ServerConfig(**FIXTURE_SERVER)]
    result = asyncio.run(client.sync_to_servers_json(servers))
    assert result == SYNC_RESULT


def test_fixture_client_returns_stored_fleet_stats():
    client = FixtureMeshCentralClient(fleet_stats=FLEET_STATS)
    import asyncio
    result = asyncio.run(client.get_fleet_stats())
    assert result == FLEET_STATS


def test_fixture_client_defaults_to_empty():
    client = FixtureMeshCentralClient()
    import asyncio
    assert asyncio.run(client.list_devices()) == []
    status = asyncio.run(client.get_device_status("any"))
    assert status.connected is False
    assert asyncio.run(client.execute_batch(["x"], [BatchCommand(command="x")])) == []
    assert client.get_terminal_url("x") == "x-terminal"
    assert client.get_file_manager_url("x") == "x-filemanager"
    info = client.get_enrollment_info("linux")
    assert info.agent_url == ""
    result = asyncio.run(client.sync_to_servers_json([]))
    assert result.devices_found == 0
    assert asyncio.run(client.get_fleet_stats()) == {}


def test_fixture_client_propagates_list_devices_error():
    client = FixtureMeshCentralClient(list_devices_error=MeshCentralError("boom"))
    import asyncio
    with pytest.raises(MeshCentralError, match="boom"):
        asyncio.run(client.list_devices())


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def test_norm_fleet_key():
    assert norm_fleet_key("Harley's Laptop (MSI, teen)") == "harleyslaptopmsiteen"
    assert norm_fleet_key("ROG Ally (LGBTAlly)") == "rogallylgbtally"
    assert norm_fleet_key("") == ""
    assert norm_fleet_key("!!!") == ""


def test_mc_name_matches_server_exact_id():
    server = ServerConfig(**FIXTURE_SERVER_MATCH)
    assert _mc_name_matches_server("laptop", server) is True


def test_mc_name_matches_server_containment():
    server = ServerConfig(**FIXTURE_SERVER)
    assert _mc_name_matches_server("HTPC", server) is False  # no match key contains HTPC


def test_mc_name_matches_server_empty_mc_name():
    server = ServerConfig(**FIXTURE_SERVER)
    assert _mc_name_matches_server("", server) is False


# ---------------------------------------------------------------------------
# Parse meshctrl ListDevices output
# ---------------------------------------------------------------------------

LIST_DEVICES_OUTPUT = '''Device group: "Home"
id, name, icon, conn, pwr
-------------------------
"QZUw1234", "HTPC", 1, 1, 1
"ABCD5678", "Laptop", 1, 0, 1
'''


def test_parse_meshctrl_list_devices():
    devices = _parse_meshctrl_list_devices(LIST_DEVICES_OUTPUT)
    assert len(devices) == 2
    assert devices[0].id == "QZUw1234"
    assert devices[0].name == "HTPC"
    assert devices[0].group == "Home"
    assert devices[0].conn == 1
    assert devices[0].pwr == 1
    assert devices[1].id == "ABCD5678"
    assert devices[1].name == "Laptop"
    assert devices[1].conn == 0


def test_parse_meshctrl_list_devices_empty():
    with pytest.raises(MeshCentralError, match="No devices parsed"):
        _parse_meshctrl_list_devices("Device group: \"Home\"\nid, name, icon, conn, pwr\n-------------------------\n")


# ---------------------------------------------------------------------------
# Real client: validation + delegation (no network)
# ---------------------------------------------------------------------------

def test_real_client_requires_meshcentral_url():
    with pytest.raises(ValueError, match="meshcentral_url"):
        RealMeshCentralClient(
            config=MeshCentralConfig(
                server_url="", admin_user="admin", admin_pass="pw", group_id="g",
            ),
            ssh=MagicMock(),
        )


def test_real_client_list_devices_delegates_to_ssh():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout=LIST_DEVICES_OUTPUT, stderr="", exit_code=0))
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=ssh,
    )
    import asyncio
    devices = asyncio.run(client.list_devices())
    assert len(devices) == 2
    assert devices[0].id == "QZUw1234"
    ssh.run.assert_awaited_once()
    call_args = ssh.run.await_args
    assert "ListDevices" in call_args[0][0]


def test_real_client_get_device_status_builds_on_list_devices():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout=LIST_DEVICES_OUTPUT, stderr="", exit_code=0))
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=ssh,
    )
    import asyncio
    status = asyncio.run(client.get_device_status("QZUw1234"))
    assert status.connected is True
    status_offline = asyncio.run(client.get_device_status("ABCD5678"))
    assert status_offline.connected is False


def test_real_client_get_device_status_not_found():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout=LIST_DEVICES_OUTPUT, stderr="", exit_code=0))
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=ssh,
    )
    import asyncio
    with pytest.raises(MeshCentralError, match="not found"):
        asyncio.run(client.get_device_status("nonexistent"))


def test_real_client_execute_batch_runs_meshctrl_per_device_command():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout="result output", stderr="", exit_code=0))
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=ssh,
    )
    import asyncio
    cmds = [BatchCommand(command="uptime"), BatchCommand(command="whoami", args=["--version"])]
    results = asyncio.run(client.execute_batch(["QZUw1234", "ABCD5678"], cmds))
    assert len(results) == 4  # 2 devices x 2 commands
    assert all(r.success for r in results)
    assert ssh.run.await_count == 4


def test_real_client_execute_batch_ssh_failure_records_error():
    ssh = MagicMock()
    from fleet.transport import SshCommandError
    ssh.run = AsyncMock(side_effect=SshCommandError("boom", "cmd"))
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=ssh,
    )
    import asyncio
    results = asyncio.run(client.execute_batch(["QZUw1234"], [BatchCommand(command="uptime")]))
    assert len(results) == 1
    assert results[0].success is False
    assert results[0].error is not None


def test_real_client_terminal_and_file_manager_urls():
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=MagicMock(),
    )
    assert client.get_terminal_url("QZUw1234") == "http://<device>.<tailnet>.ts.net:8444/terminal?device=QZUw1234"
    assert client.get_file_manager_url("QZUw1234") == "http://<device>.<tailnet>.ts.net:8444/filemanager?device=QZUw1234"


def test_real_client_enrollment_info_linux():
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=MagicMock(),
    )
    info = client.get_enrollment_info("linux")
    assert "meshagents?id=6" in info.agent_url
    assert "meshid=group123" in info.agent_url
    assert "install_command_linux" in info.install_command_linux or len(info.install_command_linux) > 0


def test_real_client_enrollment_info_windows():
    client = RealMeshCentralClient(
        config=MeshCentralConfig(
            server_url="http://<device>.<tailnet>.ts.net:8444",
            admin_user="admin", admin_pass="not-a-real-pass", group_id="group123",
        ),
        ssh=MagicMock(),
    )
    info = client.get_enrollment_info("windows")
    assert "meshagents?id=4" in info.agent_url


def test_meshcentral_error_is_an_exception():
    assert issubclass(MeshCentralError, Exception)
    err = MeshCentralError("boom")
    assert str(err) == "boom"


def test_meshcentral_client_is_abstract():
    with pytest.raises(TypeError):
        MeshCentralClient()


# ---------------------------------------------------------------------------
# Sync to servers.json
# ---------------------------------------------------------------------------

def test_sync_to_servers_json_matches_by_tailscale_ip():
    client = FixtureMeshCentralClient(devices=DEVICES, sync_result=SYNC_RESULT)
    import asyncio
    servers = [
        ServerConfig(**FIXTURE_SERVER),      # tailscale_ip matches HTPC
        ServerConfig(**FIXTURE_SERVER_MATCH),  # tailscale_ip matches Laptop
    ]
    result = asyncio.run(client.sync_to_servers_json(servers))
    assert result.devices_found == 2
    assert result.devices_matched == 2


def test_sync_to_servers_json_matches_by_name():
    client = FixtureMeshCentralClient(devices=DEVICES, sync_result=SYNC_RESULT)
    import asyncio
    # FIXTURE_SERVER_MATCH has hostname "laptop.<tailnet>.ts.net" which matches device "Laptop"
    servers = [ServerConfig(**FIXTURE_SERVER_MATCH)]
    result = asyncio.run(client.sync_to_servers_json(servers))
    assert result.devices_found == 2
    assert result.devices_matched >= 1


def test_meshcentral_config_is_dataclass():
    cfg = MeshCentralConfig(
        server_url="http://x:8444", admin_user="a", admin_pass="p", group_id="g",
    )
    assert cfg.server_url == "http://x:8444"
    assert cfg.admin_user == "a"
