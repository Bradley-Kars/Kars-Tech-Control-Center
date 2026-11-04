"""backend/tests/test_router_routes.py — route registration guards (R5).

Every route in backend/fleet/router.py must be registered exactly once per
(method, path): a duplicate registration silently shadows the first one,
so duplicates are a real bug, not boilerplate. Route names must also be
unique so url_path_for(name) resolves to a single route.

Walks mounted sub-routers in case the router ever mounts another.
Servers.json is never touched: the router is imported, not served.
"""

from __future__ import annotations

import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fastapi.routing import APIRoute, Mount

from fleet.router import router as fleet_router


def _walk(router, prefix=""):
    found = []
    for route in router.routes:
        # FastAPI wraps mounted routers in _IncludedRouter (original_router).
        sub_router = getattr(route, "original_router", None)
        if sub_router is not None:
            found += _walk(sub_router, prefix)
            continue
        if isinstance(route, Mount):
            found += _walk(route.app, prefix + (route.path or ""))
            continue
        if isinstance(route, APIRoute):
            for method in route.methods or set():
                found.append((method, prefix + route.path, route.name or route.path))
    return found


def _routes():
    return _walk(fleet_router)


def test_no_duplicate_routes() -> None:
    """No two routes share the same (method, path)."""
    rows = _routes()
    seen = Counter((method, path) for method, path, _ in rows)
    dupes = {key: count for key, count in seen.items() if count > 1}
    assert not dupes, (
        "duplicate (method, path) route registrations: "
        + ", ".join(
            f"{method} {path} x{count}" for (method, path), count in sorted(dupes.items())
        )
    )


def test_no_duplicate_route_names() -> None:
    """Route names are unique so url_path_for resolves to one route."""
    rows = _routes()
    names = Counter(name for _, _, name in rows)
    dupes = {name: count for name, count in names.items() if count > 1}
    assert not dupes, f"duplicate route names: {dupes}"
