"""Session factories per database. Each domain uses its own session dependency."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from platform_core.db.engines import get_engine

_session_factories: dict[str, async_sessionmaker[AsyncSession]] = {}


def get_session_factory(db_name: str) -> async_sessionmaker[AsyncSession]:
    """Get or create a session factory for the given database."""
    if db_name not in _session_factories:
        engine = get_engine(db_name)
        _session_factories[db_name] = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _session_factories[db_name]


# --- FastAPI Dependencies (one per database) ---


async def get_platform_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for platform DB sessions."""
    factory = get_session_factory("platform")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_socialwise_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for socialwise DB sessions."""
    factory = get_session_factory("socialwise")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_jusmonitoria_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for jusmonitoria DB sessions."""
    factory = get_session_factory("jusmonitoria")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# --- Context managers for workers/scripts ---


@asynccontextmanager
async def session_ctx(db_name: str) -> AsyncGenerator[AsyncSession, None]:
    """Async context manager for sessions in non-FastAPI code (workers, scripts)."""
    factory = get_session_factory(db_name)
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
