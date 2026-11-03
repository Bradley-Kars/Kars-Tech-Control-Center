"""backend/core/admin.py tests — require_admin dependency (T2).

Fixture-only: admin identities live in a temp file via KTS_ADMINS_FILE — the
real ~/.config/master-control/admins.json is never touched.

Placeholder values only — no real hostnames, emails, or tokens.
"""

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.admin import is_admin, load_admin_identities, require_admin  # noqa: E402


def _write_admins(tmp_path, identities):
    p = tmp_path / "admins.json"
    p.write_text(json.dumps(identities))
    return p


# ---------------------------------------------------------------------------
# load_admin_identities
# ---------------------------------------------------------------------------


def test_load_admin_identities_missing_file(tmp_path, monkeypatch):
    missing = tmp_path / "does-not-exist.json"
    monkeypatch.setenv("KTS_ADMINS_FILE", str(missing))
    assert load_admin_identities() == []


def test_load_admin_identities_list_format(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, ["alice", "bob"])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert load_admin_identities() == ["alice", "bob"]


def test_load_admin_identities_object_format(tmp_path, monkeypatch):
    p = tmp_path / "admins.json"
    p.write_text(json.dumps({"identities": ["alice", "bob"]}))
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert load_admin_identities() == ["alice", "bob"]


def test_load_admin_identities_malformed(tmp_path, monkeypatch):
    p = tmp_path / "admins.json"
    p.write_text("not json {")
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert load_admin_identities() == []


# ---------------------------------------------------------------------------
# is_admin
# ---------------------------------------------------------------------------


def test_empty_config_admits_any_identity(tmp_path, monkeypatch):
    """Default (no admins configured): every authenticated identity is admin."""
    p = _write_admins(tmp_path, [])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert is_admin("anyone-at-all") is True
    assert is_admin("fleet-client") is True


def test_none_identity_denied(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, [])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert is_admin(None) is False


def test_listed_identities_only(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, ["alice", "bob"])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert is_admin("alice") is True
    assert is_admin("bob") is True
    assert is_admin("carol") is False


def test_injected_path(tmp_path):
    """load_admin_identities accepts an explicit path (no env var needed)."""
    p = _write_admins(tmp_path, ["injected"])
    assert load_admin_identities(path=p) == ["injected"]


# ---------------------------------------------------------------------------
# require_admin (FastAPI dependency)
# ---------------------------------------------------------------------------


def _fake_request(actor_name):
    return SimpleNamespace(state=SimpleNamespace(actor_name=actor_name))


def test_require_admin_allows_admin(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, ["alice"])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert require_admin(_fake_request("alice")) == "alice"


def test_require_admin_denies_non_admin(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, ["alice"])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    with pytest.raises(Exception) as exc:
        require_admin(_fake_request("carol"))
    assert exc.value.status_code == 403


def test_require_admin_default_admits_all(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, [])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    assert require_admin(_fake_request("whoever")) == "whoever"


def test_require_admin_denies_none(tmp_path, monkeypatch):
    p = _write_admins(tmp_path, [])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(p))
    with pytest.raises(Exception) as exc:
        require_admin(_fake_request(None))
    assert exc.value.status_code == 403
