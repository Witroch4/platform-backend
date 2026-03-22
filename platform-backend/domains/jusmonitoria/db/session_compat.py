"""Compat layer: exposes AsyncSessionLocal and session_ctx for JusMonitorIA domain.

Old code used `from app.db.engine import AsyncSessionLocal, get_session_ctx`.
This module maps those to the platform multi-DB session factories.
"""

from contextlib import asynccontextmanager

from platform_core.db.sessions import get_session_factory, session_ctx as _session_ctx


def _get_async_session_local():
    """Lazy accessor for the JusMonitorIA async session factory."""
    return get_session_factory("jusmonitoria")


class _AsyncSessionLocalProxy:
    """Proxy that behaves like AsyncSessionLocal() context manager."""

    def __call__(self):
        return _get_async_session_local()()

    def __aenter__(self):
        raise TypeError(
            "Use `async with AsyncSessionLocal() as session:` (call first)"
        )


AsyncSessionLocal = _AsyncSessionLocalProxy()


@asynccontextmanager
async def session_ctx():
    """Context manager for JusMonitorIA DB sessions (workers/scripts)."""
    async with _session_ctx("jusmonitoria") as session:
        yield session
