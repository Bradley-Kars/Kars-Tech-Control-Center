"""B3 fail-closed middleware: a token with no actor_id is rejected (401) and audited.

In-process: uses the sandbox TokenTable (conftest locks KTS_* to the temp
sandbox before any test module imports core), never touches the real
~/.ticketing or ~/Documents/KTS Records.

Tests that exercise the Tailscale-User-Login header (W5.3) launch a real
uvicorn subprocess on loopback, because TestClient's client.host is
"testclient" and the login header is only trusted from 127.0.0.1.
"""
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from core.auth import TokenTable
from core.bridge import TAILSCALE_LOGIN_HEADER, _load_login_map, _resolve_api_identity, create_app


def _mint_no_actor(table: TokenTable) -> str:
    _token_id, secret = table.mint("no-actor-token", scope="write")  # no actor_id
    return secret


def _auth_fail_reasons(table: TokenTable):
    out = []
    if table.audit_path.exists():
        for line in table.audit_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            if rec.get("action") == "auth_fail":
                out.append(rec)
    return out


def _host_headers() -> dict:
    """TestClient defaults to host "testserver", which TrustedHostMiddleware
    (W5.3) rejects. Use loopback so the request reaches auth."""
    return {"Host": "127.0.0.1"}


def test_load_login_map_reads_users_yaml():
    mapping = _load_login_map()
    assert mapping == {
        "user@example.com": "USR-000001",
        "bridge.operator@example.com": "USR-000002",
    }


def test_resolve_api_identity_token_verified():
    table = TokenTable(Path(tempfile.mkdtemp()) / "token-table.json")
    _token_id, secret = table.mint("tok", scope="write", actor_id="USR-000001")
    actor_id, scope, token_id, label, actor_type, actor_name, error = _resolve_api_identity(
        secret, "", "127.0.0.1", table
    )
    assert error is None
    assert actor_id == "USR-000001"
    assert scope == "write"
    assert token_id is not None
    assert label == "tok"
    assert actor_type == "automation"
    assert actor_name == "tok"


def test_resolve_api_identity_tailscale_success_trusted_host():
    table = TokenTable(Path(tempfile.mkdtemp()) / "token-table.json")
    actor_id, scope, token_id, label, actor_type, actor_name, error = _resolve_api_identity(
        "", "user@example.com", "127.0.0.1", table
    )
    assert error is None
    assert actor_id == "USR-000001"
    assert scope == "write"
    assert token_id is None
    assert label == "tailscale:user@example.com"
    assert actor_type == "human"
    assert actor_name == "user@example.com"


def test_resolve_api_identity_tailscale_unknown_login():
    table = TokenTable(Path(tempfile.mkdtemp()) / "token-table.json")
    actor_id, scope, token_id, label, actor_type, actor_name, error = _resolve_api_identity(
        "", "nobody@example.com", "127.0.0.1", table
    )
    assert error == "unknown tailscale login"
    assert actor_id is None


def test_resolve_api_identity_tailscale_untrusted_host():
    table = TokenTable(Path(tempfile.mkdtemp()) / "token-table.json")
    # TestClient's client.host is "testclient", not 127.0.0.1, so a
    # Tailscale header from anywhere but loopback is rejected.
    actor_id, scope, token_id, label, actor_type, actor_name, error = _resolve_api_identity(
        "", "user@example.com", "testclient", table
    )
    assert error == "missing or invalid token"
    assert actor_id is None


def test_resolve_api_identity_no_credentials():
    table = TokenTable(Path(tempfile.mkdtemp()) / "token-table.json")
    actor_id, scope, token_id, label, actor_type, actor_name, error = _resolve_api_identity(
        "", "", "127.0.0.1", table
    )
    assert error == "missing or invalid token"
    assert actor_id is None


def test_resolve_api_identity_tailscale_mixed_case():
    table = TokenTable(Path(tempfile.mkdtemp()) / "token-table.json")
    # Login values and header values are lowercased/stripped on both sides.
    actor_id, scope, token_id, label, actor_type, actor_name, error = _resolve_api_identity(
        "", "  User@Example.COM ", "127.0.0.1", table
    )
    assert error is None
    assert actor_id == "USR-000001"
    assert actor_type == "human"


def test_token_without_actor_id_gets_401_and_is_audited(tmp_path: Path):
    table = TokenTable(tmp_path / "token-table.json")
    secret = _mint_no_actor(table)
    app = create_app(table)
    client = TestClient(app, raise_server_exceptions=False)

    r = client.get("/api/health", headers={"X-API-Token": secret, **_host_headers()})
    assert r.status_code == 401, r.text
    assert r.json() == {"detail": "token has no actor_id"}, r.text

    fails = _auth_fail_reasons(table)
    assert any(
        f.get("status") == 401
        and f.get("reason") == "token has no actor_id"
        and f.get("path") == "/api/health"
        and f.get("actor_id") is None
        for f in fails
    ), f"expected auth_fail audit for token-without-actor_id, got: {fails}"


def test_token_with_actor_id_passes(tmp_path: Path):
    table = TokenTable(tmp_path / "token-table.json")
    _token_id, secret = table.mint("with-actor", scope="write", actor_id="USR-000002")
    app = create_app(table)
    client = TestClient(app, raise_server_exceptions=False)

    r = client.get("/api/health", headers={"X-API-Token": secret, **_host_headers()})
    assert r.status_code == 200, r.text

    # no auth_fail recorded for this request
    fails = _auth_fail_reasons(table)
    assert not any(f.get("path") == "/api/health" for f in fails), fails


# --- W5.3 TrustedHostMiddleware + cross-site checks ------------------------


def test_forged_host_400(tmp_path: Path):
    table = TokenTable(tmp_path / "token-table.json")
    app = create_app(table)
    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/api/health", headers={"Host": "evil.com"})
    assert r.status_code == 400, r.text


def test_token_requests_unaffected_by_cross_site(tmp_path: Path):
    table = TokenTable(tmp_path / "token-table.json")
    _token_id, secret = table.mint("tok", scope="write", actor_id="USR-000002")
    app = create_app(table)
    client = TestClient(app, raise_server_exceptions=False)
    # A token request carries its own credentials; cross-site headers must not
    # block it (the login-header CSRF guard only applies to login-identified
    # requests).
    r = client.post(
        "/api/tickets",
        headers={
            "Host": "127.0.0.1",
            "X-API-Token": secret,
            "Sec-Fetch-Site": "cross-site",
            "Origin": "https://evil.com",
        },
        json={"title": "x"},
    )
    assert r.status_code == 200, r.text


# --- W5.3 login-header tests via a real uvicorn subprocess ----------------
# TestClient's client.host is "testclient", not 127.0.0.1, so the login header
# (trusted only from loopback) cannot be exercised through TestClient.


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_bridge(port: int) -> subprocess.Popen:
    env = dict(os.environ)  # inherits KTS_SANDBOX/KTS_VAULT/KTS_HOME from conftest
    proc = subprocess.Popen(
        [
            "uvicorn",
            "core.bridge:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--no-proxy-headers",
        ],
        cwd=str(Path(__file__).resolve().parent.parent),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return proc


def _wait_for_server(port: int, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with httpx.Client(timeout=1.0) as c:
                c.get(f"http://127.0.0.1:{port}/api/health")
            return
        except Exception:
            time.sleep(0.1)
    raise TimeoutError("bridge did not start")


def _base_url(port: int) -> str:
    return f"http://127.0.0.1:{port}"


def test_cross_site_post_with_login_403():
    port = _free_port()
    proc = _start_bridge(port)
    try:
        _wait_for_server(port)
        with httpx.Client(timeout=5.0) as c:
            r = c.post(
                f"{_base_url(port)}/api/tickets",
                headers={
                    "Host": "127.0.0.1",
                    "Tailscale-User-Login": "user@example.com",
                    "Sec-Fetch-Site": "cross-site",
                },
                json={"title": "x"},
            )
            assert r.status_code == 403, r.text
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_same_origin_post_with_login_ok():
    port = _free_port()
    proc = _start_bridge(port)
    try:
        _wait_for_server(port)
        with httpx.Client(timeout=5.0) as c:
            r = c.post(
                f"{_base_url(port)}/api/tickets",
                headers={
                    "Host": "127.0.0.1",
                    "Tailscale-User-Login": "user@example.com",
                },
                json={"title": "x"},
            )
            assert r.status_code == 200, r.text
    finally:
        proc.terminate()
        proc.wait(timeout=5)
