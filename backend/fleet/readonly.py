"""Fleet read-only mode (U8).

``KTS_FLEET_READONLY=1`` puts every fleet write route behind a 403 with
detail "fleet is read-only on this instance". When ``KTS_FLEET_READONLY``
is unset, read-only defaults ON if ``KTS_SANDBOX=1``; an explicit
``KTS_FLEET_READONLY=0`` always wins over the sandbox default.

The check is evaluated at request time (not import time) so tests can flip
the env var with monkeypatch per test.
"""

from __future__ import annotations

import os

from fastapi import HTTPException

READONLY_DETAIL = "fleet is read-only on this instance"


def is_fleet_readonly() -> bool:
    """Whether fleet write routes are blocked right now."""
    explicit = os.environ.get("KTS_FLEET_READONLY")
    if explicit is not None:
        return explicit == "1"
    return os.environ.get("KTS_SANDBOX") == "1"


def require_fleet_write() -> None:
    """FastAPI dependency: raise 403 when the fleet is read-only."""
    if is_fleet_readonly():
        raise HTTPException(status_code=403, detail=READONLY_DETAIL)
