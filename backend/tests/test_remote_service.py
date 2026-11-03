"""backend/fleet/remote_service unit tests (P12).

Fixture-only: no network, no real SSH, no real MeshCentral server.
Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.remote_service import (  # noqa: E402
    RemoteError,
    RemoteClient,
    RealRemoteClient,
    FixtureRemoteClient,
    ShellResult,
    RemoteFileInfo,
    RemoteProcess,
    RemoteConfig,
)
from fleet.config import ServerConfig, AuthPassword  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SHELL_RESULT = ShellResult(
    device_id="dev1",
    command="uptime",
    exit_code=0,
    stdout="up 5 days, 3 users",
    stderr="",
    success=True,
)

FILES = [
    RemoteFileInfo(path="/etc/hosts", is_dir=False, size=123, modified="2026-11-03 10:00", permissions="644"),
    RemoteFileInfo(path="/etc", is_dir=True, size=4096, modified="2026-11-03 09:00", permissions="755"),
]

PROCESSES = [
    RemoteProcess(pid=1, name="systemd", cpu_percent=0.1, memory_percent=0.5, user="root", command="systemd"),
    RemoteProcess(pid=42, name="sshd", cpu_percent=0.0, memory_percent=1.2, user="root", command="sshd"),
]

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
    },
    "meshcentral_device_id": "QZUw1234",
}

FIXTURE_SERVER_NO_MESH = {
    "id": "laptop",
    "name": "Laptop",
    "hostname": "laptop.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "generic",
    "service_keys": {},
}


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------

def test_fixture_client_returns_stored_shell_result():
    client = FixtureRemoteClient(shell_result=SHELL_RESULT)
    import asyncio
    result = asyncio.run(client.execute_shell("uptime"))
    assert result == SHELL_RESULT
    assert result.command == "uptime"
    assert result.success is True


def test_fixture_client_returns_stored_files():
    client = FixtureRemoteClient(files=FILES)
    import asyncio
    result = asyncio.run(client.list_dir("/etc"))
    assert result == FILES
    assert result[0].is_dir is False
    assert result[1].is_dir is True


def test_fixture_client_returns_stored_processes():
    client = FixtureRemoteClient(processes=PROCESSES)
    import asyncio
    result = asyncio.run(client.get_processes(limit=10))
    assert result == PROCESSES
    assert result[0].pid == 1


def test_fixture_client_propagates_errors():
    client = FixtureRemoteClient(
        execute_shell_error=RemoteError("ssh failed"),
        list_dir_error=RemoteError("list failed"),
        get_processes_error=RemoteError("ps failed"),
    )
    import asyncio
    with pytest.raises(RemoteError, match="ssh failed"):
        asyncio.run(client.execute_shell("uptime"))
    with pytest.raises(RemoteError, match="list failed"):
        asyncio.run(client.list_dir("/etc"))
    with pytest.raises(RemoteError, match="ps failed"):
        asyncio.run(client.get_processes())


def test_fixture_client_defaults():
    client = FixtureRemoteClient()
    import asyncio
    result = asyncio.run(client.execute_shell("anything"))
    assert result.command == "anything"
    assert result.success is True
    assert asyncio.run(client.list_dir("/x")) == []
    assert asyncio.run(client.get_processes()) == []


# ---------------------------------------------------------------------------
# RemoteClient is abstract
# ---------------------------------------------------------------------------

def test_remote_client_is_abstract():
    with pytest.raises(TypeError):
        RemoteClient()


# ---------------------------------------------------------------------------
# RemoteError
# ---------------------------------------------------------------------------

def test_remote_error_is_an_exception():
    assert issubclass(RemoteError, Exception)
    err = RemoteError("boom")
    assert str(err) == "boom"


# ---------------------------------------------------------------------------
# Real client: shell_exec delegates to SSH (direct transport)
# ---------------------------------------------------------------------------

def test_real_client_execute_shell_direct_ssh():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout="up 5 days", stderr="", exit_code=0))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER_NO_MESH),
        ssh=ssh,
    )
    import asyncio
    result = asyncio.run(client.execute_shell("uptime", timeout_secs=30))
    assert result.success is True
    assert result.exit_code == 0
    assert result.stdout == "up 5 days"
    assert result.device_id == "laptop"
    ssh.run.assert_awaited_once()
    assert ssh.run.await_args[0][0] == "uptime"


def test_real_client_execute_shell_ssh_failure_records_error():
    ssh = MagicMock()
    from fleet.transport import SshCommandError
    ssh.run = AsyncMock(side_effect=SshCommandError("ssh command failed: exit 1"))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER_NO_MESH),
        ssh=ssh,
    )
    import asyncio
    result = asyncio.run(client.execute_shell("uptime"))
    assert result.success is False
    assert result.exit_code == 1
    assert result.stderr == "ssh command failed: exit 1"


# ---------------------------------------------------------------------------
# Real client: list_dir parses find -printf output
# ---------------------------------------------------------------------------

FIND_OUTPUT = """f|123|2026-11-03 10:00|644|/etc/hosts
d|4096|2026-11-03 09:00|755|/etc
"""


def test_real_client_list_dir_parses_find_output():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout=FIND_OUTPUT, stderr="", exit_code=0))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER_NO_MESH),
        ssh=ssh,
    )
    import asyncio
    files = asyncio.run(client.list_dir("/etc"))
    assert len(files) == 2
    assert files[0].path == "/etc/hosts"
    assert files[0].is_dir is False
    assert files[0].size == 123
    assert files[0].permissions == "644"
    assert files[1].path == "/etc"
    assert files[1].is_dir is True
    assert files[1].size == 4096
    ssh.run.assert_awaited_once()
    assert "find" in ssh.run.await_args[0][0]
    assert "/etc" in ssh.run.await_args[0][0]


def test_real_client_list_dir_skips_malformed_lines():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout="garbage line\nf|123|2026-11-03 10:00|644|/etc/hosts\n", stderr="", exit_code=0))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER_NO_MESH),
        ssh=ssh,
    )
    import asyncio
    files = asyncio.run(client.list_dir("/etc"))
    assert len(files) == 1
    assert files[0].path == "/etc/hosts"


# ---------------------------------------------------------------------------
# Real client: get_processes parses ps output
# ---------------------------------------------------------------------------

PS_OUTPUT = """1 systemd 0.1 0.5 root
42 sshd 0.0 1.2 root
"""


def test_real_client_get_processes_parses_ps_output():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout=PS_OUTPUT, stderr="", exit_code=0))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER_NO_MESH),
        ssh=ssh,
    )
    import asyncio
    procs = asyncio.run(client.get_processes(limit=50))
    assert len(procs) == 2
    assert procs[0].pid == 1
    assert procs[0].name == "systemd"
    assert procs[0].cpu_percent == 0.1
    assert procs[0].user == "root"
    assert procs[1].pid == 42
    assert procs[1].name == "sshd"
    ssh.run.assert_awaited_once()
    assert "ps" in ssh.run.await_args[0][0]


def test_real_client_get_processes_skips_malformed_lines():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout="bad line\n1 systemd 0.1 0.5 root\n", stderr="", exit_code=0))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER_NO_MESH),
        ssh=ssh,
    )
    import asyncio
    procs = asyncio.run(client.get_processes())
    assert len(procs) == 1
    assert procs[0].pid == 1


# ---------------------------------------------------------------------------
# Real client: mesh transport when device_id is set
# ---------------------------------------------------------------------------

def test_real_client_uses_meshctrl_when_device_id_set():
    ssh = MagicMock()
    ssh.run = AsyncMock(return_value=MagicMock(stdout="up 5 days", stderr="", exit_code=0))
    client = RealRemoteClient(
        server=ServerConfig(**FIXTURE_SERVER),  # has meshcentral_device_id
        ssh=ssh,
    )
    import asyncio
    result = asyncio.run(client.execute_shell("uptime"))
    assert result.success is True
    ssh.run.assert_awaited_once()
    cmd = ssh.run.await_args[0][0]
    assert "meshctrl" in cmd
    assert "runcommand" in cmd
    assert "--id 'QZUw1234'" in cmd


def test_real_client_mesh_missing_credentials_raises():
    ssh = MagicMock()
    server = ServerConfig(**{
        **FIXTURE_SERVER,
        "service_keys": {},  # no meshcentral creds
    })
    client = RealRemoteClient(server=server, ssh=ssh)
    import asyncio
    with pytest.raises(RemoteError, match="meshcentral credentials not configured"):
        asyncio.run(client.execute_shell("uptime"))

