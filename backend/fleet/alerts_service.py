"""backend/fleet/alerts_service.py — alert and metric store (P13).

Sqlite-backed store for Alert, AlertFilter and MetricSeries, mirroring the
desktop app implementation (alert_create,
alert_list, alert_acknowledge, alert_acknowledge_all, alert_get, alert_delete,
alert_auto_ack_run, metric_record, metric_query, metric_query_multi).

The store lives in a single sqlite file (path from KTS_ALERTS_DB env or a
default under ~/.local/share/kts/fleet/). Tables: alerts and metrics. No
secrets are stored — alert payloads are user-entered text. Timestamps are
RFC3339 UTC with seconds precision and a ``Z`` suffix.

Tested with temp files via KTS_ALERTS_DB; never touches real infrastructure.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

AlertSeverity = Literal["critical", "warning", "info"]

_VALID_SEVERITIES: frozenset[str] = frozenset({"critical", "warning", "info"})


def _now_ts() -> str:
    """Current UTC time as RFC3339 with seconds precision and a Z suffix."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_severity(value: object) -> AlertSeverity:
    if value not in _VALID_SEVERITIES:
        raise ValueError(f"invalid severity {value!r}: must be one of {sorted(_VALID_SEVERITIES)}")
    return value  # type: ignore[return-value]


class Alert:
    """One alert row, mirroring src/lib/types.ts Alert."""

    def __init__(
        self,
        *,
        severity: AlertSeverity,
        title: str,
        message: str,
        source: str = "manual",
        device_id: str | None = None,
        acknowledged: bool = False,
        acknowledged_by: str | None = None,
        acknowledged_at: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
        auto_ack_rule: str | None = None,
        id: int | None = None,
    ):
        self.id = id
        self.severity = _parse_severity(severity)
        self.title = title
        self.message = message
        self.source = source
        self.device_id = device_id
        self.acknowledged = acknowledged
        self.acknowledged_by = acknowledged_by
        self.acknowledged_at = acknowledged_at
        self.created_at = created_at or _now_ts()
        self.updated_at = updated_at or self.created_at
        self.auto_ack_rule = auto_ack_rule

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Alert):
            return NotImplemented
        return (
            self.id == other.id
            and self.severity == other.severity
            and self.title == other.title
            and self.message == other.message
            and self.source == other.source
            and self.device_id == other.device_id
            and self.acknowledged == other.acknowledged
            and self.acknowledged_by == other.acknowledged_by
            and self.acknowledged_at == other.acknowledged_at
            and self.created_at == other.created_at
            and self.updated_at == other.updated_at
            and self.auto_ack_rule == other.auto_ack_rule
        )

    def __repr__(self) -> str:
        return f"Alert(id={self.id!r}, severity={self.severity!r}, title={self.title!r})"


class AlertFilter:
    """Optional filters for alert list queries."""

    def __init__(
        self,
        *,
        severity: AlertSeverity | None = None,
        device_id: str | None = None,
        acknowledged: bool | None = None,
        since: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ):
        self.severity = severity
        self.device_id = device_id
        self.acknowledged = acknowledged
        self.since = since
        self.limit = limit
        self.offset = offset


class MetricPoint:
    """One metric sample, mirroring src/lib/types.ts MetricPoint."""

    def __init__(self, *, timestamp: str, value: float):
        self.timestamp = timestamp
        self.value = float(value)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, MetricPoint):
            return NotImplemented
        return self.timestamp == other.timestamp and self.value == other.value

    def __repr__(self) -> str:
        return f"MetricPoint(timestamp={self.timestamp!r}, value={self.value!r})"


class MetricSeries:
    """One device/metric series, mirroring src/lib/types.ts MetricSeries."""

    def __init__(self, *, metric: str, device_id: str, points: list[MetricPoint]):
        self.metric = metric
        self.device_id = device_id
        self.points = points

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, MetricSeries):
            return NotImplemented
        return (
            self.metric == other.metric
            and self.device_id == other.device_id
            and self.points == other.points
        )

    def __repr__(self) -> str:
        return f"MetricSeries(metric={self.metric!r}, device_id={self.device_id!r}, points={len(self.points)})"


def _default_db_path() -> str:
    env = os.environ.get("KTS_ALERTS_DB")
    if env:
        return env
    return str(Path.home() / ".local" / "share" / "kts" / "fleet" / "alerts.db")


class AlertsMetricsStore:
    """Sqlite-backed alert and metric store.

    One sqlite file holds both the ``alerts`` and ``metrics`` tables. Each
    public method opens its own short-lived connection so the store is safe
    to use across threads (FastAPI route handlers run on a thread pool).
    """

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or _default_db_path()
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    severity TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    device_id TEXT,
                    source TEXT NOT NULL DEFAULT 'manual',
                    acknowledged INTEGER NOT NULL DEFAULT 0,
                    acknowledged_by TEXT,
                    acknowledged_at TEXT,
                    auto_ack_rule TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    metric TEXT NOT NULL,
                    value REAL NOT NULL,
                    timestamp TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_metrics_device_metric ON metrics(device_id, metric)"
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)")
            conn.commit()

    # ------------------------------------------------------------------ alerts

    def create(
        self,
        severity: AlertSeverity,
        title: str,
        message: str,
        *,
        source: str = "manual",
        device_id: str | None = None,
        auto_ack_rule: str | None = None,
    ) -> Alert:
        """Insert a new alert and return it with its id and timestamps."""
        now = _now_ts()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO alerts
                    (severity, title, message, device_id, source, auto_ack_rule, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (severity, title, message, device_id, source, auto_ack_rule, now, now),
            )
            conn.commit()
            alert_id = cur.lastrowid
        return Alert(
            id=alert_id,
            severity=severity,
            title=title,
            message=message,
            source=source,
            device_id=device_id,
            acknowledged=False,
            acknowledged_by=None,
            acknowledged_at=None,
            created_at=now,
            updated_at=now,
            auto_ack_rule=auto_ack_rule,
        )

    def list(self, filter: AlertFilter | None = None) -> list[Alert]:
        """List alerts matching the filter, newest first."""
        f = filter or AlertFilter()
        clauses: list[str] = ["1=1"]
        params: list[object] = []
        if f.severity is not None:
            clauses.append("severity = ?")
            params.append(f.severity)
        if f.device_id is not None:
            clauses.append("device_id = ?")
            params.append(f.device_id)
        if f.acknowledged is not None:
            clauses.append("acknowledged = ?")
            params.append(1 if f.acknowledged else 0)
        if f.since is not None:
            clauses.append("created_at >= ?")
            params.append(f.since)
        query = (
            "SELECT id, severity, title, message, device_id, source, "
            "acknowledged, acknowledged_by, acknowledged_at, auto_ack_rule, "
            "created_at, updated_at FROM alerts WHERE " + " AND ".join(clauses)
            + " ORDER BY created_at DESC"
        )
        if f.limit is not None:
            query += " LIMIT ?"
            params.append(f.limit)
        elif f.offset is not None:
            # SQLite requires LIMIT with OFFSET; -1 means no limit.
            query += " LIMIT -1"
        if f.offset is not None:
            query += " OFFSET ?"
            params.append(f.offset)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [self._row_to_alert(row) for row in rows]

    def get(self, alert_id: int) -> Alert | None:
        """Return the alert with the given id, or None."""
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, severity, title, message, device_id, source,
                       acknowledged, acknowledged_by, acknowledged_at,
                       auto_ack_rule, created_at, updated_at
                FROM alerts WHERE id = ?
                """,
                (alert_id,),
            ).fetchone()
        return None if row is None else self._row_to_alert(row)

    def acknowledge(self, alert_id: int, acknowledged_by: str) -> Alert | None:
        """Mark an alert acknowledged; return the updated alert or None."""
        now = _now_ts()
        with self._connect() as conn:
            cur = conn.execute(
                """
                UPDATE alerts
                SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (acknowledged_by, now, now, alert_id),
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
        return self.get(alert_id)

    def acknowledge_all(
        self, device_id: str | None = None, acknowledged_by: str = "user"
    ) -> int:
        """Acknowledge every unacknowledged alert (optionally one device).

        Returns the number of rows acknowledged.
        """
        now = _now_ts()
        clauses = ["acknowledged = 0"]
        params: list[object] = [acknowledged_by, now, now]
        if device_id is not None:
            clauses.append("device_id = ?")
            params.append(device_id)
        with self._connect() as conn:
            cur = conn.execute(
                f"""
                UPDATE alerts
                SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?, updated_at = ?
                WHERE {" AND ".join(clauses)}
                """,
                params,
            )
            conn.commit()
            return cur.rowcount

    def delete(self, alert_id: int) -> bool:
        """Delete an alert by id. Returns True if a row was removed."""
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM alerts WHERE id = ?", (alert_id,))
            conn.commit()
            return cur.rowcount > 0

    def auto_ack_run(self) -> int:
        """Run auto-acknowledgment rules.

        Current rule: acknowledge every unacknowledged ``info`` alert older
        than one hour, recorded with acknowledged_by='auto'. Returns the
        number of rows acknowledged.
        """
        now = _now_ts()
        with self._connect() as conn:
            cur = conn.execute(
                """
                UPDATE alerts
                SET acknowledged = 1, acknowledged_by = 'auto',
                    acknowledged_at = ?, updated_at = ?
                WHERE acknowledged = 0
                  AND severity = 'info'
                  AND datetime(created_at) < datetime('now', '-1 hour')
                """,
                (now, now),
            )
            conn.commit()
            return cur.rowcount

    def prune_retention(self, max_age_days: int) -> int:
        """Delete acknowledged alerts older than max_age_days.

        Returns the number of rows removed. Unacknowledged alerts are never
        pruned.
        """
        with self._connect() as conn:
            cur = conn.execute(
                """
                DELETE FROM alerts
                WHERE acknowledged = 1
                  AND datetime(created_at) < datetime('now', ?)
                """,
                (f"-{max_age_days} days",),
            )
            conn.commit()
            return cur.rowcount

    # ------------------------------------------------------------------ metrics

    def record(
        self,
        device_id: str,
        metric: str,
        value: float,
        *,
        timestamp: str | None = None,
    ) -> None:
        """Record one metric sample (timestamp defaults to now)."""
        ts = timestamp or _now_ts()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO metrics (device_id, metric, value, timestamp) VALUES (?, ?, ?, ?)",
                (device_id, metric, float(value), ts),
            )
            conn.commit()

    def query(
        self,
        device_id: str,
        metric: str,
        from_: str = "2000-01-01T00:00:00Z",
        *,
        to: str | None = None,
        limit: int = 1000,
    ) -> list[MetricPoint]:
        """Query metric points for one device/metric within a time window.

        ``from_`` defaults to the year 2000 (effectively all time).
        """
        to_ts = to or _now_ts()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT timestamp, value FROM metrics
                WHERE device_id = ? AND metric = ?
                  AND timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC
                LIMIT ?
                """,
                (device_id, metric, from_, to_ts, limit),
            ).fetchall()
        return [MetricPoint(timestamp=row["timestamp"], value=row["value"]) for row in rows]

    def query_multi(
        self,
        device_ids: list[str],
        metrics: list[str],
        from_: str,
        *,
        to: str | None = None,
    ) -> list[MetricSeries]:
        """Query multiple device/metric series within a time window.

        Series with no points are omitted.
        """
        to_ts = to or _now_ts()
        series: list[MetricSeries] = []
        with self._connect() as conn:
            for device_id in device_ids:
                for metric in metrics:
                    rows = conn.execute(
                        """
                        SELECT timestamp, value FROM metrics
                        WHERE device_id = ? AND metric = ?
                          AND timestamp BETWEEN ? AND ?
                        ORDER BY timestamp ASC
                        """,
                        (device_id, metric, from_, to_ts),
                    ).fetchall()
                    points = [
                        MetricPoint(timestamp=row["timestamp"], value=row["value"])
                        for row in rows
                    ]
                    if points:
                        series.append(
                            MetricSeries(metric=metric, device_id=device_id, points=points)
                        )
        return series

    def collect_all(self) -> int:
        """Collect metrics from all configured sources.

        Stub: no collectors are registered yet, so nothing is recorded and 0
        is returned. Collectors are added in a later phase.
        """
        return 0

    # ------------------------------------------------------------------ internals

    @staticmethod
    def _row_to_alert(row: sqlite3.Row) -> Alert:
        return Alert(
            id=row["id"],
            severity=row["severity"],  # type: ignore[arg-type]
            title=row["title"],
            message=row["message"],
            source=row["source"],
            device_id=row["device_id"],
            acknowledged=bool(row["acknowledged"]),
            acknowledged_by=row["acknowledged_by"],
            acknowledged_at=row["acknowledged_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            auto_ack_rule=row["auto_ack_rule"],
        )


__all__ = [
    "Alert",
    "AlertFilter",
    "AlertSeverity",
    "AlertsMetricsStore",
    "MetricPoint",
    "MetricSeries",
    "_default_db_path",
]
