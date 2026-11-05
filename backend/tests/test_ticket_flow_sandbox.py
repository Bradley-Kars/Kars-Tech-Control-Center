"""C4 — Sandbox ticket flow test.

End-to-end flow in a temp vault (KTS_SANDBOX=1 + KTS_VAULT + KTS_HOME, all set
by backend/tests/conftest.py — the real vault and real ~/.ticketing are never
touched):

  1. create ticket  (POST /api/tickets)
  2. worklog entry 1 (POST /api/tickets/{id}/worklog)
  3. worklog entry 2 (POST /api/tickets/{id}/worklog)
  4. status -> waiting (POST /api/tickets/{id}/status)
  5. generate invoice (POST /api/tickets/{id}/invoice)  <- route added by C4

Placeholder values only — no real hostnames, emails, or tokens.
"""

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402

HEADER = "X-API-Token"

CREATE = {
    "title": "Laptop: screen freezing, overheating",
    "priority": "medium",
    "category": "support",
    "work_type": "hardware",
    "client_name": "Test Customer",
}

WORKLOG_1 = {
    "date": "2026-11-03T13:30:00-06:00",
    "mode": "onsite",
    "hours": 0.5,
    "amount": 0,
    "payment": "no-charge",
    "description": "intake",
}

WORKLOG_2 = {
    "date": "2026-11-03T16:30:00-06:00",
    "mode": "onsite",
    "hours": 1.33,
    "amount": 39,
    "payment": "uninvoiced",
    "description": "diagnostics",
}


@pytest.fixture
def client(tmp_path):
    """TestClient with a write-scoped token against the sandbox vault."""
    table_dir = tmp_path / "auth"
    table_dir.mkdir(parents=True, exist_ok=True)
    table = TokenTable(table_dir / "token-table.json")
    _, secret = table.mint("c4-sandbox", actor_id="USR-000002", scope="write")
    app = create_app(table)
    # base_url=127.0.0.1 so TrustedHostMiddleware (W5.3) accepts the request.
    return TestClient(app, base_url="http://127.0.0.1"), secret


def _auth(secret: str) -> dict:
    return {HEADER: secret}


def test_sandbox_ticket_flow_end_to_end(client):
    """Walk a repair ticket through create, two worklogs, status waiting,
    and invoice generation entirely in the sandbox temp vault."""
    client, secret = client
    H = _auth(secret)

    # 1. create ticket
    r = client.post("/api/tickets", json=CREATE, headers=H)
    assert r.status_code == 200, (r.status_code, r.text)
    d = r.json()
    ticket_id = d["ticket_id"]
    import re

    assert re.match(r"^TKT-\d{4}-\d{3}$", ticket_id), d
    assert d["status"] == "new", d
    assert d["version"] == 1, d
    assert d["actor"] == "USR-000002", d

    # 2. worklog entry 1
    r = client.post(
        f"/api/tickets/{ticket_id}/worklog", json=WORKLOG_1, headers=H
    )
    assert r.status_code == 200, (r.status_code, r.text)
    assert r.json()["worklog_count"] == 1, r.json()

    # 3. worklog entry 2
    r = client.post(
        f"/api/tickets/{ticket_id}/worklog", json=WORKLOG_2, headers=H
    )
    assert r.status_code == 200, (r.status_code, r.text)
    assert r.json()["worklog_count"] == 2, r.json()

    # 4. status -> waiting
    r = client.post(
        f"/api/tickets/{ticket_id}/status",
        json={"status": "waiting"},
        headers=H,
    )
    assert r.status_code == 200, (r.status_code, r.text)
    assert r.json()["status"] == "waiting", r.json()

    # 5. generate invoice
    r = client.post(f"/api/tickets/{ticket_id}/invoice", headers=H)
    assert r.status_code == 200, (r.status_code, r.text)
    inv = r.json()["invoice"]
    assert re.match(r"^INV-\d{4}-\d{3}$", inv["invoice"]["number"]), inv
    assert inv["ticket_id"] == ticket_id, inv
    assert inv["client"]["name"] == "Test Customer", inv
    assert inv["invoice"]["total"] == 39, inv  # 0 + 39
    assert len(inv["invoice"]["items"]) == 2, inv

    # invoice file persisted to the sandbox vault
    from core.paths import invoices_dir

    inv_files = list(invoices_dir().glob(f'{inv["invoice"]["number"]}.json'))
    assert len(inv_files) == 1, inv_files
    saved = json.loads(inv_files[0].read_text())
    assert saved["ticket_id"] == ticket_id
    assert saved["invoice"]["total"] == 39
