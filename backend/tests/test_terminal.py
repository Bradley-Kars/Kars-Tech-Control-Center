"""backend/tests/test_terminal.py — websocket PTY endpoint /ws/pty/{profile} (T1).

Fixture-only: no real network, no asyncssh, no real pty programs.  The stub
profile runs a small python echo process inside a real pty so the test
exercises genuine pty input/output.

Placeholder values only — no real hostnames, emails, or tokens.
"""

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.auth import TokenTable  # noqa: E402
from fleet.terminal import (  # noqa: E402
    TerminalConfig,
    TerminalProfile,
    create_router,
)

STUB_PROFILE = TerminalProfile(
    name="stub",
    argv=[
        "python3",
        "-u",
        "-c",
        "import sys;"
        "[sys.stdout.write(ch) or sys.stdout.flush()"
        " for ch in iter(lambda: sys.stdin.read(1), '')]",
    ],
)


class StubConfig(TerminalConfig):
    """Config that returns the stub echo profile only for name "stub"."""

    def get_profile(self, name: str) -> TerminalProfile | None:
        if name == "stub":
            return STUB_PROFILE
        return None


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    """App + write-scoped client token with the stub terminal config."""
    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("term-client", actor_id="term-actor", scope="read")
    app = FastAPI()
    app.include_router(create_router(table, StubConfig()))
    return TestClient(app, base_url="http://127.0.0.1"), secret


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestAuth:
    def test_no_token_rejected(self, app_client):
        client, _secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/pty/stub"):
                pass  # pragma: no cover - should not accept

    def test_bad_token_rejected(self, app_client):
        client, _secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/pty/stub?token=definitely-bad"):
                pass  # pragma: no cover - should not accept


# ---------------------------------------------------------------------------
# Profile resolution
# ---------------------------------------------------------------------------


class TestProfile:
    def test_unknown_profile_rejected(self, app_client):
        client, secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                f"/ws/pty/does-not-exist?token={secret}"
            ):
                pass  # pragma: no cover - should not accept


# ---------------------------------------------------------------------------
# Happy path: real pty input/output
# ---------------------------------------------------------------------------


class TestPtySession:
    def test_connect_and_echo(self, app_client):
        client, secret = app_client
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            # Send input to the pty; the stub echoes each character back.
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_resize_message(self, app_client):
        client, secret = app_client
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            # Resize should be accepted without error (no response frame).
            ws.send_json({"type": "resize", "cols": 80, "rows": 24})
            # Send input to prove the session is still alive after resize.
            ws.send_json({"type": "input", "data": "x"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "x" in msg["data"]

    def test_disconnect_closes_pty(self, app_client):
        client, secret = app_client
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            ws.send_json({"type": "input", "data": "bye"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "bye" in msg["data"]
        # Context manager exit closes the websocket; the child should be
        # cleaned up by the server (no error frames expected on next connect).
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws2:
            ws2.send_json({"type": "input", "data": "again"})
            msg = ws2.receive_json()
            assert msg["type"] == "output"
            assert "again" in msg["data"]


# ---------------------------------------------------------------------------
# Admin enforcement on /ws/pty (T2)
# ---------------------------------------------------------------------------


class TestAdmin:
    def _make_client(self, tmp_path, monkeypatch, admin_identities, token_label):
        """App with the stub terminal router; KTS_ADMINS_FILE points at a
        temp admins.json listing `admin_identities`. Mints a token with
        `token_label`. Returns (client, secret)."""
        table_dir = tmp_path / "auth"
        table = TokenTable(table_dir / "token-table.json")
        _, secret = table.mint(token_label, actor_id="term-actor", scope="read")
        admins_file = tmp_path / "admins.json"
        admins_file.write_text(json.dumps(admin_identities))
        monkeypatch.setenv("KTS_ADMINS_FILE", str(admins_file))
        app = FastAPI()
        app.include_router(create_router(table, StubConfig()))
        return TestClient(app, base_url="http://127.0.0.1"), secret

    def test_admin_token_accepted(self, tmp_path, monkeypatch):
        """Token whose label is in the admin list connects normally."""
        client, secret = self._make_client(
            tmp_path, monkeypatch, ["term-client"], "term-client"
        )
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_non_admin_token_rejected(self, tmp_path, monkeypatch):
        """Token whose label is NOT in the admin list is refused the
        websocket (close 4403) before the pty is ever started."""
        client, secret = self._make_client(
            tmp_path, monkeypatch, ["someone-else"], "term-client"
        )
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws/pty/stub?token={secret}"):
                pass  # pragma: no cover - should not accept

    def test_empty_admins_admits_all(self, tmp_path, monkeypatch):
        """Default (empty admins list): every authenticated token connects."""
        client, secret = self._make_client(tmp_path, monkeypatch, [], "term-client")
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_empty_token_rejected(self, app_client):
        """A present-but-empty token is a missing identity: refused."""
        client, _secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/pty/stub?token="):
                pass  # pragma: no cover - should not accept


# ---------------------------------------------------------------------------
# Origin validation (T3)
# ---------------------------------------------------------------------------


class TestOrigin:
    def test_bad_origin_rejected(self, app_client):
        """An Origin header whose host differs from the Host header is
        refused before the pty is started (CSRF-style protection)."""
        client, secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                f"/ws/pty/stub?token={secret}",
                headers={"Origin": "http://evil.example"},
            ):
                pass  # pragma: no cover - should not accept

    def test_no_origin_allowed(self, app_client):
        """No Origin header: the connection proceeds (non-browser clients)."""
        client, secret = app_client
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_matching_origin_allowed(self, app_client):
        """An Origin matching the Host header is accepted."""
        client, secret = app_client
        with client.websocket_connect(
            f"/ws/pty/stub?token={secret}",
            headers={"Origin": "http://testserver"},
        ) as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]


# ---------------------------------------------------------------------------
# Client-supplied argv rejection (T3)
# ---------------------------------------------------------------------------


class TestArgvRejection:
    def test_unknown_message_type_rejected(self, app_client):
        """Any message type other than input/resize closes the connection."""
        client, secret = app_client
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            ws.send_json({"type": "exec", "argv": ["/bin/sh", "-c", "id"]})
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()

    def test_argv_key_rejected(self, app_client):
        """A message carrying an argv key is rejected even with a known type."""
        client, secret = app_client
        with client.websocket_connect(f"/ws/pty/stub?token={secret}") as ws:
            ws.send_json(
                {"type": "input", "data": "hello", "argv": ["/bin/sh"]}
            )
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()

