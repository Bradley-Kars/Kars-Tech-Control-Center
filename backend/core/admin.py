"""backend/core/admin.py — admin identity enforcement (C3).

Until logins exist, admits ONLY the identities listed in config, in this
order (first wins):

  1. KTS_ADMIN_IDENTITIES env var — comma-separated identity list
     (present-but-empty is an explicit empty list -> deny all).
  2. KTS_ADMINS_FILE -> admins.json — a JSON list of identity strings, or
     an object {"identities": [...]}.
  3. admin_identities key in backend/config/local.yaml.

Nothing configured -> empty list -> DENY ALL.  The old "every authenticated
tailnet identity is an admin" default is gone: C3 is default-deny.

The real ~/.config/master-control/admins.json is never read by tests —
they point KTS_ADMINS_FILE / KTS_ADMIN_CONFIG at temp files.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import yaml

from fastapi import HTTPException, Request, status


def get_admins_path() -> Path:
    """Resolve the admins config path from KTS_ADMINS_FILE or the default."""
    env = os.environ.get("KTS_ADMINS_FILE")
    if env:
        return Path(env)
    return Path.home() / ".config" / "master-control" / "admins.json"


def get_admin_config_path() -> Path:
    """Resolve the local.yaml path from KTS_ADMIN_CONFIG or the default."""
    env = os.environ.get("KTS_ADMIN_CONFIG")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent / "config" / "local.yaml"


def _env_admin_identities() -> Optional[list[str]]:
    env = os.environ.get("KTS_ADMIN_IDENTITIES")
    if env is None:
        return None
    return [ident.strip() for ident in env.split(",") if ident.strip()]


def _yaml_admin_identities(path: Path) -> list[str]:
    if not path.exists():
        return []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return []
    if not isinstance(data, dict):
        return []
    identities = data.get("admin_identities")
    if not isinstance(identities, list):
        return []
    return [str(x) for x in identities]


def load_admin_identities(path: Optional[Path] = None) -> list[str]:
    """Return the list of configured admin identities.

    Sources, first wins:
      1. KTS_ADMIN_IDENTITIES env var (comma-separated).
      2. KTS_ADMINS_FILE -> admins.json.
      3. backend/config/local.yaml key admin_identities.

    Nothing configured -> empty list -> every authenticated identity is
    denied (C3 default-deny).
    """
    env_identities = _env_admin_identities()
    if env_identities is not None:
        return env_identities
    if path is None:
        path = get_admins_path()
    if not path.exists():
        return _yaml_admin_identities(get_admin_config_path())
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _yaml_admin_identities(get_admin_config_path())
    if isinstance(data, list):
        return [str(x) for x in data]
    if isinstance(data, dict) and isinstance(data.get("identities"), list):
        return [str(x) for x in data["identities"]]
    return _yaml_admin_identities(get_admin_config_path())


def is_admin(
    identity: Optional[str], admin_identities: Optional[list[str]] = None
) -> bool:
    """True if `identity` is an admin.

    C3 default-deny: with no configured identities, nobody is admitted —
    the old "all authenticated identities" default is gone.
    """
    if identity is None:
        return False
    if admin_identities is None:
        admin_identities = load_admin_identities()
    return bool(admin_identities) and identity in admin_identities


def _request_identity(request: Request) -> Optional[str]:
    """Best-effort identity string for the current request.

    Prefers actor_name (token label or tailscale login), falls back to label.
    """
    return getattr(request.state, "actor_name", None) or getattr(
        request.state, "label", None
    )


def require_admin(request: Request) -> str:
    """FastAPI dependency: admit only admin identities.

    Returns the identity string on success; raises HTTPException 403 when
    the identity is not admin.
    """
    identity = _request_identity(request)
    if not is_admin(identity):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin required",
        )
    return identity


__all__ = [
    "get_admins_path",
    "get_admin_config_path",
    "load_admin_identities",
    "is_admin",
    "require_admin",
]
