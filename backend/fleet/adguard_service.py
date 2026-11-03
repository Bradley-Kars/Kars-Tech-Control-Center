"""backend/fleet/adguard_service.py — AdGuard Home port (P7).

Port of src-tauri/src/services/adguard.rs: status, stats, query log,
clients, filters, DHCP, and protection enable/disable over AdGuard Home's
local API (/control/...), using basic auth. Credentials are resolved from
``ServiceKeys`` (``adguard_url`` / ``adguard_user`` / ``adguard_pass``).

Built on httpx (already a project dependency); tests replay recorded
fixtures via FixtureAdGuardClient — no real network, no real AdGuard
server. The real client never sends credentials to anything but the
configured AdGuard base URL, and errors are redacted by the router before
they reach the client.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx


class AdGuardError(Exception):
    """Raised when an AdGuard Home API request fails."""


class AdGuardClient(ABC):
    """Abstract base for AdGuard Home API clients."""

    @abstractmethod
    async def get_status(self) -> AdGuardStatus:
        """Return server status (version, protection state, ...)."""
        ...

    @abstractmethod
    async def get_stats(self) -> AdGuardStats:
        """Return DNS query stats (clients/filters aggregated lazily)."""
        ...

    @abstractmethod
    async def get_query_log(
        self, limit: int = 50, offset: int = 0
    ) -> AdGuardQueryLog:
        """Return the recent DNS query log."""
        ...

    @abstractmethod
    async def get_clients(self) -> AdGuardClientResponse:
        """Return the list of configured clients."""
        ...

    @abstractmethod
    async def get_filters(self) -> list[AdGuardFilter]:
        """Return the list of enabled/disabled filters."""
        ...

    @abstractmethod
    async def get_dhcp(self) -> AdGuardDHCP:
        """Return DHCP server state and leases."""
        ...

    @abstractmethod
    async def enable_protection(self) -> None:
        """Enable DNS protection (POST /control/dns/enable)."""
        ...

    @abstractmethod
    async def disable_protection(self) -> None:
        """Disable DNS protection (POST /control/dns/disable)."""
        ...


# ---------------------------------------------------------------------------
# Response shapes (mirror src-tauri/src/services/adguard.rs)
# ---------------------------------------------------------------------------


@dataclass
class AdGuardStatus:
    version: str = ""
    language: str = ""
    dns_addresses: list[str] = field(default_factory=list)
    dns_port: int = 53
    http_port: int = 8443
    protection_disabled_duration: int = 0
    start_time: float = 0.0
    protection_enabled: bool = False
    dhcp_available: bool = False
    running: bool = False
    config_hash: str = ""


@dataclass
class AdGuardStats:
    dns_queries: dict[str, Any] = field(
        default_factory=lambda: {
            "total": 0,
            "blocked": 0,
            "replaced": 0,
            "safe_browsing": 0,
            "parental": 0,
            "avg_processing_time": 0.0,
        }
    )
    blocked: dict[str, Any] = field(default_factory=lambda: {"domains": 0, "clients": 0})
    replaced: dict[str, Any] = field(default_factory=lambda: {"domains": 0, "clients": 0})
    clients: dict[str, Any] = field(default_factory=lambda: {"total": 0, "active": 0})
    filters: dict[str, Any] = field(default_factory=lambda: {"total": 0, "enabled": 0})


@dataclass
class AdGuardQueryLogEntry:
    filter_id: int | None = None
    elapsed_ms: str | None = None
    cached: bool | None = None
    client: str | None = None
    client_info: Any = None
    client_proto: str | None = None
    reason: str | None = None
    rule: str | None = None
    rules: Any = None
    status: str | None = None
    time: str | None = None
    upstream: str | None = None
    question: Any = None
    answer: Any = None


@dataclass
class AdGuardQueryLog:
    data: list[AdGuardQueryLogEntry] = field(default_factory=list)
    limit: int = 0
    offset: int = 0
    total: int = 0


@dataclass
class AdGuardClientItem:
    name: str = ""
    ids: list[str] = field(default_factory=list)
    filtering_enabled: bool = False
    parental_enabled: bool = False
    safe_search: dict[str, Any] = field(default_factory=dict)
    safebrowsing_enabled: bool = False
    use_global_settings: bool = False


@dataclass
class AdGuardClientResponse:
    clients: list[AdGuardClientItem] = field(default_factory=list)
    auto_clients: list[Any] = field(default_factory=list)


@dataclass
class AdGuardFilter:
    id: int | None = None
    name: str = ""
    url: str = ""
    enabled: bool = False
    rules_count: int = 0
    last_updated: str | None = None
    last_error: str | None = None


@dataclass
class AdGuardDHCPLease:
    ip: str = ""
    mac: str = ""
    hostname: str = ""
    expires: int = 0
    id: str = ""


@dataclass
class AdGuardDHCP:
    enabled: bool = False
    leases: list[AdGuardDHCPLease] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Pure response parsing (network-free, easy to unit test)
# ---------------------------------------------------------------------------


def _as_list(raw: Any) -> list[Any]:
    return raw if isinstance(raw, list) else []


def _as_int(raw: Any, key: str, default: int) -> int:
    if not isinstance(raw, dict):
        return default
    try:
        return int(raw.get(key, default))
    except (TypeError, ValueError):
        return default


def _as_bool(raw: Any, key: str, default: bool = False) -> bool:
    if not isinstance(raw, dict):
        return default
    value = raw.get(key, default)
    return bool(value)


def parse_adguard_status(raw: Any) -> AdGuardStatus:
    """Parse the ``/control/status`` envelope into AdGuardStatus."""
    if not isinstance(raw, dict):
        return AdGuardStatus()
    dns_addresses = raw.get("dns_addresses")
    if not isinstance(dns_addresses, list):
        dns_addresses = []
    return AdGuardStatus(
        version=str(raw.get("version") or ""),
        language=str(raw.get("language") or ""),
        dns_addresses=[str(a) for a in dns_addresses if isinstance(a, str)],
        dns_port=_as_int(raw, "dns_port", 53),
        http_port=_as_int(raw, "http_port", 8443),
        protection_disabled_duration=_as_int(raw, "protection_disabled_duration", 0),
        start_time=float(raw.get("start_time") or 0.0),
        protection_enabled=_as_bool(raw, "protection_enabled", False),
        dhcp_available=_as_bool(raw, "dhcp_available", False),
        running=_as_bool(raw, "running", False),
        config_hash=str(raw.get("config_hash") or ""),
    )


def parse_adguard_stats(raw: Any) -> AdGuardStats:
    """Parse the ``/control/stats`` envelope into AdGuardStats.

    ``replaced`` is the sum of safe browsing + safe search + parental, mirroring
    the Rust port.
    """
    stats = AdGuardStats()
    if not isinstance(raw, dict):
        return stats
    dns = stats.dns_queries
    safebrowsing = _as_int(raw, "num_replaced_safebrowsing", 0)
    safesearch = _as_int(raw, "num_replaced_safesearch", 0)
    parental = _as_int(raw, "num_replaced_parental", 0)
    dns["total"] = _as_int(raw, "num_dns_queries", 0)
    dns["blocked"] = _as_int(raw, "num_blocked_filtering", 0)
    dns["safe_browsing"] = safebrowsing
    dns["parental"] = parental
    dns["replaced"] = safebrowsing + safesearch + parental
    dns["avg_processing_time"] = float(raw.get("avg_processing_time") or 0.0)
    stats.blocked = {"domains": dns["blocked"], "clients": 0}
    stats.replaced = {"domains": dns["replaced"], "clients": 0}
    return stats


def parse_adguard_query_log(raw: Any) -> AdGuardQueryLog:
    """Parse the ``/control/querylog`` envelope into AdGuardQueryLog."""
    log = AdGuardQueryLog()
    if not isinstance(raw, dict):
        return log
    data = raw.get("data")
    entries: list[AdGuardQueryLogEntry] = []
    for entry in _as_list(data):
        if not isinstance(entry, dict):
            continue
        entries.append(
            AdGuardQueryLogEntry(
                filter_id=_as_optional_int(entry.get("filterId")),
                elapsed_ms=_as_optional_str(entry.get("elapsedMs")),
                cached=_as_optional_bool(entry.get("cached")),
                client=_as_optional_str(entry.get("client")),
                client_info=entry.get("client_info"),
                client_proto=_as_optional_str(entry.get("client_proto")),
                reason=_as_optional_str(entry.get("reason")),
                rule=_as_optional_str(entry.get("rule")),
                rules=entry.get("rules"),
                status=_as_optional_str(entry.get("status")),
                time=_as_optional_str(entry.get("time")),
                upstream=_as_optional_str(entry.get("upstream")),
                question=entry.get("question"),
                answer=entry.get("answer"),
            )
        )
    log.data = entries
    log.limit = _as_int(raw, "limit", 0)
    log.offset = _as_int(raw, "offset", 0)
    log.total = _as_int(raw, "total", 0)
    return log


def _as_optional_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _as_optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    return bool(value)


def parse_adguard_clients(raw: Any) -> AdGuardClientResponse:
    """Parse the ``/control/clients`` envelope into AdGuardClientResponse."""
    response = AdGuardClientResponse()
    if not isinstance(raw, dict):
        return response
    items: list[AdGuardClientItem] = []
    for entry in _as_list(raw.get("clients")):
        if not isinstance(entry, dict):
            continue
        safe_search = entry.get("safe_search")
        if not isinstance(safe_search, dict):
            safe_search = {}
        items.append(
            AdGuardClientItem(
                name=str(entry.get("name") or ""),
                ids=[str(i) for i in (entry.get("ids") or []) if isinstance(i, str)],
                filtering_enabled=_as_bool(entry, "filtering_enabled", False),
                parental_enabled=_as_bool(entry, "parental_enabled", False),
                safe_search={"enabled": _as_bool(safe_search, "enabled", False)},
                safebrowsing_enabled=_as_bool(entry, "safebrowsing_enabled", False),
                use_global_settings=_as_bool(entry, "use_global_settings", False),
            )
        )
    response.clients = items
    response.auto_clients = raw.get("auto_clients") or []
    return response


def parse_adguard_filters(raw: Any) -> list[AdGuardFilter]:
    """Parse the ``/control/filtering/status`` filters into AdGuardFilter."""
    filters: list[AdGuardFilter] = []
    data = raw.get("filters") if isinstance(raw, dict) else None
    if isinstance(data, list):
        raw_filters = data
    elif isinstance(raw, list):
        raw_filters = raw
    else:
        raw_filters = []
    for entry in raw_filters:
        if not isinstance(entry, dict):
            continue
        filters.append(
            AdGuardFilter(
                id=_as_optional_int(entry.get("id") or entry.get("filter_list_id")),
                name=str(entry.get("name") or ""),
                url=str(entry.get("url") or ""),
                enabled=_as_bool(entry, "enabled", False),
                rules_count=_as_int(entry, "rules_count", 0),
                last_updated=_as_optional_str(entry.get("last_updated")),
                last_error=_as_optional_str(entry.get("last_error")),
            )
        )
    return filters


def parse_adguard_dhcp(raw: Any) -> AdGuardDHCP:
    """Parse the ``/control/dhcp/status`` envelope into AdGuardDHCP."""
    dhcp = AdGuardDHCP()
    if not isinstance(raw, dict):
        return dhcp
    dhcp.enabled = _as_bool(raw, "enabled", False)
    leases: list[AdGuardDHCPLease] = []
    for entry in _as_list(raw.get("leases")):
        if not isinstance(entry, dict):
            continue
        leases.append(
            AdGuardDHCPLease(
                ip=str(entry.get("ip") or ""),
                mac=str(entry.get("mac") or ""),
                hostname=str(entry.get("hostname") or ""),
                expires=_as_int(entry, "expires", 0),
                id=str(entry.get("id") or ""),
            )
        )
    dhcp.leases = leases
    return dhcp


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


class RealAdGuardClient(AdGuardClient):
    """Real AdGuard Home client using httpx against a local AdGuard server.

    Sends basic auth (username/password) on every request. Self-signed certs
    are accepted (the norm on this LAN).
    """

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        timeout: float = 30.0,
    ):
        if not base_url or not base_url.strip():
            raise ValueError("adguard_url not configured")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = timeout
        self._auth = (username, password)
        self._headers: dict[str, str] = {
            "Accept": "application/json",
        }
        self._client = httpx.AsyncClient(
            timeout=timeout,
            auth=self._auth,
            headers=self._headers,
            verify=False,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, path: str) -> Any:
        """GET ``{base_url}/control/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/control/{path}"
        resp = await self._client.get(url)
        if resp.status_code >= 400:
            raise AdGuardError(f"AdGuard error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise AdGuardError(f"AdGuard parse error from {path}: {exc}") from exc

    async def _post(self, path: str, body: Any = None) -> Any:
        """POST ``{base_url}/control/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/control/{path}"
        resp = await self._client.post(url, json=body or {})
        if resp.status_code >= 400:
            raise AdGuardError(f"AdGuard error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError:
            return {}

    async def get_status(self) -> AdGuardStatus:
        return parse_adguard_status(await self._request("status"))

    async def get_stats(self) -> AdGuardStats:
        stats = parse_adguard_stats(await self._request("stats"))
        # Aggregate clients/filters from their own endpoints, degrading to
        # zeros on failure (mirrors src-tauri/src/services/adguard.rs).
        try:
            clients = await self.get_clients()
            stats.clients["total"] = len(clients.clients)
            stats.clients["active"] = sum(
                1 for c in clients.clients if c.filtering_enabled
            )
        except Exception:
            pass
        try:
            filters = await self.get_filters()
            stats.filters["total"] = len(filters)
            stats.filters["enabled"] = sum(1 for f in filters if f.enabled)
        except Exception:
            pass
        return stats

    async def get_query_log(
        self, limit: int = 50, offset: int = 0
    ) -> AdGuardQueryLog:
        path = f"querylog?limit={int(limit)}&offset={int(offset)}"
        return parse_adguard_query_log(await self._request(path))

    async def get_clients(self) -> AdGuardClientResponse:
        return parse_adguard_clients(await self._request("clients"))

    async def get_filters(self) -> list[AdGuardFilter]:
        return parse_adguard_filters(await self._request("filtering/status"))

    async def get_dhcp(self) -> AdGuardDHCP:
        return parse_adguard_dhcp(await self._request("dhcp/status"))

    async def enable_protection(self) -> None:
        await self._post("dns/enable")

    async def disable_protection(self) -> None:
        await self._post("dns/disable")


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


class FixtureAdGuardClient(AdGuardClient):
    """Fixture-based AdGuard Home client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live AdGuard Home server is required.
    """

    def __init__(self, fixtures: dict[str, Any] | None = None):
        self.fixtures = dict(fixtures or {})

    async def get_status(self) -> AdGuardStatus:
        return _fixture_dataclass(self.fixtures.get("status"), AdGuardStatus)

    async def get_stats(self) -> AdGuardStats:
        return _fixture_dataclass(self.fixtures.get("stats"), AdGuardStats)

    async def get_query_log(
        self, limit: int = 50, offset: int = 0
    ) -> AdGuardQueryLog:
        return _fixture_dataclass(self.fixtures.get("query_log"), AdGuardQueryLog)

    async def get_clients(self) -> AdGuardClientResponse:
        return _fixture_dataclass(self.fixtures.get("clients"), AdGuardClientResponse)

    async def get_filters(self) -> list[AdGuardFilter]:
        raw = self.fixtures.get("filters", [])
        if not isinstance(raw, list):
            raw = []
        return [f if isinstance(f, AdGuardFilter) else AdGuardFilter(**f) for f in raw]

    async def get_dhcp(self) -> AdGuardDHCP:
        return _fixture_dataclass(self.fixtures.get("dhcp"), AdGuardDHCP)

    async def enable_protection(self) -> None:
        return None

    async def disable_protection(self) -> None:
        return None


def _fixture_dataclass(raw: Any, cls: type) -> Any:
    if isinstance(raw, cls):
        return raw
    if isinstance(raw, dict):
        return cls(**raw)
    return cls()


__all__ = [
    "AdGuardError",
    "AdGuardClient",
    "RealAdGuardClient",
    "FixtureAdGuardClient",
    "AdGuardStatus",
    "AdGuardStats",
    "AdGuardQueryLog",
    "AdGuardQueryLogEntry",
    "AdGuardClientResponse",
    "AdGuardClientItem",
    "AdGuardDHCP",
    "AdGuardDHCPLease",
    "AdGuardFilter",
    "parse_adguard_status",
    "parse_adguard_stats",
    "parse_adguard_query_log",
    "parse_adguard_clients",
    "parse_adguard_filters",
    "parse_adguard_dhcp",
]
