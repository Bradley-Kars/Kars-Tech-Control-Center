"""CRUD operations for servers (WS-2.1)."""

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Server


async def get_server(db: AsyncSession, server_id: str) -> Optional[Server]:
    result = await db.execute(select(Server).where(Server.id == server_id))
    return result.scalar_one_or_none()


async def get_servers(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[Server]:
    result = await db.execute(select(Server).offset(skip).limit(limit))
    return result.scalars().all()


async def create_server(db: AsyncSession, server_in: dict[str, Any]) -> Server:
    db_server = Server(**server_in)
    db.add(db_server)
    await db.commit()
    await db.refresh(db_server)
    return db_server


async def delete_server(db: AsyncSession, server_id: str) -> Optional[Server]:
    db_server = await get_server(db, server_id)
    if db_server:
        await db.delete(db_server)
        await db.commit()
    return db_server


# Optional: kept for import parity; servers are upserted via create for now.
async def update_server(db: AsyncSession, server_id: str, server_in: dict[str, Any]) -> Optional[Server]:
    db_server = await get_server(db, server_id)
    if not db_server:
        return None
    for field, value in server_in.items():
        setattr(db_server, field, value)
    await db.commit()
    await db.refresh(db_server)
    return db_server
