"""Seed the `servers` table with the real KTS fleet.

Populates the devices shown in the sidebar / Fleet Command / Dashboard:

- Unraid Server   → home-server.tailf6d3b4.ts.net        (device_type: unraid)
- Galaxy S24 Ultra→ bradleys-s24-ultra.tailf6d3b4.ts.net (device_type: phone)
- ROG Ally        → lgbtally.tailf6d3b4.ts.net           (device_type: handheld)

Idempotent: existing ids are left untouched.

Run against the dev DATABASE_URL:
    python scripts/seed_servers.py
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models import Server

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

SERVERS = [
    {
        "id": "unraid-server",
        "name": "Unraid Server",
        "hostname": "home-server.tailf6d3b4.ts.net",
        "port": 22,
        "username": "root",
        "auth_type": "key",
        "device_type": "unraid",
        "connection_priority": ["graphql", "ssh", "meshcentral"],
        "service_keys": {},
    },
    {
        "id": "galaxy-s24",
        "name": "Galaxy S24 Ultra",
        "hostname": "bradleys-s24-ultra.tailf6d3b4.ts.net",
        "port": 22,
        "username": "shell",
        "auth_type": "key",
        "device_type": "phone",
        "connection_priority": ["adb", "kdeconnect", "ssh"],
        "service_keys": {},
    },
    {
        "id": "rog-ally",
        "name": "ROG Ally",
        "hostname": "lgbtally.tailf6d3b4.ts.net",
        "port": 22,
        "username": "bazzite",
        "auth_type": "key",
        "device_type": "handheld",
        "connection_priority": ["ssh", "meshcentral"],
        "service_keys": {},
    },
]


async def seed() -> None:
    async with async_session() as session:
        result = await session.execute(select(Server.id))
        existing = {row[0] for row in result.all()}

        added = 0
        for cfg in SERVERS:
            if cfg["id"] in existing:
                print(f"  skip {cfg['id']} (already present)")
                continue
            session.add(Server(**cfg))
            added += 1

        await session.commit()
        print(f"Seeded {added} server(s); {len(existing)} already present.")


if __name__ == "__main__":
    asyncio.run(seed())
