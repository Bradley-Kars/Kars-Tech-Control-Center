"""backend/fleet/alerts_service.py metric store tests (P13).

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
    MetricPoint,
    MetricSeries,
    AlertsMetricsStore,
)


def _store() -> AlertsMetricsStore:
    fd, path = tempfile.mkstemp(prefix="kts-metrics-test-", suffix=".db")
    os.close(fd)
    return AlertsMetricsStore(path)


def test_record_and_query_roundtrip():
    s = _store()
    s.record(device_id="unraid-main", metric="cpu_usage", value=42.5)
    s.record(device_id="unraid-main", metric="cpu_usage", value=55.0)
    s.record(device_id="unraid-main", metric="mem_usage", value=70.0)
    s.record(device_id="jean", metric="cpu_usage", value=10.0)

    points = s.query(device_id="unraid-main", metric="cpu_usage")
    assert [p.value for p in points] == [42.5, 55.0]
    # from_ defaults to all time
    all_points = s.query(device_id="unraid-main", metric="cpu_usage")
    assert [p.value for p in all_points] == [42.5, 55.0]
    assert all(p.timestamp.endswith("Z") for p in points)
    assert [p.timestamp for p in points] == sorted(p.timestamp for p in points)


def test_query_filters_by_metric_and_device():
    s = _store()
    s.record(device_id="a", metric="m1", value=1.0)
    s.record(device_id="a", metric="m2", value=2.0)
    s.record(device_id="b", metric="m1", value=3.0)

    assert [p.value for p in s.query("a", "m1")] == [1.0]
    assert [p.value for p in s.query("b", "m1")] == [3.0]
    assert s.query("a", "nonexistent") == []
    assert s.query("nonexistent", "m1") == []


def test_query_honors_from_to_and_limit():
    s = _store()
    base = "2026-11-03T10:00:00Z"
    s.record(device_id="d", metric="m", value=1.0, timestamp="2026-11-03T10:00:00Z")
    s.record(device_id="d", metric="m", value=2.0, timestamp="2026-11-03T10:01:00Z")
    s.record(device_id="d", metric="m", value=3.0, timestamp="2026-11-03T10:02:00Z")

    limited = s.query(device_id="d", metric="m", from_=base, limit=2)
    assert [p.value for p in limited] == [1.0, 2.0]

    windowed = s.query(
        device_id="d", metric="m", from_="2026-11-03T10:01:00Z", to="2026-11-03T10:01:00Z"
    )
    assert [p.value for p in windowed] == [2.0]

    empty = s.query(device_id="d", metric="m", from_="2026-11-03T11:00:00Z")
    assert empty == []


def test_query_multi_groups_by_device_and_metric():
    s = _store()
    s.record(device_id="d1", metric="cpu", value=1.0)
    s.record(device_id="d1", metric="mem", value=2.0)
    s.record(device_id="d2", metric="cpu", value=3.0)

    series = s.query_multi(device_ids=["d1", "d2"], metrics=["cpu", "mem"], from_="2020-01-01T00:00:00Z")
    by_key = {(s.metric, s.device_id): [p.value for p in s.points] for s in series}
    assert by_key[("cpu", "d1")] == [1.0]
    assert by_key[("mem", "d1")] == [2.0]
    assert by_key[("cpu", "d2")] == [3.0]
    assert ("mem", "d2") not in by_key


def test_collect_all_returns_zero_when_no_collectors():
    s = _store()
    assert s.collect_all() == 0
