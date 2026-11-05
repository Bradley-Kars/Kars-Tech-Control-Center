"""backend/tests/test_mcp_server.py

Pipe-driven tests for backend/mcp/server.py: a stdio MCP server (JSON-RPC 2.0,
newline-delimited, MCP protocol 2025-06-18, same framing as the deleted Rust
`cli` MCP server) that proxies the read-only tools from docs/mcp/TOOLS.md to the
web backend's /api/fleet routes over HTTP (KTS_API_URL + KTS_API_TOKEN).

The FastAPI app (create_app) runs for real on a free localhost port with a
temp servers.json and a token table; the MCP server is spawned as a subprocess
and driven over stdin/stdout pipes. No real network, no real servers.json, no
real ~/.ticketing or vault.

Placeholder values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import asyncio
import json
import os
import select
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import pytest
import uvicorn

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402

SERVER_PATH = Path(__file__).resolve().parent.parent / "mcp" / "server.py"

FIXTURE_SERVER = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "api_key": "sk-live-placeholder-key",
    "service_keys": {},
}

READ_ONLY_TOOLS = [
    "mc_list_servers",
    "mc_list_devices",
    "mc_fleet_stats",
    "mc_device_status",
    "mc_system_stats",
    "mc_alert_list",
    "mc_alert_get",
    "mc_adguard_status",
    "mc_docker_containers",
    "mc_array_info",
    "mc_prometheus_health",
    "mc_prometheus_query",
]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_port(port: int, timeout: float = 10.0) -> None:
    deadline = asyncio.get_event_loop().time() if False else __import__("time").time()
    while __import__("time").time() - deadline < timeout:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        __import__("time").sleep(0.05)
    raise TimeoutError(f"port {port} never accepted connections")


# ---------------------------------------------------------------------------
# backend fixture: real FastAPI app on a real port, fixture-only data
# ---------------------------------------------------------------------------

@pytest.fixture
def backend_endpoint(tmp_path, monkeypatch):
    """Start create_app() on a free port. Yields (base_url, read_secret).

    KTS_API_URL/KTS_API_TOKEN are injected into os.environ so the MCP server
    subprocess inherits them. KTS_ALERTS_DB is redirected to a temp file so the
    alert store never touches ~/.local/share/kts/fleet/alerts.db.
    """
    servers_file = tmp_path / "servers.json"
    monkeypatch.setenv("KTS_SERVERS_FILE", str(servers_file))
    monkeypatch.setenv("KTS_ALERTS_DB", str(tmp_path / "alerts.db"))

    table_dir = tmp_path / "auth"
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("mcp-client", actor_id="mcp-actor", scope="read")

    # Seed one fixture server so probe-style tools (system stats, array info)
    # exercise the client path instead of hitting "server not found" (404).
    # Matches the pattern in test_emhttp_routes.py / test_docker_route.py.
    import fleet.config  # noqa: F401 - ensures package imports in this process
    from fleet.config import ServerConfig, save_servers  # noqa: E402

    save_servers([ServerConfig(**FIXTURE_SERVER)], path=servers_file)

    app = create_app(table)

    port = free_port()
    holder: dict[str, object] = {}

    def _serve() -> None:
        asyncio.run(_serve_app(app, port, holder))

    thread = threading.Thread(target=_serve, daemon=True)
    thread.start()
    wait_for_port(port)

    monkeypatch.setenv("KTS_API_URL", f"http://127.0.0.1:{port}")
    monkeypatch.setenv("KTS_API_TOKEN", secret)

    yield f"http://127.0.0.1:{port}", secret

    # best-effort shutdown
    try:
        import requests

        requests.get(f"http://127.0.0.1:{port}/api/health", timeout=2)
    except Exception:
        pass
    server = holder.get("server")
    if server is not None:
        server.should_exit = True
    thread.join(timeout=5)


async def _serve_app(app, port: int, holder: dict) -> None:
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    holder["server"] = server
    await server.serve()


# ---------------------------------------------------------------------------
# MCP subprocess harness
# ---------------------------------------------------------------------------

class McpProc:
    """A spawned backend/mcp/server.py subprocess with JSON-RPC pipe helpers."""

    def __init__(self, env_overrides: dict[str, str] | None = None):
        env = dict(os.environ)
        if env_overrides:
            env.update(env_overrides)
        self.proc = subprocess.Popen(
            [sys.executable, str(SERVER_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

    def _read_response(self, timeout: float = 3.0) -> str | None:
        """Read one response line, returning None on silence (notification)."""
        assert self.proc.stdout is not None
        ready, _, _ = select.select([self.proc.stdout], [], [], timeout)
        if not ready:
            return None  # notification: the server must not respond
        line = self.proc.stdout.readline()
        return line if line else None

    def send(self, payload: dict | str) -> dict | None:
        """Send one JSON-RPC message and read one response line (if any).

        Notifications (no "id") get no response: returns None after a short
        silence instead of blocking forever.
        """
        text = payload if isinstance(payload, str) else json.dumps(payload)
        assert self.proc.stdin is not None
        self.proc.stdin.write(text + "\n")
        self.proc.stdin.flush()
        line = self._read_response()
        if not line:
            return None
        return json.loads(line)

    def close(self) -> None:
        if self.proc.stdin is not None:
            self.proc.stdin.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


def _rpc(method: str, params: dict | None = None, msg_id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params or {}}


def _content(response: dict) -> str:
    assert "result" in response, f"expected result, got {response}"
    result = response["result"]
    content = result["content"]
    assert isinstance(content, list) and content
    return content[0]["text"]


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------

class TestInitialize:
    def test_returns_protocol_and_capabilities(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send(_rpc("initialize"))
        assert resp["jsonrpc"] == "2.0"
        assert resp["id"] == 1
        result = resp["result"]
        assert result["protocolVersion"] == "2025-06-18"
        assert result["capabilities"] == {"tools": {}}
        assert result["serverInfo"]["name"] == "kts-master-control"
        assert result["serverInfo"]["version"] == "1.0.0"

    def test_initialized_notification_is_silent(self, backend_endpoint):
        with McpProc() as mcp:
            assert mcp.send({"jsonrpc": "2.0", "method": "initialized"}) is None
            # the server is still alive and answers normally afterwards
            resp = mcp.send(_rpc("tools/list"))
            assert "result" in resp


class TestToolsList:
    def test_lists_all_read_only_tools(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send(_rpc("tools/list"))
        tools = resp["result"]["tools"]
        names = {t["name"] for t in tools}
        for name in READ_ONLY_TOOLS:
            assert name in names, f"missing tool {name}"
        for t in tools:
            assert set(t) <= {"name", "description", "inputSchema"}
            assert isinstance(t["inputSchema"], dict)


class TestMcListServers:
    def test_returns_seeded_server_redacted(self, backend_endpoint, tmp_path, monkeypatch):
        # seed the temp servers.json that /api/fleet/servers reads
        import fleet.config  # noqa: F401
        from fleet.config import save_servers, ServerConfig

        servers_file = os.environ["KTS_SERVERS_FILE"]
        save_servers([ServerConfig(**FIXTURE_SERVER)], path=Path(servers_file))

        with McpProc() as mcp:
            resp = mcp.send(_rpc("tools/call", {"name": "mc_list_servers", "arguments": {}}))
        body = json.loads(_content(resp))
        assert body["count"] == 1
        server = body["servers"][0]
        assert server["id"] == "unraid-main"
        assert server["hostname"] == "<device>.<tailnet>.ts.net"
        auth = server.get("auth", {})
        assert auth.get("password") == "[REDACTED]"
        assert server.get("api_key") == "[REDACTED]"

    def test_invalid_token_yields_json_rpc_error(self, backend_endpoint):
        _url, _secret = backend_endpoint
        with McpProc(env_overrides={"KTS_API_TOKEN": "definitely-not-a-valid-token"}) as mcp:
            resp = mcp.send(_rpc("tools/call", {"name": "mc_list_servers", "arguments": {}}))
        assert "error" in resp
        assert resp["error"]["code"] == -32603
        content = resp["error"]["data"]
        assert "401" in content

    def test_missing_arguments_are_invalid_params(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send(_rpc("tools/call", {"name": "mc_list_devices", "arguments": {}}))
        assert resp["error"]["code"] == -32602

    def test_unknown_tool_is_invalid_params(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send(_rpc("tools/call", {"name": "mc_nope", "arguments": {}}))
        assert resp["error"]["code"] == -32602

    def test_unknown_server_returns_404(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send(
                _rpc("tools/call", {"name": "mc_array_info", "arguments": {"server_id": "no-such-server"}})
            )
        content = json.loads(_content(resp))
        assert content["status"] == 404

    def test_probe_failure_returns_502(self, backend_endpoint):
        # no SSH daemon is reachable from the test environment -> redacted 502
        with McpProc() as mcp:
            resp = mcp.send(
                _rpc(
                    "tools/call",
                    {"name": "mc_system_stats", "arguments": {"server_id": "unraid-main"}},
                )
            )
        content = json.loads(_content(resp))
        assert content["status"] == 502
        assert "SSH" in content["error"] or "probe" in content["error"]

    def test_malformed_input_yields_parse_error(self, backend_endpoint):
        with McpProc() as mcp:
            assert mcp.proc.stdin is not None
            mcp.proc.stdin.write("not json\n")
            mcp.proc.stdin.flush()
            assert mcp.proc.stdout is not None
            line = mcp.proc.stdout.readline()
        resp = json.loads(line)
        assert resp["error"]["code"] == -32700
        assert resp.get("id") is None

    def test_unknown_method_yields_method_not_found(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send({"jsonrpc": "2.0", "id": 7, "method": "doesNotExist", "params": {}})
        assert resp["error"]["code"] == -32601

    def test_alert_list_returns_array(self, backend_endpoint):
        with McpProc() as mcp:
            resp = mcp.send(_rpc("tools/call", {"name": "mc_alert_list", "arguments": {}}))
        body = json.loads(_content(resp))
        assert isinstance(body, list)
