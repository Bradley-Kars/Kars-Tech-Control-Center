"""backend/fleet/docker.py — Docker containers over SSH (P3).

List, start, stop, restart and logs for Docker containers on a remote
server, executed over SSH via SshHelper. Mirrors the
``get_docker_containers`` / ``docker_*`` commands but speaks the Docker
CLI over SSH instead of Unraid's GraphQL API.

SshHelper is injected so tests patch ``run()`` — no asyncssh, no real
Docker daemon, no network.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .transport import SshHelper, SshCommandError, TransportError


class DockerError(TransportError):
    """Raised when a Docker command over SSH fails."""


@dataclass(frozen=True)
class DockerContainer:
    id: str
    name: str
    image: str
    status: str
    state: str
    auto_start: bool = False


class DockerClient:
    """Docker client backed by SSH.

    Commands run on the remote host:

    * list  - ``docker ps --format '{{json .}}'`` (one JSON object per line)
    * start - ``docker start <container>``
    * stop  - ``docker stop <container>``
    * restart - ``docker restart <container>``
    * logs  - ``docker logs --tail <n> <container>``
    """

    def __init__(self, helper: SshHelper) -> None:
        self.helper = helper

    async def list_containers(self) -> list[DockerContainer]:
        """List all containers (running and stopped)."""
        result = await self.helper.run("docker ps --format '{{json .}}'")
        containers: list[DockerContainer] = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                # Skip unparseable lines rather than failing the whole list.
                continue
            names = str(data.get("Names") or "")
            name = names.split(",")[0] if names else "unknown"
            state = str(data.get("State") or "").lower()
            containers.append(
                DockerContainer(
                    id=str(data.get("ID") or ""),
                    name=name,
                    image=str(data.get("Image") or ""),
                    status=str(data.get("Status") or ""),
                    state=state or "unknown",
                    auto_start=False,
                )
            )
        return containers

    async def start_container(self, container: str) -> str:
        await self.helper.run(f"docker start {container}")
        return f"Started {container}"

    async def stop_container(self, container: str) -> str:
        await self.helper.run(f"docker stop {container}")
        return f"Stopped {container}"

    async def restart_container(self, container: str) -> str:
        await self.helper.run(f"docker restart {container}")
        return f"Restarted {container}"

    async def container_logs(self, container: str, lines: int = 100) -> str:
        result = await self.helper.run(f"docker logs --tail {lines} {container}")
        output = result.stdout
        if result.stderr:
            output = (output + "\n" + result.stderr).strip() if output else result.stderr
        return output


__all__ = ["DockerClient", "DockerContainer", "DockerError"]
