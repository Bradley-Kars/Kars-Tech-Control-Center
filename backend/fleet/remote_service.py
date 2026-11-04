"""backend/fleet/remote_service.py — remote shell, file listing, process list (P12).

Provides ShellResult, RemoteFileInfo, RemoteProcess over SSH (direct to the
target server) or over the MeshCentral meshctrl transport (when the server
carries a meshcentral_device_id). Mirrors the meshcentral_shell_exec,
meshcentral_list_dir and meshcentral_get_processes commands.

Fixture-only: tests never touch the real network or SSH.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Any

from .config import ServerConfig
from .transport import SshCommandError, SshHelper, SshResult, TransportError


class RemoteError(TransportError):
    """Raised when a remote shell/file/process operation fails."""


@dataclass
class ShellResult:
    """Result of a remote shell command execution."""
    device_id: str
    command: str
    exit_code: int
    stdout: str
    stderr: str
    success: bool


@dataclass
class RemoteFileInfo:
    """File info from a remote directory listing."""
    path: str
    is_dir: bool
    size: int | None = None
    modified: str | None = None
    permissions: str | None = None


@dataclass
class RemoteProcess:
    """Process info from a remote device."""
    pid: int
    name: str
    cpu_percent: float | None = None
    memory_percent: float | None = None
    user: str | None = None
    command: str | None = None


@dataclass
class RemoteConfig:
    """Remote connection configuration.

    device_id: the MeshCentral device id, when the target is managed through
    the meshctrl-over-SSH transport. When absent, commands run over direct
    SSH to the server's hostname.
    """
    device_id: str | None = None


class RemoteClient(abc.ABC):
    """Abstract remote client. Real implementation talks over SSH (direct or
    via meshctrl); Fixture implementation replays stored responses."""

    @abc.abstractmethod
    async def execute_shell(self, command: str, *, timeout_secs: int = 60) -> ShellResult:
        ...

    @abc.abstractmethod
    async def list_dir(self, path: str) -> list[RemoteFileInfo]:
        ...

    @abc.abstractmethod
    async def get_processes(self, limit: int = 50) -> list[RemoteProcess]:
        ...


class RealRemoteClient(RemoteClient):
    """Remote client over SSH (direct) or MeshCentral meshctrl (mesh).

    When device_id is set, commands run
    ``meshctrl runcommand --id <device_id> --run '<cmd>' --reply`` over SSH to
    the Unraid host where meshcentral runs. Otherwise commands run directly
    over SSH to the server.
    """

    def __init__(
        self,
        server: ServerConfig,
        ssh: SshHelper,
        device_id: str | None = None,
    ):
        self.server = server
        self.ssh = ssh
        self.device_id = device_id or server.meshcentral_device_id

    # ------------------------------------------------------------------
    # Transport
    # ------------------------------------------------------------------

    async def _run(self, command: str, *, timeout: float = 60.0) -> SshResult:
        if self.device_id:
            return await self._meshctrl(command, timeout=timeout)
        return await self.ssh.run(command, timeout=timeout)

    async def _meshctrl(self, command: str, *, timeout: float = 60.0) -> SshResult:
        keys = self.server.service_keys
        server_url = keys.meshcentral_url if keys else None
        admin_user = keys.meshcentral_admin_user if keys else None
        admin_pass = keys.meshcentral_admin_pass if keys else None
        if not server_url or not admin_user or not admin_pass:
            raise RemoteError("meshcentral credentials not configured")
        escaped = command.replace("'", "'\\'\\''")
        full_cmd = (
            "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js "
            f"--url {server_url} --loginuser {admin_user} --loginpass {admin_pass} "
            f"runcommand --id '{self.device_id}' --run '{escaped}' --reply"
        )
        return await self.ssh.run(full_cmd, timeout=timeout)

    # ------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------

    async def execute_shell(self, command: str, *, timeout_secs: int = 60) -> ShellResult:
        try:
            result = await self._run(command, timeout=float(timeout_secs))
        except SshCommandError as exc:
            return ShellResult(
                device_id=self.device_id or self.server.id,
                command=command,
                exit_code=1,
                stdout="",
                stderr=str(exc),
                success=False,
            )
        return ShellResult(
            device_id=self.device_id or self.server.id,
            command=command,
            exit_code=result.exit_code,
            stdout=result.stdout,
            stderr=result.stderr,
            success=result.exit_code == 0,
        )

    async def list_dir(self, path: str) -> list[RemoteFileInfo]:
        cmd = (
            f"find {path!r} -maxdepth 1 -printf '%y|%s|%TY-%Tm-%Td %TH:%TM|%m|%p\\n' "
            "2>/dev/null"
        )
        result = await self._run(cmd)
        files: list[RemoteFileInfo] = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 5:
                continue
            kind, size, modified, permissions, fpath = (
                parts[0],
                parts[1],
                parts[2],
                parts[3],
                parts[4],
            )
            try:
                size_int = int(size) if size.isdigit() else None
            except ValueError:
                size_int = None
            files.append(
                RemoteFileInfo(
                    path=fpath,
                    is_dir=kind == "d",
                    size=size_int,
                    modified=modified or None,
                    permissions=permissions or None,
                )
            )
        return files

    async def get_processes(self, limit: int = 50) -> list[RemoteProcess]:
        cmd = (
            f"ps -eo pid=,comm=,%cpu=,%mem=,user= --no-headers --sort=-%cpu "
            f"| head -n {int(limit)}"
        )
        result = await self._run(cmd)
        processes: list[RemoteProcess] = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 4)
            if len(parts) < 5:
                continue
            try:
                pid = int(parts[0])
            except ValueError:
                continue
            processes.append(
                RemoteProcess(
                    pid=pid,
                    name=parts[1],
                    cpu_percent=self._to_float(parts[2]),
                    memory_percent=self._to_float(parts[3]),
                    user=parts[4],
                    command=parts[1],
                )
            )
        return processes

    @staticmethod
    def _to_float(value: str) -> float | None:
        try:
            return float(value)
        except ValueError:
            return None


class FixtureRemoteClient(RemoteClient):
    """Replays stored responses. Used by tests — no SSH, no network."""

    def __init__(
        self,
        shell_result: ShellResult | None = None,
        files: list[RemoteFileInfo] | None = None,
        processes: list[RemoteProcess] | None = None,
        execute_shell_error: Exception | None = None,
        list_dir_error: Exception | None = None,
        get_processes_error: Exception | None = None,
    ):
        self._shell_result = shell_result or ShellResult(
            device_id="dev1",
            command="uptime",
            exit_code=0,
            stdout="up 5 days",
            stderr="",
            success=True,
        )
        self._files = list(files or [])
        self._processes = list(processes or [])
        self._execute_shell_error = execute_shell_error
        self._list_dir_error = list_dir_error
        self._get_processes_error = get_processes_error

    async def execute_shell(self, command: str, *, timeout_secs: int = 60) -> ShellResult:
        if self._execute_shell_error:
            raise self._execute_shell_error
        return ShellResult(
            device_id=self._shell_result.device_id,
            command=command,
            exit_code=self._shell_result.exit_code,
            stdout=self._shell_result.stdout,
            stderr=self._shell_result.stderr,
            success=self._shell_result.success,
        )

    async def list_dir(self, path: str) -> list[RemoteFileInfo]:
        if self._list_dir_error:
            raise self._list_dir_error
        return list(self._files)

    async def get_processes(self, limit: int = 50) -> list[RemoteProcess]:
        if self._get_processes_error:
            raise self._get_processes_error
        return list(self._processes)


__all__ = [
    "RemoteError",
    "ShellResult",
    "RemoteFileInfo",
    "RemoteProcess",
    "RemoteConfig",
    "RemoteClient",
    "RealRemoteClient",
    "FixtureRemoteClient",
]
