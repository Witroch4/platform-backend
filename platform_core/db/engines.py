"""Multi-engine registry. One SQLAlchemy engine per database."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool

from platform_core.config import settings

_engines: dict[str, AsyncEngine] = {}

_URL_MAP = {
    "socialwise": "socialwise_database_url",
    "jusmonitoria": "jusmonitoria_database_url",
    "platform": "platform_database_url",
}


def get_engine(db_name: str) -> AsyncEngine:
    """Get or create an async engine for the given database name."""
    if db_name not in _engines:
        attr = _URL_MAP.get(db_name)
        if attr is None:
            raise ValueError(f"Unknown database: {db_name}. Valid: {list(_URL_MAP)}")

        url = getattr(settings, attr)
        poolclass = NullPool if settings.environment == "test" else AsyncAdaptedQueuePool

        kwargs: dict = {
            "echo": settings.debug,
            "pool_pre_ping": True,
            "poolclass": poolclass,
        }
        if poolclass is AsyncAdaptedQueuePool:
            kwargs["pool_size"] = settings.database_pool_size
            kwargs["max_overflow"] = settings.database_max_overflow

        _engines[db_name] = create_async_engine(url, **kwargs)

    return _engines[db_name]


async def close_all_engines() -> None:
    """Dispose all engines. Call on application shutdown."""
    for engine in _engines.values():
        await engine.dispose()
    _engines.clear()
