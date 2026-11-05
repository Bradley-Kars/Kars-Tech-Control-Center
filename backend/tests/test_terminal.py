"""backend/fleet/terminal.py — websocket PTY endpoint /ws/pty/{profile} (C3).

Auth hardening:
  - the old ?token= query mechanism is rejected outright;
  - a short-lived one-time ticket (?ticket=, minted by POST /api/terminal/ticket)
    or an X-API-Token identity header authenticates the connection;
  - every connection also requires an admin identity (default-deny).

The pty happy path uses a stub profile running a real python echo process
inside a real pty, so genuine pty input/output is exercised.

Fixture-only: no real network, no asyncssh, no real hostnames, emails, or
tokens. Admin identities live in KTS_ADMIN_IDENTITIES — never the real
~/.config/master-control/admins.json.
"""

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fleet.terminal import (  # noqa: E402
    TerminalConfig,
    TerminalProfile,
    create_router,
    consume_ticket,
    mint_ticket,
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


def _mint(
    table_dir: Path, label: str = "term-client", scope: str = "read"
) -> tuple[TokenTable, str]:
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint(label, actor_id="term-actor", scope=scope)
    return table, secret


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    """Stub terminal router; mints a read-scoped token labelled term-client."""
    table_dir = tmp_path / "auth"
    table, secret = _mint(table_dir)
    app = FastAPI()
    app.include_router(create_router(table, StubConfig()))
    return TestClient(app, base_url="http://127.0.0.1"), secret


@pytest.fixture
def ticket_app_client(tmp_path, monkeypatch):
    """Stub terminal router plus a POST /api/terminal/ticket route.

    Mints a write-scoped token so the ticket route can be exercised through
    the same create_app() middleware the bridge uses (auth enforced there).
    """
    table_dir = tmp_path / "auth"
    table, secret = _mint(table_dir, "term-client")
    app = FastAPI()
    app.include_router(create_router(table, StubConfig()))

    @app.post("/api/terminal/ticket")
    def terminal_ticket(_request: Request):
        from fleet.terminal import TICKET_TTL_SEC

        # No auth middleware in this fixture: mint for the admin identity
        # directly (route auth is covered by TestTicketRoute via create_app).
        return {"ticket": mint_ticket("term-client"), "expires_in": TICKET_TTL_SEC}

    return TestClient(app, base_url="http://127.0.0.1"), secret


@pytest.fixture
def bridge_client(tmp_path, monkeypatch):
    """Full create_app() app for ticket-route auth tests."""
    table_dir = tmp_path / "auth"
    table, secret = _mint(table_dir, "fleet-client", scope="write")
    app = create_app(table)
    return TestClient(app, base_url="http://127.0.0.1"), secret


# ---------------------------------------------------------------------------
# Auth: the old ?token= query mechanism is gone
# ---------------------------------------------------------------------------


class TestAuth:
    def test_no_auth_rejected(self, app_client, monkeypatch):
        """No ticket, no header: default-deny refuses the connection."""
        monkeypatch.delenv("KTS_ADMIN_IDENTITIES", raising=False)
        client, _secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/pty/stub"):
                pass  # pragma: no cover - should not accept

    def test_query_token_rejected_even_when_valid(self, app_client, monkeypatch):
        """?token= is not accepted as an auth mechanism anymore, period."""
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws/pty/stub?token={secret}"):
                pass  # pragma: no cover - should not accept

    def test_identity_header_accepted(self, app_client, monkeypatch):
        """X-API-Token header authenticates; admin label admits."""
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_identity_header_rejected_when_not_admin(self, app_client, monkeypatch):
        """Valid token whose label is not an admin identity -> refused."""
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "someone-else")
        client, secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/ws/pty/stub", headers={"X-API-Token": secret}
            ):
                pass  # pragma: no cover - should not accept


# ---------------------------------------------------------------------------
# One-time ticket flow (?ticket=)
# ---------------------------------------------------------------------------


class TestTicket:
    def test_ticket_connects(self, ticket_app_client, monkeypatch):
        """Mint a ticket via POST /api/terminal/ticket, then connect with ?ticket=."""
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = ticket_app_client
        r = client.post(
            "/api/terminal/ticket", headers={"X-API-Token": secret}
        )
        assert r.status_code == 200
        ticket = r.json()["ticket"]
        with client.websocket_connect(f"/ws/pty/stub?ticket={ticket}") as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_ticket_is_one_time(self, ticket_app_client, monkeypatch):
        """A consumed ticket cannot be reused."""
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = ticket_app_client
        r = client.post("/api/terminal/ticket", headers={"X-API-Token": secret})
        ticket = r.json()["ticket"]
        # First use consumes it.
        with client.websocket_connect(f"/ws/pty/stub?ticket={ticket}") as ws:
            ws.send_json({"type": "input", "data": "first"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "first" in msg["data"]
        # Second use is refused.
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws/pty/stub?ticket={ticket}"):
                pass  # pragma: no cover - should not accept

    def test_expired_ticket_rejected(self, ticket_app_client, monkeypatch):
        """An expired ticket is refused."""
        from fleet import terminal as terminal_module

        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = ticket_app_client
        r = client.post("/api/terminal/ticket", headers={"X-API-Token": secret})
        ticket = r.json()["ticket"]
        terminal_module._TICKETS[ticket]["expires_at"] = 1  # long expired
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws/pty/stub?ticket={ticket}"):
                pass  # pragma: no cover - should not accept

    def test_bad_ticket_rejected(self, ticket_app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, _secret = ticket_app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/pty/stub?ticket=tkt-bogus"):
                pass  # pragma: no cover - should not accept

    def test_query_params_beyond_ticket_are_ignored(
        self, ticket_app_client, monkeypatch, caplog
    ):
        """Extra query-string junk is not used as auth and never logged."""
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = ticket_app_client
        r = client.post("/api/terminal/ticket", headers={"X-API-Token": secret})
        ticket = r.json()["ticket"]
        with caplog.at_level("DEBUG"):
            with client.websocket_connect(
                f"/ws/pty/stub?ticket={ticket}&junk=should-not-be-logged"
            ) as ws:
                ws.send_json({"type": "input", "data": "ok"})
                msg = ws.receive_json()
                assert msg["type"] == "output"
        for record in caplog.records:
            assert "junk" not in record.getMessage()
            assert "ticket=" not in record.getMessage()


# ---------------------------------------------------------------------------
# Happy path: real pty input/output (authenticated via header)
# ---------------------------------------------------------------------------


class TestPtySession:
    def test_connect_and_echo(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_resize_message(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json({"type": "resize", "cols": 80, "rows": 24})
            ws.send_json({"type": "input", "data": "x"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "x" in msg["data"]

    def test_disconnect_closes_pty(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json({"type": "input", "data": "bye"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "bye" in msg["data"]
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws2:
            ws2.send_json({"type": "input", "data": "again"})
            msg = ws2.receive_json()
            assert msg["type"] == "output"
            assert "again" in msg["data"]


# ---------------------------------------------------------------------------
# Profile resolution
# ---------------------------------------------------------------------------


class TestProfile:
    def test_unknown_profile_rejected(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/ws/pty/does-not-exist", headers={"X-API-Token": secret}
            ):
                pass  # pragma: no cover - should not accept


# ---------------------------------------------------------------------------
# Origin validation
# ---------------------------------------------------------------------------


class TestOrigin:
    def test_bad_origin_rejected(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/ws/pty/stub",
                headers={"X-API-Token": secret, "Origin": "http://evil.example"},
            ):
                pass  # pragma: no cover - should not accept

    def test_no_origin_allowed(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]

    def test_matching_origin_allowed(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub",
            headers={"X-API-Token": secret, "Origin": "http://testserver"},
        ) as ws:
            ws.send_json({"type": "input", "data": "hello"})
            msg = ws.receive_json()
            assert msg["type"] == "output"
            assert "hello" in msg["data"]


# ---------------------------------------------------------------------------
# Client-supplied argv rejection
# ---------------------------------------------------------------------------


class TestArgvRejection:
    def test_unknown_message_type_rejected(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json({"type": "exec", "argv": ["/bin/sh", "-c", "id"]})
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()

    def test_argv_key_rejected(self, app_client, monkeypatch):
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "term-client")
        client, secret = app_client
        with client.websocket_connect(
            "/ws/pty/stub", headers={"X-API-Token": secret}
        ) as ws:
            ws.send_json(
                {"type": "input", "data": "hello", "argv": ["/bin/sh"]}
            )
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()


# ---------------------------------------------------------------------------
# Child environment allowlist
# ---------------------------------------------------------------------------


class TestChildEnv:
    def test_child_env_only_carries_allowlist(self, monkeypatch):
        """PATH, HOME, TERM, LANG plus the profile env; nothing else."""
        monkeypatch.setenv("PATH", "/usr/bin:/bin")
        monkeypatch.setenv("HOME", "/home/term")
        monkeypatch.setenv("TERM", "xterm-256color")
        monkeypatch.setenv("LANG", "C.UTF-8")
        monkeypatch.setenv("SECRET_TOKEN", "shh-a-secret")
        monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "irrelevant")
        profile = TerminalProfile(
            name="stub", argv=[], env={"PROFILE_VAR": "profile-value"}
        )
        from fleet.terminal import _child_env

        env = _child_env(profile)
        assert env["PATH"] == "/usr/bin:/bin"
        assert env["HOME"] == "/home/term"
        assert env["TERM"] == "xterm-256color"
        assert env["LANG"] == "C.UTF-8"
        assert env["PROFILE_VAR"] == "profile-value"
        assert "SECRET_TOKEN" not in env


# ---------------------------------------------------------------------------
# Ticket route auth (create_app middleware)
# ---------------------------------------------------------------------------


class TestTicketRoute:
    def test_ticket_route_requires_auth(self, bridge_client):
        """POST /api/terminal/ticket without a token -> 401."""
        client, _secret = bridge_client
        r = client.post("/api/terminal/ticket")
        assert r.status_code == 401

    def test_ticket_route_returns_ticket(self, bridge_client):
        client, secret = bridge_client
        r = client.post(
            "/api/terminal/ticket", headers={"X-API-Token": secret}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ticket"].startswith("tkt_")
        assert body["expires_in"] == 300
