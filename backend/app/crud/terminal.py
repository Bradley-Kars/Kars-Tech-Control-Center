"""CRUD operations for Terminal streaming endpoints (WS-2.16).

Terminal sessions are PTY-backed shell sessions proxied via SSE.
Without real PTY transport, endpoints return structured placeholder responses.
Active sessions are tracked in memory for the stream endpoint.
"""

import asyncio
from typing import Any, Optional


class TerminalSession:
    def __init__(self, session_id: str, cols: int, rows: int):
        self.session_id = session_id
        self.cols = cols
        self.rows = rows
        self.queue: asyncio.Queue[Optional[dict[str, Any]]] = asyncio.Queue()
        self.closed = False
        self.exit_status: Optional[int] = None

    async def push(self, chunk: dict[str, Any]) -> None:
        await self.queue.put(chunk)

    async def close(self, exit_status: Optional[int] = None) -> None:
        self.closed = True
        self.exit_status = exit_status
        await self.queue.put(None)  # sentinel


_terminal_sessions: dict[str, TerminalSession] = {}


async def terminal_open(session_id: str, cols: int, rows: int) -> TerminalSession:
    session = TerminalSession(session_id, cols, rows)
    _terminal_sessions[session_id] = session
    return session


async def terminal_get(session_id: str) -> Optional[TerminalSession]:
    return _terminal_sessions.get(session_id)


async def terminal_write(session_id: str, data: str) -> None:
    session = await terminal_get(session_id)
    if session and not session.closed:
        await session.push({"data": data, "closed": False})


async def terminal_resize(session_id: str, cols: int, rows: int) -> None:
    session = await terminal_get(session_id)
    if session:
        session.cols = cols
        session.rows = rows


async def terminal_close(session_id: str) -> None:
    session = await terminal_get(session_id)
    if session:
        await session.close()
        _terminal_sessions.pop(session_id, None)
