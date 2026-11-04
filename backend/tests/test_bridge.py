"""Regression test for R2.

`def _adguard_client() -> RealAdGuardClient | None:` in
backend/core/bridge.py evaluated its annotation at def time, but
`RealAdGuardClient` was imported only inside the function body, so
`create_app()` raised NameError and the backend could not start.
(Introduced in commit b7fb349; fixed per R2.)

On Python >= 3.14 (PEP 649) annotations are deferred, so the symptom
is latent here: `create_app()` runs fine either way. The fix keeps
`create_app()` from raising NameError on Python < 3.14 by making every
annotation in bridge.py a lazy string, while the client factories keep
importing their clients lazily inside the function body at call time
(so the token-forwarding tests' patches keep working).
"""

from pathlib import Path

import core.bridge as bridge

from core.bridge import create_app


def test_create_app_builds_without_name_error():
    app = create_app()
    assert app is not None

    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/api/adguard/status" in paths
    assert "/api/nextcloud/status" in paths


def test_bridge_uses_deferred_annotations():
    # R2 fix: bridge.py carries `from __future__ import annotations`, so
    # `RealAdGuardClient | None` / `RealNextcloudClient | None` are never
    # evaluated at def time. On Python < 3.14 eager evaluation raised
    # NameError because the names were only imported inside the body.
    assert "from __future__ import annotations" in Path(bridge.__file__).read_text()
