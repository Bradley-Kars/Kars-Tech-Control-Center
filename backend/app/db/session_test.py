"""Async SQLAlchemy engine + session factory (test DATABASE_URL)."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

test_engine = create_async_engine(settings.DATABASE_URL_TEST, echo=False, pool_pre_ping=True)

test_async_session = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_test_session() -> AsyncSession:
    async with test_async_session() as session:
        yield session
