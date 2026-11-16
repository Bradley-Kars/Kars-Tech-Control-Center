"""CRUD operations for Hermes sidecar endpoints (WS-2.17).

Sidecar spawns/communicates with `hermes serve` child process via stdio IPC.
Without real sidecar integration, endpoints return structured placeholder
responses. Active sidecar state is tracked in memory.
"""

import asyncio
import uuid
from typing import Any, Optional

from app.schemas.opencode import ChatMessage, OpencodeStatus


class _SidecarState:
    def __init__(self):
        self.running = False
        self.port: Optional[int] = None
        self.pid: Optional[int] = None
        self.process: Optional[asyncio.subprocess.Process] = None
        self.sessions: dict[str, list[ChatMessage]] = {}


_sidecar = _SidecarState()


async def opencode_start() -> OpencodeStatus:
    if _sidecar.running:
        return OpencodeStatus(running=True, port=_sidecar.port, pid=_sidecar.pid)
    _sidecar.running = True
    _sidecar.port = 8798
    _sidecar.pid = 0  # placeholder; real impl spawns child process
    return OpencodeStatus(running=True, port=_sidecar.port, pid=_sidecar.pid)


async def opencode_stop() -> OpencodeStatus:
    _sidecar.running = False
    _sidecar.port = None
    _sidecar.pid = None
    _sidecar.process = None
    return OpencodeStatus(running=False, port=None, pid=None)


async def opencode_status() -> OpencodeStatus:
    return OpencodeStatus(
        running=_sidecar.running, port=_sidecar.port, pid=_sidecar.pid
    )


async def opencode_new_session(title: Optional[str] = None) -> str:
    session_id = f"sess-{uuid.uuid4().hex[:8]}"
    _sidecar.sessions[session_id] = []
    return session_id


async def opencode_send_message(
    session_id: str, message: str, agent: Optional[str] = None
) -> list[ChatMessage]:
    session = _sidecar.sessions.get(session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")
    session.append(ChatMessage(role="user", text=message))
    session.append(ChatMessage(role="assistant", text=f"echo: {message}"))
    return list(session)


async def opencode_get_history(session_id: str) -> list[ChatMessage]:
    session = _sidecar.sessions.get(session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")
    return list(session)


async def opencode_abort(session_id: str) -> bool:
    session = _sidecar.sessions.get(session_id)
    if session is None:
        return False
    _sidecar.sessions.pop(session_id, None)
    return True
