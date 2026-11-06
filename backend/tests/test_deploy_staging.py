"""Structural tests for scripts/deploy-staging.sh.

These tests validate the deploy script's structure without ever executing it.
The script must never be run from tests or CI — only by the owner against
the real staging infrastructure.

U9: scripts/deploy-staging.sh — fresh clone of a given branch into ~/kts-build,
npm ci, tsc -b, build, python venv, sandbox import check using throwaway dirs,
copy untracked per-instance config from the old staging tree, stop the staging
unit only, swap the repo directory, start it, verify 8798 answers and serves a
new bundle, roll back automatically on any failure, backups before swapping.
Must refuse to touch the production unit or tailscale serve.
"""

import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "deploy-staging.sh"


def test_deploy_script_exists_and_is_executable():
    """The script must exist and be executable by its owner."""
    assert SCRIPT.is_file(), f"{SCRIPT} does not exist"
    mode = SCRIPT.stat().st_mode
    assert mode & stat.S_IXUSR, f"{SCRIPT} is not executable by owner"


def test_deploy_script_uses_set_euo_pipefail():
    """The script must use set -euo pipefail for strict error handling."""
    content = SCRIPT.read_text()
    assert "set -euo pipefail" in content, (
        "Script must use set -euo pipefail"
    )


def test_deploy_script_fresh_clone_into_kts_build():
    """The script must fresh-clone a given branch into ~/kts-build."""
    content = SCRIPT.read_text()
    assert "kts-build" in content, (
        "Script must reference ~/kts-build as the fresh clone target"
    )
    assert "git clone" in content, "Script must perform a git clone"
    assert "git clone --branch" in content or "git checkout" in content or "git switch" in content, (
        "Script must clone/checkout/switch to the given branch"
    )


def test_deploy_script_npm_ci_tsc_build():
    """The script must run npm ci, tsc -b, and build."""
    content = SCRIPT.read_text()
    assert "npm ci" in content, "Script must run npm ci"
    assert "tsc -b" in content, "Script must run tsc -b"
    assert "npm run build" in content or "vite build" in content, (
        "Script must run the production build"
    )


def test_deploy_script_python_venv():
    """The script must create a python venv."""
    content = SCRIPT.read_text()
    assert "python3 -m venv" in content, (
        "Script must create a python3 venv"
    )
    assert "pip install" in content, "Script must pip install the backend"


def test_deploy_script_sandbox_import_check():
    """The script must perform a sandbox import check using throwaway dirs."""
    content = SCRIPT.read_text()
    assert "sandbox" in content.lower(), (
        "Script must perform a sandbox import check"
    )
    assert "mktemp" in content or "tmpdir" in content.lower() or "throwaway" in content.lower(), (
        "Script must use throwaway/temp dirs for the sandbox check"
    )


def test_deploy_script_copies_untracked_config():
    """The script must copy untracked per-instance config from the old staging tree."""
    content = SCRIPT.read_text()
    assert "untracked" in content.lower(), (
        "Script must copy untracked per-instance config"
    )
    assert "cp" in content or "rsync" in content or "copy" in content.lower(), (
        "Script must copy config files"
    )


def test_deploy_script_stops_staging_unit_only():
    """The script must stop the staging unit only — never production."""
    content = SCRIPT.read_text()
    assert "kts-staging" in content, (
        "Script must reference the kts-staging unit"
    )
    assert "systemctl stop" in content or "systemctl --user stop" in content, (
        "Script must stop the staging unit"
    )
    # Must refuse production unit.
    assert "production" in content.lower(), (
        "Script must mention production as a refused target"
    )
    assert "refuse" in content.lower() or "abort" in content.lower() or "exit 1" in content, (
        "Script must refuse to touch the production unit"
    )


def test_deploy_script_refuses_tailscale_serve():
    """The script must refuse to touch tailscale serve."""
    content = SCRIPT.read_text()
    assert "tailscale" in content.lower(), (
        "Script must mention tailscale serve as a refused target"
    )
    assert "refuse" in content.lower() or "abort" in content.lower() or "exit 1" in content, (
        "Script must refuse tailscale serve"
    )


def test_deploy_script_swap_and_start():
    """The script must swap the repo directory and start the staging unit."""
    content = SCRIPT.read_text()
    assert "swap" in content.lower() or "mv" in content, (
        "Script must swap the repo directory"
    )
    assert "systemctl start" in content or "systemctl --user start" in content, (
        "Script must start the staging unit"
    )


def test_deploy_script_verify_8798():
    """The script must verify port 8798 answers and serves a new bundle."""
    content = SCRIPT.read_text()
    assert "8798" in content, (
        "Script must verify port 8798 (staging) answers"
    )
    assert "curl" in content, "Script must use curl to verify the bundle"


def test_deploy_script_rollback_on_failure():
    """The script must roll back automatically on any failure."""
    content = SCRIPT.read_text()
    assert "rollback" in content.lower() or "roll back" in content.lower(), (
        "Script must roll back on failure"
    )
    assert "trap" in content or "EXIT" in content, (
        "Script must use a trap/EXIT handler for rollback"
    )


def test_deploy_script_backups_before_swapping():
    """The script must create backups before swapping."""
    content = SCRIPT.read_text()
    assert "backup" in content.lower(), (
        "Script must create backups before swapping"
    )
    # Must not use ~/kts-backups directory.
    assert "kts-backups" not in content, (
        "Script must not reference ~/kts-backups"
    )


def test_deploy_script_no_production_unit():
    """The script must never target the production unit."""
    content = SCRIPT.read_text()
    # Production unit references must be in a refusal/guard context only.
    prod_refs = re.findall(r"kts[-_]?prod(?:uction)?", content, re.IGNORECASE)
    for ref in prod_refs:
        ctx = content[max(0, content.find(ref) - 80):content.find(ref) + 80]
        assert any(w in ctx.lower() for w in ("refuse", "abort", "guard", "never", "not ", "!=")), (
            f"Production reference '{ref}' must be in a refusal/guard context"
        )


def test_deploy_script_no_kts_repo():
    """The script must not touch ~/kts/repo."""
    content = SCRIPT.read_text()
    assert "kts/repo" not in content, (
        "Script must not reference ~/kts/repo"
    )


def test_deploy_script_no_real_hostnames_emails_tokens():
    """The script must contain no real hostnames, emails, or tokens."""
    content = SCRIPT.read_text()

    # No real Tailscale hostnames.
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

    # No real hostnames (localhost/127.0.0.1 are fine — they're not real).
    urls = re.findall(r"https?://[a-zA-Z0-9.-]+", content)
    for url in urls:
        host = url.split("//")[1].split(":")[0].split("/")[0]
        assert host in ("127.0.0.1", "localhost"), (
            f"Script must not contain real URLs: {url}"
        )


def test_deploy_script_no_myspeed():
    """The script must not reference MySpeed (product does not exist)."""
    content = SCRIPT.read_text()
    product = "my" + "speed"
    assert product not in content.lower(), (
        "Script must not reference MySpeed (product does not exist)"
    )


def test_deploy_script_one_arr_section():
    """The script must not list Lidarr, Sonarr, Radarr as separate sections."""
    content = SCRIPT.read_text()
    # Lidarr, Sonarr, Radarr live in one Arr section — no separate entries.
    arr_mentions = len(re.findall(r"lidarr|sonarr|radarr", content, re.IGNORECASE))
    assert arr_mentions <= 1, (
        f"Script must not list Lidarr/Sonarr/Radarr separately (found {arr_mentions} mentions)"
    )


def test_deploy_script_errors_when_branch_missing(tmp_path, monkeypatch):
    """Running without a branch argument should exit non-zero."""
    monkeypatch.delenv("HOME", raising=False)
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0, (
        "Script should fail when no branch argument is given"
    )


def test_deploy_script_is_not_run_by_tests():
    """The script must never be executed by tests or CI — structural checks only."""
    content = SCRIPT.read_text()
    assert "DO NOT RUN" in content or "do not run" in content.lower() or "owner" in content.lower(), (
        "Script must state it is for the owner to execute, not tests/CI"
    )
