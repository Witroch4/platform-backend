"""Metrics middleware to track HTTP requests."""

import re
import time

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from platform_core.metrics import (
    http_error_rate,
    http_request_count,
    http_request_duration_seconds,
)

# Pre-compiled patterns for path normalization
_UUID_RE = re.compile(
    r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)
_NUMERIC_ID_RE = re.compile(r"/\d+")


def _normalize_path(path: str) -> str:
    """Normalize path by replacing UUIDs and numeric IDs with {id}."""
    path = _UUID_RE.sub("/{id}", path)
    path = _NUMERIC_ID_RE.sub("/{id}", path)
    return path


class MetricsMiddleware:
    """
    Pure ASGI middleware to track HTTP request metrics.

    Tracks request duration, count by method/path/status, and error rate.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        if request.url.path == "/metrics":
            await self.app(scope, receive, send)
            return

        path = _normalize_path(request.url.path)
        method = request.method
        start_time = time.time()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
            duration = time.time() - start_time
            http_request_duration_seconds.labels(
                method=method, path=path, status_code=str(status_code)
            ).observe(duration)
            http_request_count.labels(
                method=method, path=path, status_code=str(status_code)
            ).inc()
        except Exception as e:
            duration = time.time() - start_time
            error_type = type(e).__name__
            http_error_rate.labels(
                method=method, path=path, error_type=error_type
            ).inc()
            http_request_duration_seconds.labels(
                method=method, path=path, status_code="500"
            ).observe(duration)
            http_request_count.labels(
                method=method, path=path, status_code="500"
            ).inc()
            raise
