"""backend/core/admin.py — admin identity enforcement (T2).

Until logins exist, admits the identities listed in config
(default: every authenticated tailnet identity).

Config: ~/.config/master-control/admins.json (overridable via KTS_ADMINS_FILE)
  - a JSON list of identity strings (token labels or tailscale logins), or
  - an object {"identities": [...]}

An empty or missing list means every authenticated identity is admitted —
the "all tailnet identities" default until logins exist.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, Request, status


def get_admins_path() -> Path:
    """Resolve the admins config path from KTS_ADMINS_FILE or the default."""
    env = os.environ.get("KTS_ADMINS_FILE")
    if env:
        return Path(env)
    return Path.home() / ".config" / "master-control" / "admins.json"


def load_admin_identities(path: Optional[Path] = None) -> list[str]:
    """Return the list of configured admin identities.

    Missing/unreadable file -> empty list (everyone admitted).
    """
    if path is None:
        path = get_admins_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if isinstance(data, list):
        return [str(x) for x in data]
    if isinstance(data, dict) and isinstance(data.get("identities"), list):
        return [str(x) for x in data["identities"]]
    return []


def is_admin(
    identity: Optional[str], admin_identities: Optional[list[str]] = None
) -> bool:
    """True if `identity` is an admin.

    With no configured identities (default), every authenticated identity
    is admitted — the "all tailnet identities" default until logins exist.
    """
    if identity is None:
        return False
    if admin_identities is None:
        admin_identities = load_admin_identities()
    if not admin_identities:
        return True
    return identity in admin_identities


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
    "load_admin_identities",
    "is_admin",
    "require_admin",
]
