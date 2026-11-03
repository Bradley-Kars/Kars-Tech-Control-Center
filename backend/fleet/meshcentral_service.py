"""backend/fleet/meshcentral_service.py — MeshCentral client for KTS fleet (P11).

Provides SSH-based meshctrl access to MeshCentral for device management,
telemetry, and remote operations. Uses `meshctrl runcommand` via SSH to the
Unraid server where the meshcentral container runs — this is the PRIMARY
transport for MeshCentral fleet ops.

Mirrors src-tauri/src/meshcentral/{mod.rs,transport.rs}: MeshCentralClient
(device list, device status, execute batch, terminal/file-manager URLs,
enrollment info, sync to servers.json, fleet stats) plus the SSH transport
foundation that P12 builds on for shell/file/process/reboot/shutdown/docker.

Fixture-only: tests never touch the real network or SSH.
"""

from __future__ import annotations

import abc
import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .config import ServerConfig
from .transport import SshHelper, SshCommandError, TransportError


class MeshCentralError(TransportError):
    """Raised when a MeshCentral operation fails."""


@dataclass
class MeshCentralConfig:
    """MeshCentral connection configuration (from server service_keys)."""

    server_url: str
    admin_user: str
    admin_pass: str
    group_id: str


@dataclass
class MeshDevice:
    """One MeshCentral device, parsed from `meshctrl ListDevices` output."""

    id: str
    name: str
    group: str
    conn: int          # 0=offline, 1=online, 2=connected
    pwr: int
    platform: str = ""
    ip: str = ""
    last_connect: str | None = None


@dataclass
class DeviceStatus:
    connected: bool
    cpu_usage: float | None = None
    memory_usage_pct: float | None = None
    uptime: str | None = None
    source: str = "meshcentral"


@dataclass
class BatchCommand:
    command: str
    args: list[str] | None = None


@dataclass
class BatchResult:
    device_id: str
    success: bool
    output: str
    error: str | None = None


@dataclass
class EnrollmentInfo:
    agent_url: str
    settings_url: str
    group_id: str
    install_command_linux: str
    install_command_windows: str


@dataclass
class SyncResult:
    devices_found: int
    devices_matched: int
    devices_new: int
    devices_updated: int
    errors: list[str] = field(default_factory=list)


class MeshCentralClient(abc.ABC):
    """Abstract MeshCentral client. Real implementation talks over SSH to
    the Unraid host where meshcentral runs; Fixture implementation replays
    stored responses for tests."""

    @abc.abstractmethod
    async def list_devices(self) -> list[MeshDevice]:
        ...

    @abc.abstractmethod
    async def get_device_status(self, device_id: str) -> DeviceStatus:
        ...

    @abc.abstractmethod
    async def execute_batch(
        self, device_ids: list[str], commands: list[BatchCommand]
    ) -> list[BatchResult]:
        ...

    @abc.abstractmethod
    def get_terminal_url(self, device_id: str) -> str:
        ...

    @abc.abstractmethod
    def get_file_manager_url(self, device_id: str) -> str:
        ...

    @abc.abstractmethod
    def get_enrollment_info(self, device_type: str) -> EnrollmentInfo:
        ...

    @abc.abstractmethod
    async def sync_to_servers_json(self, servers: list[ServerConfig]) -> SyncResult:
        ...

    @abc.abstractmethod
    async def get_fleet_stats(self) -> dict[str, Any]:
        ...


class RealMeshCentralClient(MeshCentralClient):
    """MeshCentral client backed by SSH meshctrl commands to the Unraid host.

    Every meshctrl invocation runs `docker exec meshcentral node ... meshctrl.js
    ...` over SSH to the Unraid server discovered from the fleet config.
    """

    def __init__(self, config: MeshCentralConfig, ssh: SshHelper):
        if not config.server_url or not config.server_url.strip():
            raise ValueError("meshcentral_url not configured")
        self.config = config
        self.ssh = ssh

    async def _meshctrl(self, subcommand: str, *, timeout: int = 60) -> str:
        """Run `meshctrl <subcommand>` over SSH to the Unraid host."""
        cmd = (
            "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js "
            f"--url wss://localhost:443/ --loginuser {self.config.admin_user} "
            f"--loginpass {self.config.admin_pass} {subcommand}"
        )
        result = await self.ssh.run(cmd, timeout=float(timeout))
        return result.stdout

    async def list_devices(self) -> list[MeshDevice]:
        output = await self._meshctrl("ListDevices", timeout=60)
        return _parse_meshctrl_list_devices(output)

    async def get_device_status(self, device_id: str) -> DeviceStatus:
        devices = await self.list_devices()
        device = next((d for d in devices if d.id == device_id), None)
        if device is None:
            raise MeshCentralError(f"Device {device_id} not found in MeshCentral")
        return DeviceStatus(
            connected=device.conn >= 1,
            source="meshcentral",
        )

    async def execute_batch(
        self, device_ids: list[str], commands: list[BatchCommand]
    ) -> list[BatchResult]:
        results: list[BatchResult] = []
        for device_id in device_ids:
            for cmd in commands:
                remote_cmd = cmd.command
                if cmd.args:
                    remote_cmd = f"{cmd.command} {' '.join(cmd.args)}"
                escaped = remote_cmd.replace("'", "'\\''")
                full_cmd = (
                    "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js "
                    f"--url wss://localhost:443/ --loginuser {self.config.admin_user} "
                    f"--loginpass {self.config.admin_pass} "
                    f"runcommand --id '{device_id}' --run '{escaped}' --reply"
                )
                try:
                    result = await self.ssh.run(full_cmd, timeout=float(60))
                    success = result.exit_code == 0
                    stderr = result.stderr.strip()
                    output = result.stdout.strip()
                    error = stderr if stderr else None
                except SshCommandError as exc:
                    success = False
                    output = ""
                    error = str(exc)
                results.append(
                    BatchResult(
                        device_id=device_id,
                        success=success,
                        output=output,
                        error=error,
                    )
                )
        return results

    def get_terminal_url(self, device_id: str) -> str:
        base = self.config.server_url.rstrip("/")
        return f"{base}/terminal?device={device_id}"

    def get_file_manager_url(self, device_id: str) -> str:
        base = self.config.server_url.rstrip("/")
        return f"{base}/filemanager?device={device_id}"

    def get_enrollment_info(self, device_type: str) -> EnrollmentInfo:
        group_id = self.config.group_id
        group_id_encoded = re.sub(r"[^A-Za-z0-9]", "", group_id)
        agent_id = (
            "6"
            if device_type in ("linux", "bazzite", "htpc", "laptop")
            else "4"
        )
        base = self.config.server_url.rstrip("/")
        agent_url = f"{base}/meshagents?id={agent_id}&meshid={group_id_encoded}"
        settings_url = f"{base}/meshsettings?id={group_id_encoded}"
        install_command_linux = (
            f"BASE={base}\n"
            f"D=/usr/local/mesh_services/meshagent\n"
            f'mkdir -p "$D"\n'
            f'curl -k -o "$D/meshagent" "$BASE/meshagents?id={agent_id}"\n'
            f'curl -k -o "$D/meshagent.msh" "$BASE/meshsettings?id={group_id_encoded}"\n'
            f"chmod 755 \"$D/meshagent\"\n"
            f"cat > /etc/systemd/system/meshagent.service <<'UNIT'\n"
            f"[Unit]\nDescription=MeshCentral Agent\n"
            f"[Service]\nType=simple\nExecStart=$D/meshagent/meshagent\n"
            f"[Install]\nWantedBy=multi-user.target\nUNIT\n"
            f"systemctl daemon-reload && systemctl enable --now meshagent"
        )
        install_command_windows = (
            f"$u = '{base}/meshagents?id={agent_id}&meshid={group_id_encoded}&installflags=1'\n"
            f"$exe = Join-Path $env:TEMP 'meshagent.exe'\n"
            f"curl.exe -k -sS -o $exe $u\n"
            f"$id = [Security.Principal.WindowsIdentity]::GetCurrent()\n"
            f"$elev = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)\n"
            f"if (-not $elev) {{ Write-Output 'NOT_ELEVATED'; exit 1 }}\n"
            f"$pr = Start-Process -FilePath $exe -ArgumentList '-fullinstall' -Wait -PassThru\n"
            f"Write-Output ('install_exit=' + $pr.ExitCode)\n"
            f"Start-Sleep -Seconds 6\n"
            f"(Get-Service 'Mesh Agent').Status"
        )
        return EnrollmentInfo(
            agent_url=agent_url,
            settings_url=settings_url,
            group_id=group_id,
            install_command_linux=install_command_linux,
            install_command_windows=install_command_windows,
        )

    async def sync_to_servers_json(self, servers: list[ServerConfig]) -> SyncResult:
        mc_devices = await self.list_devices()
        result = SyncResult(
            devices_found=len(mc_devices),
            devices_matched=0,
            devices_new=0,
            devices_updated=0,
            errors=[],
        )
        for mc_device in mc_devices:
            matched: ServerConfig | None = None
            for s in servers:
                if (
                    s.service_keys.tailscale_ip is not None
                    and s.service_keys.tailscale_ip == mc_device.ip
                ):
                    matched = s
                    break
                if _mc_name_matches_server(mc_device.name, s):
                    matched = s
                    break
            if matched is not None:
                result.devices_matched += 1
                updated = False
                if matched.meshcentral_device_id != mc_device.id:
                    matched.meshcentral_device_id = mc_device.id
                    updated = True
                new_status = {0: "offline", 1: "online", 2: "connected"}.get(
                    mc_device.conn, "unknown"
                )
                if matched.meshcentral_status != new_status:
                    matched.meshcentral_status = new_status
                    updated = True
                if (
                    matched.meshcentral_enrolled_at is None
                    and mc_device.conn >= 1
                ):
                    matched.meshcentral_enrolled_at = datetime.now(
                        timezone.utc
                    ).isoformat()
                    updated = True
                if updated:
                    result.devices_updated += 1
            else:
                result.devices_new += 1
                result.errors.append(
                    f"unmatched (no servers.json entry for '{mc_device.name}')"
                )
        return result

    async def get_fleet_stats(self) -> dict[str, Any]:
        devices = await self.list_devices()
        online = sum(1 for d in devices if d.conn >= 1)
        offline = sum(1 for d in devices if d.conn == 0)
        connected = sum(1 for d in devices if d.conn == 2)
        return {
            "devices_found": len(devices),
            "online": online,
            "offline": offline,
            "connected": connected,
            "source": "meshcentral",
        }


class FixtureMeshCentralClient(MeshCentralClient):
    """Replays stored responses. Used by tests — no SSH, no network."""

    def __init__(
        self,
        devices: list[MeshDevice] | None = None,
        device_status: DeviceStatus | None = None,
        batch_results: list[BatchResult] | None = None,
        enrollment_info: EnrollmentInfo | None = None,
        sync_result: SyncResult | None = None,
        fleet_stats: dict[str, Any] | None = None,
        list_devices_error: Exception | None = None,
    ):
        self._devices = devices or []
        self._device_status = (
            device_status or DeviceStatus(connected=False, source="meshcentral")
        )
        self._batch_results = batch_results or []
        self._enrollment_info = enrollment_info or EnrollmentInfo(
            agent_url="",
            settings_url="",
            group_id="",
            install_command_linux="",
            install_command_windows="",
        )
        self._sync_result = sync_result or SyncResult(0, 0, 0, 0, [])
        self._fleet_stats = fleet_stats or {}
        self._list_devices_error = list_devices_error

    async def list_devices(self) -> list[MeshDevice]:
        if self._list_devices_error:
            raise self._list_devices_error
        return list(self._devices)

    async def get_device_status(self, device_id: str) -> DeviceStatus:
        return self._device_status

    async def execute_batch(
        self, device_ids: list[str], commands: list[BatchCommand]
    ) -> list[BatchResult]:
        return list(self._batch_results)

    def get_terminal_url(self, device_id: str) -> str:
        return f"{device_id}-terminal"

    def get_file_manager_url(self, device_id: str) -> str:
        return f"{device_id}-filemanager"

    def get_enrollment_info(self, device_type: str) -> EnrollmentInfo:
        return self._enrollment_info

    async def sync_to_servers_json(self, servers: list[ServerConfig]) -> SyncResult:
        return self._sync_result

    async def get_fleet_stats(self) -> dict[str, Any]:
        return dict(self._fleet_stats)


def norm_fleet_key(s: str) -> str:
    """Normalize a fleet name for matching: lowercase, alphanumeric only."""
    return "".join(c.lower() for c in s if c.isascii() and c.isalnum())


def _mc_name_matches_server(mc_name: str, server: ServerConfig) -> bool:
    """True if a MeshCentral device name refers to this server.

    Checks normalized id / name / hostname (short and full) for equality,
    and containment for parenthetical aliases. Containment only applies
    at >= 4 normalized chars to avoid tiny false positives.
    """
    mc = norm_fleet_key(mc_name)
    if not mc:
        return False
    short_host = server.hostname.split(".")[0]
    keys = [
        norm_fleet_key(server.id),
        norm_fleet_key(server.name),
        norm_fleet_key(short_host),
        norm_fleet_key(server.hostname),
    ]
    for k in keys:
        if not k:
            continue
        if k == mc:
            return True
        if len(mc) >= 4 and len(k) >= 4 and (k in mc or mc in k):
            return True
    return False


def _parse_meshctrl_list_devices(output: str) -> list[MeshDevice]:
    """Parse `meshctrl ListDevices` output into MeshDevice records.

    Shape:
        Device group: "Home"
        id, name, icon, conn, pwr
        -------------------------
        "QZUw...", "HTPC", 1, 1, 1
    """
    devices: list[MeshDevice] = []
    group = ""
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("Device group:"):
            group = line.split(":", 1)[1].strip().strip('"')
            continue
        if not line or not line.startswith('"'):
            continue
        rest = line[1:]
        end = rest.find('"')
        if end is None:
            continue
        device_id = rest[:end]
        rest = rest[end + 1 :].lstrip()
        if not rest.startswith(','):
            continue
        rest = rest[1:].lstrip()
        if not rest.startswith('"'):
            continue
        rest = rest[1:]
        end = rest.find('"')
        if end is None:
            continue
        name = rest[:end]
        rest = rest[end + 1 :]
        nums: list[int] = []
        for part in rest.split(','):
            part = part.strip()
            try:
                nums.append(int(part))
            except ValueError:
                pass
        if len(nums) < 3:
            continue
        devices.append(
            MeshDevice(
                id=device_id,
                name=name,
                group=group,
                conn=nums[1],
                pwr=nums[2],
            )
        )
    if not devices:
        raise MeshCentralError(
            f"No devices parsed from meshctrl ListDevices output:\n{output}"
        )
    return devices
