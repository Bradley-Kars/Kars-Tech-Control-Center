"""Integration test for the bridge behind uvicorn --no-proxy-headers (W5.1).

Starts the real uvicorn server on a random loopback port with a sandbox
environment and the fixture users.yaml, then asserts:

  - valid login + X-Forwarded-For header -> 200  (with --no-proxy-headers the
    bridge must NOT rewrite request.client from X-Forwarded-For, so a loopback
    connection is still trusted)
  - unknown login -> 401
  - no credentials -> 401
"""
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import httpx
import pytest

FIXTURE_USERS = Path(__file__).resolve().parent / "fixtures" / "users.yaml"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_bridge(port: int) -> tuple[subprocess.Popen, Path]:
    sandbox = Path(tempfile.mkdtemp(prefix="kts-w5-"))
    home = sandbox / "home"
    vault = sandbox / "vault"
    (home / "config").mkdir(parents=True)
    vault.mkdir()
    shutil.copy2(FIXTURE_USERS, home / "config" / "users.yaml")
    env = dict(os.environ)
    env["KTS_SANDBOX"] = "1"
    env["KTS_VAULT"] = str(vault)
    env["KTS_HOME"] = str(home)
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
    return proc, sandbox


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


def test_no_proxy_headers_valid_login_plus_xff_200():
    port = _free_port()
    proc, sandbox = _start_bridge(port)
    try:
        _wait_for_server(port)
        with httpx.Client(timeout=5.0) as c:
            r = c.get(
                f"{_base_url(port)}/api/health",
                headers={
                    "Tailscale-User-Login": "user@example.com",
                    "X-Forwarded-For": "203.0.113.99",
                },
            )
            assert r.status_code == 200, r.text
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        shutil.rmtree(sandbox, ignore_errors=True)


def test_no_proxy_headers_unknown_login_401():
    port = _free_port()
    proc, sandbox = _start_bridge(port)
    try:
        _wait_for_server(port)
        with httpx.Client(timeout=5.0) as c:
            r = c.get(
                f"{_base_url(port)}/api/health",
                headers={"Tailscale-User-Login": "nobody@example.com"},
            )
            assert r.status_code == 401, r.text
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        shutil.rmtree(sandbox, ignore_errors=True)


def test_no_proxy_headers_no_credentials_401():
    port = _free_port()
    proc, sandbox = _start_bridge(port)
    try:
        _wait_for_server(port)
        with httpx.Client(timeout=5.0) as c:
            r = c.get(f"{_base_url(port)}/api/health")
            assert r.status_code == 401, r.text
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        shutil.rmtree(sandbox, ignore_errors=True)
