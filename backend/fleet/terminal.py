"""backend/fleet/terminal.py — websocket PTY endpoint /ws/pty/{profile}.

Real pseudo-terminal backend for the web terminal (Phase 3).

Profiles come from config:
  - default profile "opencode" (argv ["opencode"], cwd configurable via
    KTS_TERM_OPencode_CWD, env inherited from the backend process)
  - "ssh:<server_id>" derived from servers.json — one profile per registered
    server, running ssh to that host's hostname.

Allowlisted argv only: the client never supplies the command to run.  The
profile is resolved server-side; an unknown profile is rejected with a close.

Supports:
  - client→server input messages (typed into the pty)
  - client→server resize messages (TIOCSWINSZ)
  - server→client output messages (pty output)
  - clean child cleanup (process killed, fds closed on disconnect)

Message protocol (JSON text frames):
  client → server:
    {"type": "input",  "data": "<string>"}   # typed into the pty
    {"type": "resize", "cols": <int>, "rows": <int>}
  server → client:
    {"type": "output", "data": "<string>"}   # pty output
    {"type": "exit",   "code": <int>}
    {"type": "error",  "message": "<string>"}

Auth: a valid X-API-Token (as ?token= query param) is required.  The token is
verified against the TokenTable; read scope is sufficient to connect.
"""

from __future__ import annotations

import asyncio
import fcntl
import os
import pty
import struct
import subprocess
import termios
from dataclasses import dataclass, field

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from starlette.websockets import WebSocketState

from core.admin import is_admin
from core.auth import TokenTable
from fleet.config import ServerConfig, load_servers


IDLE_TIMEOUT_SEC = 300  # seconds of inactivity before the websocket is closed
DEFAULT_PROFILE_NAME = "opencode"
DEFAULT_PROFILE_ARGV = ["opencode"]


@dataclass
class TerminalProfile:
    """One resolvable terminal profile."""

    name: str
    argv: list[str]
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)


class TerminalConfig:
    """Resolve terminal profiles.

    - "opencode" is the default profile (always available).
    - "ssh:<server_id>" is derived from servers.json (each server gets one).
    - Any other name is unknown.
    """

    def __init__(self) -> None:
        self._servers: dict[str, ServerConfig] = {}
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            for srv in load_servers():
                self._servers[srv.id] = srv
        except Exception:  # config unreadable -> no ssh profiles
            self._servers = {}

    def get_profile(self, name: str) -> TerminalProfile | None:
        """Resolve a profile by name, or None if unknown."""
        if name == DEFAULT_PROFILE_NAME:
            cwd = os.environ.get("KTS_TERM_OPencode_CWD") or None
            return TerminalProfile(
                name=DEFAULT_PROFILE_NAME,
                argv=list(DEFAULT_PROFILE_ARGV),
                cwd=cwd,
            )
        if name.startswith("ssh:"):
            self._load()
            server_id = name[len("ssh:"):]
            srv = self._servers.get(server_id)
            if srv is None:
                return None
            return TerminalProfile(
                name=name,
                argv=["ssh", srv.hostname],
            )
        return None


class PtySession:
    """One PTY-backed process attached to a single websocket connection."""

    def __init__(self, profile: TerminalProfile, websocket: WebSocket) -> None:
        self.profile = profile
        self.websocket = websocket
        self.master_fd: int | None = None
        self.proc: subprocess.Popen[str] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._reader_added = False
        self._closed = False

    # -- lifecycle -------------------------------------------------------

    async def start(self) -> None:
        """Fork a child process attached to a new pty pair."""
        master_fd, slave_fd = pty.openpty()
        try:
            env = dict(os.environ)
            env.update(self.profile.env)
            self.proc = subprocess.Popen(
                self.profile.argv,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                close_fds=True,
                cwd=self.profile.cwd,
                env=env,
                preexec_fn=os.setsid,
            )
        except Exception:
            os.close(slave_fd)
            os.close(master_fd)
            raise
        os.close(slave_fd)
        self.master_fd = master_fd
        self._loop = asyncio.get_event_loop()
        self._loop.add_reader(self.master_fd, self._on_readable)
        self._reader_added = True
        # Monitor process exit in the background.
        asyncio.create_task(self._monitor_exit())

    def _on_readable(self) -> None:
        """Called by the event loop when the pty master has data."""
        assert self.master_fd is not None
        try:
            data = os.read(self.master_fd, 4096)
        except OSError:
            # Pty gone (child exited).  Schedule close.
            asyncio.create_task(self._close(code=None))
            return
        if not data:
            # EOF on the master -> child exited.
            asyncio.create_task(self._close(code=None))
            return
        if self.websocket.application_state == WebSocketState.CONNECTED:
            asyncio.create_task(
                self.websocket.send_json(
                    {"type": "output", "data": data.decode(errors="replace")}
                )
            )

    async def _monitor_exit(self) -> None:
        """Wait for the child process, then report exit / schedule close."""
        if self.proc is None:
            return
        loop = self._loop or asyncio.get_event_loop()
        proc = self.proc  # capture reference; _close() may set self.proc = None
        await loop.run_in_executor(None, proc.wait)
        code = proc.returncode
        if not self._closed:
            await self._close(code=code)

    async def _close(self, code: int | None) -> None:
        if self._closed:
            return
        self._closed = True
        # Remove the reader first so no more callbacks fire.
        if self._loop is not None and self._reader_added and self.master_fd is not None:
            try:
                self._loop.remove_reader(self.master_fd)
            except (ValueError, OSError):
                pass
            self._reader_added = False
        # Close the master fd.
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None
        # Terminate the child process if still running.
        if self.proc is not None and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None
        # Tell the client the session ended (if the socket is still open).
        if self.websocket.application_state == WebSocketState.CONNECTED:
            if code is None:
                await self.websocket.send_json({"type": "error", "message": "pty closed"})
            else:
                await self.websocket.send_json({"type": "exit", "code": code})

    # -- client→server -----------------------------------------------------

    async def send_input(self, data: str) -> None:
        """Write bytes into the pty master (delivered to the child)."""
        if self.master_fd is None or self._closed:
            return
        try:
            os.write(self.master_fd, data.encode("utf-8", errors="replace"))
        except OSError:
            asyncio.create_task(self._close(code=None))

    async def resize(self, cols: int, rows: int) -> None:
        """Change the pty window size (TIOCSWINSZ)."""
        if self.master_fd is None or self._closed:
            return
        try:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
        except OSError:
            pass


# -- router ------------------------------------------------------------------

def create_router(
    token_table: TokenTable, terminal_config: TerminalConfig | None = None
) -> APIRouter:
    """Build the /ws/pty/{profile} router with the given auth table."""
    config = terminal_config or TerminalConfig()

    router = APIRouter()

    @router.websocket("/ws/pty/{profile_name}")
    async def pty_websocket(
        profile_name: str,
        websocket: WebSocket,
        token: str | None = Query(default=None),
    ) -> None:
        """WebSocket endpoint: real pty for the given profile.

        Auth via ?token= query param (websockets cannot easily send custom
        headers).  Unknown profile -> close 4401.  Bad/missing token -> close
        4403.
        """
        # Authenticate before accepting: an unauthenticated connection must
        # never be upgraded to an open websocket.  Then enforce admin:
        # every /ws/pty route requires an admin identity (T2).
        rec = token_table.verify(token)
        if rec is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if not is_admin(rec["label"]):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        profile = config.get_profile(profile_name)
        if profile is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await websocket.accept()

        session = PtySession(profile, websocket)
        try:
            await session.start()
        except Exception as exc:  # pty fork / exec failed
            await websocket.send_json(
                {"type": "error", "message": f"failed to start pty: {exc}"}
            )
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
            return

        try:
            while True:
                raw = await websocket.receive_json()
                if not isinstance(raw, dict):
                    continue
                msg_type = raw.get("type")
                if msg_type == "input":
                    data = raw.get("data")
                    if isinstance(data, str):
                        await session.send_input(data)
                elif msg_type == "resize":
                    cols = raw.get("cols")
                    rows = raw.get("rows")
                    if isinstance(cols, int) and isinstance(rows, int):
                        await session.resize(cols, rows)
        except WebSocketDisconnect:
            pass
        finally:
            await session._close(code=None)  # clean up child + fds

    return router


__all__ = [
    "TerminalConfig",
    "TerminalProfile",
    "PtySession",
    "create_router",
    "IDLE_TIMEOUT_SEC",
]
