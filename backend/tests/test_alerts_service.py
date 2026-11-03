"""backend/fleet/alerts_service.py alert store tests (P13).

Fixture-only: each test uses a temp sqlite file — no real database, no real
server, no network. Placeholder values only.
"""

from __future__ import annotations

import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.alerts_service import (  # noqa: E402
    Alert,
    AlertFilter,
    AlertSeverity,
    AlertsMetricsStore,
)


def _store() -> AlertsMetricsStore:
    fd, path = tempfile.mkstemp(prefix="kts-alerts-test-", suffix=".db")
    os.close(fd)
    return AlertsMetricsStore(path)


def _make_alert(**overrides) -> Alert:
    data = dict(severity="warning", title="High CPU", message="cpu over 90%", source="meshcentral")
    data.update(overrides)
    return Alert(**data)


def test_create_returns_alert_with_id_and_timestamps():
    s = _store()
    alert = s.create(
        severity="critical",
        title="Disk full",
        message="root filesystem at 98%",
        device_id="unraid-main",
        source="smart",
        auto_ack_rule="disk>90",
    )
    assert alert.id is not None
    assert alert.id > 0
    assert alert.severity == "critical"
    assert alert.title == "Disk full"
    assert alert.message == "root filesystem at 98%"
    assert alert.device_id == "unraid-main"
    assert alert.source == "smart"
    assert alert.auto_ack_rule == "disk>90"
    assert alert.acknowledged is False
    assert alert.acknowledged_by is None
    assert alert.acknowledged_at is None
    assert alert.created_at.endswith("Z")
    assert alert.updated_at == alert.created_at


def test_create_defaults():
    s = _store()
    alert = s.create(severity="info", title="t", message="m")
    assert alert.source == "manual"
    assert alert.device_id is None
    assert alert.auto_ack_rule is None


def test_create_invalid_severity_raises():
    s = _store()
    with pytest.raises(ValueError):
        s.create(severity="bogus", title="t", message="m")  # type: ignore[arg-type]


def test_list_returns_insertion_order_descending():
    s = _store()
    s.create(severity="info", title="a", message="m")
    s.create(severity="info", title="b", message="m")
    s.create(severity="info", title="c", message="m")
    alerts = s.list()
    assert [a.title for a in alerts] == ["c", "b", "a"]


def test_list_filters_by_severity():
    s = _store()
    s.create(severity="critical", title="crit", message="m")
    s.create(severity="info", title="info", message="m")
    alerts = s.list(AlertFilter(severity="critical"))
    assert [a.title for a in alerts] == ["crit"]


def test_list_filters_by_device_and_acknowledged():
    s = _store()
    s.create(severity="warning", title="d1", message="m", device_id="dev-a")
    ack = s.create(severity="warning", title="d2", message="m", device_id="dev-a")
    s.acknowledge(ack.id, "user")
    s.create(severity="warning", title="d3", message="m", device_id="dev-b")
    # d1 and d2 share a second; ties resolve by insertion (rowid) order.
    only_dev_a = s.list(AlertFilter(device_id="dev-a"))
    assert [a.title for a in only_dev_a] == ["d1", "d2"]

    unacked_dev_a = s.list(AlertFilter(device_id="dev-a", acknowledged=False))
    assert [a.title for a in unacked_dev_a] == ["d1"]

    acked_dev_a = s.list(AlertFilter(device_id="dev-a", acknowledged=True))
    assert [a.title for a in acked_dev_a] == ["d2"]


def test_list_since_and_limit_and_offset():
    s = _store()
    old = s.create(severity="info", title="old", message="m")
    new = s.create(severity="info", title="new", message="m")
    # Backdate "old" so ordering is deterministic regardless of sub-second ties.
    import sqlite3

    conn = sqlite3.connect(s.db_path)
    conn.execute(
        "UPDATE alerts SET created_at=?, updated_at=? WHERE id=?",
        ("2020-01-01T00:00:00Z", "2020-01-01T00:00:00Z", old.id),
    )
    conn.commit()
    conn.close()
    since = new.created_at

    all_alerts = s.list()
    assert len(all_alerts) == 2
    assert [a.title for a in all_alerts] == ["new", "old"]

    limited = s.list(AlertFilter(limit=1))
    assert len(limited) == 1
    assert limited[0].title == "new"

    offset = s.list(AlertFilter(offset=1))
    assert [a.title for a in offset] == ["old"]

    since_filtered = s.list(AlertFilter(since=since))
    assert [a.title for a in since_filtered] == ["new"]

    after_2021 = s.list(AlertFilter(since="2021-01-01T00:00:00Z"))
    assert [a.title for a in after_2021] == ["new"]
    far_future = s.list(AlertFilter(since="2099-01-01T00:00:00Z"))
    assert far_future == []


def test_get_existing_and_missing():
    s = _store()
    created = s.create(severity="info", title="get-me", message="m")
    fetched = s.get(created.id)
    assert fetched is not None
    assert fetched.title == "get-me"
    assert fetched.id == created.id
    assert s.get(999999) is None


def test_acknowledge_marks_and_returns_updated():
    s = _store()
    created = s.create(severity="warning", title="ack-me", message="m")
    updated = s.acknowledge(created.id, "ops-user")
    assert updated is not None
    assert updated.acknowledged is True
    assert updated.acknowledged_by == "ops-user"
    assert updated.acknowledged_at is not None
    assert updated.updated_at >= updated.created_at
    assert s.get(created.id).acknowledged is True
    assert s.acknowledge(999999, "ops-user") is None


def test_acknowledge_all_counts_and_filters():
    s = _store()
    s.create(severity="info", title="x1", message="m", device_id="dev-a")
    s.create(severity="info", title="x2", message="m", device_id="dev-a")
    s.create(severity="info", title="x3", message="m", device_id="dev-b")
    count = s.acknowledge_all(device_id="dev-a", acknowledged_by="auto")
    assert count == 2
    assert s.list(AlertFilter(device_id="dev-a", acknowledged=False)) == []
    assert s.list(AlertFilter(device_id="dev-b", acknowledged=False)) == [s.list(AlertFilter(device_id="dev-b"))[0]]


def test_delete_removes():
    s = _store()
    created = s.create(severity="info", title="bye", message="m")
    assert s.delete(created.id) is True
    assert s.get(created.id) is None
    assert s.delete(created.id) is False
    assert s.delete(999999) is False


def test_auto_ack_run_acks_old_info_alerts():
    s = _store()
    old = s.create(severity="info", title="old info", message="m")
    # backdate the old alert past the one-hour threshold
    old.created_at = "2020-01-01T00:00:00Z"
    old.updated_at = old.created_at
    # rewrite the row directly to set the backdated timestamp
    import sqlite3

    conn = sqlite3.connect(s.db_path)
    conn.execute(
        "UPDATE alerts SET created_at=?, updated_at=? WHERE id=?",
        (old.created_at, old.created_at, old.id),
    )
    conn.commit()
    conn.close()

    s.create(severity="critical", title="recent critical", message="m")
    s.create(severity="info", title="recent info", message="m")
    s.create(severity="warning", title="recent warning", message="m")

    count = s.auto_ack_run()
    assert count == 1
    assert s.get(old.id).acknowledged is True
    assert s.get(old.id).acknowledged_by == "auto"
    assert s.list(AlertFilter(acknowledged=False)) == [
        a for a in s.list() if a.title in ("recent critical", "recent info", "recent warning")
    ]


def test_prune_retention_removes_old_acknowledged():
    s = _store()
    old_acked = s.create(severity="info", title="old acked", message="m")
    s.acknowledge(old_acked.id, "user")
    import sqlite3

    conn = sqlite3.connect(s.db_path)
    conn.execute(
        "UPDATE alerts SET created_at=?, updated_at=? WHERE id=?",
        ("2020-01-01T00:00:00Z", "2020-01-01T00:00:00Z", old_acked.id),
    )
    conn.commit()
    conn.close()

    s.create(severity="info", title="new acked", message="m")
    s.create(severity="info", title="old unacked", message="m")
    s.list()[0]  # force order

    count = s.prune_retention(max_age_days=30)
    assert count == 1
    assert s.get(old_acked.id) is None
    assert s.list(AlertFilter(acknowledged=False)) == [a for a in s.list() if not a.acknowledged]


def test_alert_severity_values():
    assert AlertSeverity.__args__ == ("critical", "warning", "info")  # type: ignore[attr-defined]
