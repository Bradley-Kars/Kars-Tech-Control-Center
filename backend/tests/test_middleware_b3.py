"""B3 fail-closed middleware: a token with no actor_id is rejected (401) and audited.

In-process: uses the sandbox TokenTable (conftest locks KTS_* to the temp
sandbox before any test module imports core), never touches the real
~/.ticketing or ~/Documents/KTS Records.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.auth import TokenTable
from core.bridge import create_app


def _mint_no_actor(table: TokenTable) -> str:
    _token_id, secret = table.mint("no-actor-token", scope="write")  # no actor_id
    return secret


def _auth_fail_reasons(audit_path: Path):
    out = []
    if audit_path.exists():
        for line in audit_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            if rec.get("action") == "auth_fail":
                out.append(rec)
    return out


def test_token_without_actor_id_gets_401_and_is_audited(tmp_path: Path):
    table = TokenTable(tmp_path / "token-table.json")
    secret = _mint_no_actor(table)
    app = create_app(table)
    client = TestClient(app, raise_server_exceptions=False)

    r = client.get("/api/health", headers={"X-API-Token": secret})
    assert r.status_code == 401, r.text
    assert r.json() == {"detail": "token has no actor_id"}, r.text

    fails = _auth_fail_reasons(table.audit_path)
    assert any(
        f.get("status") == 401
        and f.get("reason") == "token has no actor_id"
        and f.get("path") == "/api/health"
        for f in fails
    ), f"expected auth_fail audit for token-without-actor_id, got: {fails}"


def test_token_with_actor_id_passes(tmp_path: Path):
    table = TokenTable(tmp_path / "token-table.json")
    _token_id, secret = table.mint("with-actor", scope="write", actor_id="USR-000002")
    app = create_app(table)
    client = TestClient(app, raise_server_exceptions=False)

    r = client.get("/api/health", headers={"X-API-Token": secret})
    assert r.status_code == 200, r.text

    # no auth_fail recorded for this request
    fails = _auth_fail_reasons(table.audit_path)
    assert not any(f.get("path") == "/api/health" for f in fails), fails
