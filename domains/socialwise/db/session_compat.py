"""Compat layer for Socialwise worker sessions.

Old code and new TaskIQ workers use the same ergonomic pattern as the
JusMonitorIA migration: ``async with AsyncSessionLocal() as session``.
"""

from contextlib import asynccontextmanager

from platform_core.db.sessions import get_session_factory, session_ctx as _session_ctx


def _get_async_session_local():
    """Lazy accessor for the Socialwise async session factory."""

    return get_session_factory("socialwise")


class _AsyncSessionLocalProxy:
    """Proxy that behaves like AsyncSessionLocal() context manager."""

    def __call__(self):
        return _get_async_session_local()()

    def __aenter__(self):
        raise TypeError("Use `async with AsyncSessionLocal() as session:` (call first)")


AsyncSessionLocal = _AsyncSessionLocalProxy()


@asynccontextmanager
async def session_ctx():
    """Context manager for Socialwise DB sessions (workers/scripts)."""

    async with _session_ctx("socialwise") as session:
        yield session
