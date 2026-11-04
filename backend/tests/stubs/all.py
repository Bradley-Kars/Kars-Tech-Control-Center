"""Cluster helper that starts all stub servers at once.

Convenience for e2e tests that need several services simulated simultaneously::

    from tests.stubs.all import StubCluster

    cluster = StubCluster()
    await cluster.start()
    try:
        plex_url = cluster.plex.url
        nextcloud_url = cluster.nextcloud.url
        ...
    finally:
        await cluster.stop()
"""

from __future__ import annotations

from .adguard import AdGuardStub
from .homeassistant import HomeAssistantStub
from .lidarr import LidarrStub
from .nextcloud import NextcloudStub
from .plex import PlexStub
from .unraid import UnraidStub


class StubCluster:
    """All six stub servers started together on distinct free ports."""

    def __init__(self) -> None:
        self.plex = PlexStub()
        self.nextcloud = NextcloudStub()
        self.homeassistant = HomeAssistantStub()
        self.adguard = AdGuardStub()
        self.lidarr = LidarrStub()
        self.unraid = UnraidStub()

    @property
    def all(self) -> list:
        return [
            self.plex,
            self.nextcloud,
            self.homeassistant,
            self.adguard,
            self.lidarr,
            self.unraid,
        ]

    async def start(self) -> "StubCluster":
        for stub in self.all:
            await stub.start()
        return self

    async def stop(self) -> None:
        for stub in reversed(self.all):
            await stub.stop()


async def start_all_stubs() -> StubCluster:
    cluster = StubCluster()
    await cluster.start()
    return cluster


async def stop_all_stubs(cluster: StubCluster) -> None:
    await cluster.stop()
