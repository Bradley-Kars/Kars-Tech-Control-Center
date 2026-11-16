"""Integration test configuration for KTS Master Control backend.

Creates the real test schema (enum types + tables via SQLAlchemy metadata)
against the ephemeral Postgres test DB (port 5433), and yields an httpx
AsyncClient whose `get_session` dependency is overridden to use the test DB
session. No fetch stubbing — tests hit the real backend against the real DB.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from app.api.deps import get_session
from app.core.config import settings
from app.db.base import Base
from app.main import app

TEST_DATABASE_URL = settings.DATABASE_URL_TEST

ENUM_SQL = [
    "CREATE TYPE device_type_enum AS ENUM ('unraid','phone','steamdeck','htpc','laptop','router','generic')",
    "CREATE TYPE auth_type_enum AS ENUM ('password','key')",
    "CREATE TYPE connection_method_enum AS ENUM ('meshcentral','ssh','graphql','adb','kdeconnect')",
    "CREATE TYPE alert_severity_enum AS ENUM ('critical','warning','info')",
    "CREATE TYPE alert_source_enum AS ENUM ('prometheus','meshcentral','graphql','ssh','task','manual')",
    "CREATE TYPE meshcentral_status_enum AS ENUM ('online','offline','connected','unknown')",
    "CREATE TYPE kts_ticket_status_enum AS ENUM ('open','in_progress','resolved','closed')",
    "CREATE TYPE kts_ticket_priority_enum AS ENUM ('low','medium','high','urgent')",
]


@pytest.fixture
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        # Use savepoints so a duplicate-type error doesn't abort the transaction.
        for enum_sql in ENUM_SQL:
            try:
                async with conn.begin_nested():
                    await conn.execute(text(enum_sql))
            except Exception:
                pass
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client(test_engine):
    """Test client whose get_session dependency uses the test DB."""

    async def override_get_session() -> AsyncSession:
        session_factory = async_sessionmaker(
            test_engine, class_=AsyncSession, expire_on_commit=False
        )
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
