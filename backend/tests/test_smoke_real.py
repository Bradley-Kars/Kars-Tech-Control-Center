"""Structural tests for scripts/smoke-real.sh.

These tests validate the script's structure without ever executing it against
real servers. The script itself must never be run from tests or CI — only by
the owner against real infrastructure.
"""

import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke-real.sh"


def test_smoke_script_exists_and_is_executable():
    """The script must exist and be executable by its owner."""
    assert SCRIPT.is_file(), f"{SCRIPT} does not exist"
    mode = SCRIPT.stat().st_mode
    assert mode & stat.S_IXUSR, f"{SCRIPT} is not executable by owner"


def test_smoke_script_only_get_requests():
    """The script must use GET requests only — no POST/PUT/DELETE/PATCH."""
    content = SCRIPT.read_text()

    # Find all curl invocations and check for write methods or write flags.
    curl_calls = re.findall(r"curl[^;]*", content)
    assert curl_calls, "Script should contain at least one curl invocation"

    for call in curl_calls:
        for method in ("POST", "PUT", "DELETE", "PATCH"):
            assert f"-X {method}" not in call, (
                f"Write method {method} found in curl call: {call}"
            )
        for flag in ("--data", " -d ", "--form", " -F "):
            assert flag not in call, (
                f"Write flag {flag!r} found in curl call: {call}"
            )


def test_smoke_script_reads_servers_json():
    """The script must read from ~/.config/master-control/servers.json."""
    content = SCRIPT.read_text()
    assert "servers.json" in content, "Script must reference servers.json"
    assert "master-control" in content, (
        "Script must reference the master-control config directory"
    )


def test_smoke_script_has_table_output():
    """The script must print a pass/fail table with SERVER, ENDPOINT, STATUS."""
    content = SCRIPT.read_text()
    assert "SERVER" in content, "Script table must have a SERVER column"
    assert "ENDPOINT" in content, "Script table must have an ENDPOINT column"
    assert "STATUS" in content, "Script table must have a STATUS column"


def test_smoke_script_errors_when_servers_json_missing(tmp_path, monkeypatch):
    """Running without servers.json should exit non-zero with an error message."""
    empty_home = tmp_path / "home"
    empty_home.mkdir()
    monkeypatch.setenv("HOME", str(empty_home))

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0, (
        "Script should fail when servers.json is missing"
    )
    combined = result.stdout + result.stderr
    assert "not found" in combined.lower(), (
        "Script should report missing servers.json"
    )


def test_smoke_script_is_read_only_no_secrets():
    """The script must contain no real hostnames, emails, or tokens."""
    content = SCRIPT.read_text()

    # No real Tailscale hostnames in the script itself.
    assert ".ts.net" not in content.lower(), (
        "Script must not contain real .ts.net hostnames"
    )

    # No email addresses.
    assert re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", content) is None, (
        "Script must not contain email addresses"
    )

    # No token-like strings (40+ hex chars).
    assert re.search(r"[0-9a-fA-F]{40,}", content) is None, (
        "Script must not contain token-like strings"
    )

    # It uses os.path.expanduser to read servers.json — no inline credentials.
    assert "expanduser" in content or "$HOME" in content, (
        "Script must reference servers.json via HOME expansion, not inline paths"
    )
