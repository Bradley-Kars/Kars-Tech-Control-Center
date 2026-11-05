"""backend/core/admin.py tests — require_admin dependency (C3).

Admin identity sources (first wins):
  1. KTS_ADMIN_IDENTITIES env var — comma-separated identity list
  2. KTS_ADMINS_FILE -> admins.json (list or {"identities": [...]})
  3. backend/config/local.yaml key admin_identities (list)

Nothing configured -> empty list -> DENY ALL (C3 default-deny).
The real ~/.config/master-control/admins.json is never touched.

Fixture-only: temp files via KTS_ADMINS_FILE / KTS_ADMIN_CONFIG — no real
hostnames, emails, or tokens.
"""

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.admin import is_admin, load_admin_identities, require_admin  # noqa: E402


def _write(path: Path, data) -> Path:
    path.write_text(data if isinstance(data, str) else json.dumps(data))
    return path


# ---------------------------------------------------------------------------
# load_admin_identities
# ---------------------------------------------------------------------------


def test_load_admin_identities_from_env(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "alice, bob ,carol")
    assert load_admin_identities() == ["alice", "bob", "carol"]


def test_load_admin_identities_env_empty_denies_all(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "")
    assert load_admin_identities() == []


def test_load_admin_identities_env_wins_over_file(tmp_path, monkeypatch):
    admins = tmp_path / "admins.json"
    _write(admins, ["from-file"])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(admins))
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "from-env")
    assert load_admin_identities() == ["from-env"]


def test_load_admin_identities_from_admins_file(tmp_path, monkeypatch):
    admins = tmp_path / "admins.json"
    _write(admins, ["alice", "bob"])
    monkeypatch.setenv("KTS_ADMINS_FILE", str(admins))
    assert load_admin_identities() == ["alice", "bob"]


def test_load_admin_identities_from_admins_file_object(tmp_path, monkeypatch):
    admins = tmp_path / "admins.json"
    _write(admins, {"identities": ["alice"]})
    monkeypatch.setenv("KTS_ADMINS_FILE", str(admins))
    assert load_admin_identities() == ["alice"]


def test_load_admin_identities_from_local_yaml(tmp_path, monkeypatch):
    cfg = tmp_path / "local.yaml"
    cfg.write_text("admin_identities:\n  - alice\n  - bob\n")
    monkeypatch.setenv("KTS_ADMIN_CONFIG", str(cfg))
    assert load_admin_identities() == ["alice", "bob"]


def test_load_admin_identities_local_yaml_missing_key(tmp_path, monkeypatch):
    cfg = tmp_path / "local.yaml"
    cfg.write_text("other_section: true\n")
    monkeypatch.setenv("KTS_ADMIN_CONFIG", str(cfg))
    assert load_admin_identities() == []


def test_load_admin_identities_nothing_configured(tmp_path, monkeypatch):
    monkeypatch.delenv("KTS_ADMIN_IDENTITIES", raising=False)
    monkeypatch.delenv("KTS_ADMINS_FILE", raising=False)
    monkeypatch.delenv("KTS_ADMIN_CONFIG", raising=False)
    assert load_admin_identities() == []


# ---------------------------------------------------------------------------
# is_admin
# ---------------------------------------------------------------------------


def test_is_admin_none_denied(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "alice")
    assert is_admin(None) is False


def test_is_admin_nothing_configured_denies_everyone(tmp_path, monkeypatch):
    monkeypatch.delenv("KTS_ADMIN_IDENTITIES", raising=False)
    assert is_admin("whoever") is False


def test_is_admin_listed_only(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "alice,bob")
    assert is_admin("alice") is True
    assert is_admin("bob") is True
    assert is_admin("carol") is False


def test_is_admin_explicit_list_overrides_env(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "env-admin")
    assert is_admin("someone", ["someone"]) is True
    assert is_admin("env-admin", ["someone"]) is False


# ---------------------------------------------------------------------------
# require_admin (FastAPI dependency)
# ---------------------------------------------------------------------------


def _fake_request(actor_name):
    return SimpleNamespace(state=SimpleNamespace(actor_name=actor_name))


def test_require_admin_allows_admin(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "alice")
    assert require_admin(_fake_request("alice")) == "alice"


def test_require_admin_denies_non_admin(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "alice")
    with pytest.raises(Exception) as exc:
        require_admin(_fake_request("carol"))
    assert exc.value.status_code == 403


def test_require_admin_default_denies_all(tmp_path, monkeypatch):
    """C3 default-deny: no admin identities configured -> nobody admitted."""
    monkeypatch.delenv("KTS_ADMIN_IDENTITIES", raising=False)
    with pytest.raises(Exception) as exc:
        require_admin(_fake_request("whoever"))
    assert exc.value.status_code == 403


def test_require_admin_denies_none(tmp_path, monkeypatch):
    monkeypatch.setenv("KTS_ADMIN_IDENTITIES", "alice")
    with pytest.raises(Exception) as exc:
        require_admin(_fake_request(None))
    assert exc.value.status_code == 403
