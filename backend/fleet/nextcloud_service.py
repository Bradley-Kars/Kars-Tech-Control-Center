"""backend/fleet/nextcloud_service.py — Nextcloud port (P6).

Port of src-tauri/src/services/nextcloud.rs: server info, system status,
storage stats, users and activity over Nextcloud's OCS API
(/ocs/v2.php/...), using basic auth (username/password) plus the
``OCS-APIRequest`` header. Credentials are resolved from
``ServiceKeys`` (``nextcloud_url`` / ``nextcloud_user`` / ``nextcloud_pass``).

Built on httpx (already a project dependency); tests replay recorded
fixtures via FixtureNextcloudClient — no real network, no real Nextcloud
server. The real client never sends credentials to anything but the
configured Nextcloud base URL, and errors are redacted by the router before
they reach the client.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx


class NextcloudError(Exception):
    """Raised when a Nextcloud API request fails."""


class NextcloudClient(ABC):
    """Abstract base for Nextcloud API clients."""

    @abstractmethod
    async def get_info(self) -> NextcloudInfo:
        """Return server info (version, edition)."""
        ...

    @abstractmethod
    async def get_status(self) -> NextcloudSystemStatus:
        """Return system status (installed, maintenance, ...)."""
        ...

    @abstractmethod
    async def get_storage(self) -> NextcloudStorage:
        """Return storage / user / file counts."""
        ...

    @abstractmethod
    async def get_users(self) -> list[NextcloudUser]:
        """Return the list of known users."""
        ...

    @abstractmethod
    async def get_activity(self, limit: int | None = None) -> NextcloudActivity:
        """Return recent activity (optional cap)."""
        ...


@dataclass
class NextcloudInfo:
    version: str = ""
    versionstring: str = ""
    edition: str = ""


@dataclass
class NextcloudSystemStatus:
    installed: bool = False
    maintenance: bool = False
    needs_db_upgrade: bool = False
    version: str | None = None
    versionstring: str | None = None
    edition: str | None = None
    productname: str | None = None
    extended_support: bool = False


@dataclass
class NextcloudStorage:
    num_users: int = 0
    num_files: int = 0
    num_storages: int = 0
    num_storages_local: int = 0
    num_storages_home: int = 0
    num_storages_other: int = 0


@dataclass
class NextcloudUser:
    id: str
    display_name: str
    enabled: bool
    quota: dict[str, Any] | None = None
    email: str | None = None
    groups: list[str] = field(default_factory=list)
    backend: str = "internal"
    subadmin: list[str] = field(default_factory=list)
    last_login: int | None = None


@dataclass
class ActivityItem:
    activity_id: int | None = None
    app: str = ""
    activity_type: str = ""
    user: str = ""
    subject: str = ""
    subject_rich: Any = None
    message: str = ""
    message_rich: Any = None
    file: str | None = None
    link: str | None = None
    datetime: str = ""
    object_type: str | None = None
    object_id: int | None = None
    object_name: str | None = None
    objects: Any = None
    icon: str | None = None


@dataclass
class NextcloudActivity:
    activities: list[ActivityItem] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Pure response parsing (network-free, easy to unit test)
# ---------------------------------------------------------------------------


def _ocs_data(raw: Any) -> Any:
    """Extract the OCS ``data`` block (dict or list), falling back to ``raw``."""
    if not isinstance(raw, dict):
        return raw
    ocs = raw.get("ocs")
    if isinstance(ocs, dict):
        data = ocs.get("data")
        if data is not None:
            return data
    return raw


def _nextcloud_system(raw: dict[str, Any]) -> dict[str, Any]:
    """Locate the ``nextcloud.system`` block, falling back to the ``nextcloud``
    block itself (which may carry ``storage`` directly), then to ``raw``."""
    nc = raw.get("nextcloud")
    if isinstance(nc, dict):
        system = nc.get("system")
        if isinstance(system, dict):
            return system
        return nc
    return raw


def parse_nextcloud_info(raw: Any) -> NextcloudInfo:
    """Parse the serverinfo ``/info`` envelope into NextcloudInfo.

    Nextcloud 34 may omit ``versionstring``/``edition``; they fall back to
    ``version`` / ``Community`` respectively.
    """
    system = _nextcloud_system(_ocs_data(raw))
    version = str(system.get("version") or "")
    versionstring = str(system.get("versionstring") or version or "")
    edition = str(system.get("edition") or "Community") or "Community"
    return NextcloudInfo(
        version=version, versionstring=versionstring, edition=edition
    )


def parse_nextcloud_status(raw: Any) -> NextcloudSystemStatus:
    """Build a system status from the serverinfo ``/info`` envelope.

    The dedicated status endpoint does not work in Nextcloud 34, so the info
    endpoint is used instead (mirrors src-tauri/src/services/nextcloud.rs).
    """
    system = _nextcloud_system(_ocs_data(raw))
    version = str(system.get("version") or "")
    versionstring = str(system.get("versionstring") or version or "")
    edition = str(system.get("edition") or "Community") or "Community"
    return NextcloudSystemStatus(
        installed=True,
        maintenance=False,
        needs_db_upgrade=False,
        version=version or None,
        versionstring=versionstring or None,
        edition=edition or None,
        productname="Nextcloud",
        extended_support=False,
    )


def parse_nextcloud_storage(raw: Any) -> NextcloudStorage:
    """Parse storage stats from the info envelope, falling back to the
    users endpoint count when the storage block reports zero users.

    ``storage`` lives alongside ``system`` inside the ``nextcloud`` block
    (not inside ``system``), so we read it from the ``nextcloud`` block
    directly rather than via ``_nextcloud_system``.
    """
    data = _ocs_data(raw)
    storage = {}
    if isinstance(data, dict):
        nc = data.get("nextcloud")
        if isinstance(nc, dict):
            storage = nc.get("storage")
            if not isinstance(storage, dict):
                storage = {}
    num_users = int(storage.get("num_users") or 0)
    if num_users == 0:
        users = data.get("users")
        if isinstance(users, list):
            num_users = len(users)
    return NextcloudStorage(
        num_users=num_users,
        num_files=int(storage.get("num_files") or 0),
        num_storages=int(storage.get("num_storages") or 0),
        num_storages_local=int(storage.get("num_storages_local") or 0),
        num_storages_home=int(storage.get("num_storages_home") or 0),
        num_storages_other=int(storage.get("num_storages_other") or 0),
    )


def parse_nextcloud_user(raw: Any, user_id: str) -> NextcloudUser:
    """Parse a single user detail object (the ``cloud/users/{id}`` envelope)."""
    data = _ocs_data(raw) if isinstance(raw, dict) else {}
    quota = data.get("quota")
    if not isinstance(quota, dict):
        quota = None
    groups = data.get("groups") or []
    if not isinstance(groups, list):
        groups = []
    subadmin = data.get("subadmin") or []
    if not isinstance(subadmin, list):
        subadmin = []
    last_login = data.get("last_login")
    if last_login is not None:
        try:
            last_login = int(last_login)  # type: ignore[assignment]
        except (TypeError, ValueError):
            last_login = None
    return NextcloudUser(
        id=user_id,
        display_name=str(data.get("display_name") or user_id),
        enabled=bool(data.get("enabled", True)),
        quota=quota,
        email=data.get("email"),
        groups=[str(g) for g in groups],
        backend=str(data.get("backend") or "internal"),
        subadmin=[str(s) for s in subadmin],
        last_login=last_login,
    )


def parse_nextcloud_activity(raw: Any) -> NextcloudActivity:
    """Parse the activity envelope into NextcloudActivity."""
    data = _ocs_data(raw)
    if isinstance(data, list):
        activities = data
    elif isinstance(data, dict):
        activities = data.get("activities")
        if not isinstance(activities, list):
            activities = []
    else:
        activities = []
    items: list[ActivityItem] = []
    for entry in activities:
        if not isinstance(entry, dict):
            continue
        items.append(
            ActivityItem(
                activity_id=entry.get("activity_id"),
                app=str(entry.get("app") or ""),
                activity_type=str(entry.get("type") or ""),
                user=str(entry.get("user") or ""),
                subject=str(entry.get("subject") or ""),
                subject_rich=entry.get("subject_rich"),
                message=str(entry.get("message") or ""),
                message_rich=entry.get("message_rich"),
                file=entry.get("file"),
                link=entry.get("link"),
                datetime=str(entry.get("datetime") or ""),
                object_type=entry.get("object_type"),
                object_id=entry.get("object_id"),
                object_name=entry.get("object_name"),
                objects=entry.get("objects"),
                icon=entry.get("icon"),
            )
        )
    return NextcloudActivity(activities=items)


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


class RealNextcloudClient(NextcloudClient):
    """Real Nextcloud client using httpx against a Nextcloud server.

    Sends basic auth (username/password) plus ``OCS-APIRequest`` on every
    request. Self-signed certs are accepted (the norm on this LAN).
    """

    INFO_PATH = "ocs/v2.php/serverinfo/api/v1/info"
    USERS_PATH = "ocs/v2.php/cloud/users"
    ACTIVITY_PATH = "ocs/v2.php/apps/activity/api/v2/activity"

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        timeout: float = 30.0,
    ):
        if not base_url or not base_url.strip():
            raise ValueError("nextcloud_url not configured")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = timeout
        self._auth = (username, password)
        self._headers: dict[str, str] = {
            "OCS-APIRequest": "true",
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
        """GET ``{base_url}/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/{path}"
        resp = await self._client.get(url)
        if resp.status_code >= 400:
            raise NextcloudError(
                f"Nextcloud error {resp.status_code}: {resp.text[:500]}"
            )
        try:
            return resp.json()
        except ValueError as exc:
            raise NextcloudError(
                f"Nextcloud parse error from {path}: {exc}"
            ) from exc

    async def get_info(self) -> NextcloudInfo:
        data = await self._request(self.INFO_PATH)
        return parse_nextcloud_info(data)

    async def get_status(self) -> NextcloudSystemStatus:
        data = await self._request(self.INFO_PATH)
        return parse_nextcloud_status(data)

    async def get_storage(self) -> NextcloudStorage:
        data = await self._request(self.INFO_PATH)
        return parse_nextcloud_storage(data)

    async def get_users(self) -> list[NextcloudUser]:
        data = await self._request(self.USERS_PATH)
        usernames: list[str] = []
        if isinstance(data, dict):
            users_value = data.get("users")
            if isinstance(users_value, list):
                usernames = [str(u) for u in users_value]
        elif isinstance(data, list):
            usernames = [str(u) for u in data]
        users: list[NextcloudUser] = []
        for username in usernames:
            try:
                detail = await self._request(f"{self.USERS_PATH}/{username}")
                users.append(parse_nextcloud_user(detail, username))
            except NextcloudError:
                users.append(
                    NextcloudUser(
                        id=username, display_name=username, enabled=True
                    )
                )
        return users

    async def get_activity(
        self, limit: int | None = None
    ) -> NextcloudActivity:
        path = self.ACTIVITY_PATH
        if limit is not None:
            path = f"{path}?limit={int(limit)}"
        data = await self._request(path)
        return parse_nextcloud_activity(data)


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


class FixtureNextcloudClient(NextcloudClient):
    """Fixture-based Nextcloud client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live Nextcloud server is required.
    """

    def __init__(
        self,
        fixtures: dict[str, Any] | None = None,
    ):
        self.fixtures = dict(fixtures or {})

    async def get_info(self) -> NextcloudInfo:
        return _fixture_dataclass(self.fixtures.get("info"), NextcloudInfo)

    async def get_status(self) -> NextcloudSystemStatus:
        return _fixture_dataclass(self.fixtures.get("status"), NextcloudSystemStatus)

    async def get_storage(self) -> NextcloudStorage:
        return _fixture_dataclass(self.fixtures.get("storage"), NextcloudStorage)

    async def get_users(self) -> list[NextcloudUser]:
        raw = self.fixtures.get("users", [])
        if not isinstance(raw, list):
            raw = []
        out: list[NextcloudUser] = []
        for i, u in enumerate(raw):
            if isinstance(u, NextcloudUser):
                out.append(u)
            elif isinstance(u, dict):
                out.append(parse_nextcloud_user(u, str(i)))
            else:
                out.append(NextcloudUser(id=str(i), display_name=str(i), enabled=True))
        return out

    async def get_activity(self, limit: int | None = None) -> NextcloudActivity:
        return _fixture_dataclass(
            self.fixtures.get("activity"), NextcloudActivity
        )


def _fixture_dataclass(raw: Any, cls: type) -> Any:
    if isinstance(raw, cls):
        return raw
    if isinstance(raw, dict):
        return cls(**raw)
    return cls()


__all__ = [
    "NextcloudClient",
    "NextcloudError",
    "NextcloudInfo",
    "NextcloudSystemStatus",
    "NextcloudStorage",
    "NextcloudUser",
    "ActivityItem",
    "NextcloudActivity",
    "RealNextcloudClient",
    "FixtureNextcloudClient",
    "parse_nextcloud_info",
    "parse_nextcloud_status",
    "parse_nextcloud_storage",
    "parse_nextcloud_user",
    "parse_nextcloud_activity",
]
