"""Middleware for tracking in-flight requests during shutdown."""

import structlog
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from platform_core.shutdown.handler import get_shutdown_handler

logger = structlog.get_logger(__name__)


class ShutdownMiddleware:
    """
    Pure ASGI middleware to track in-flight requests and reject new ones during shutdown.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        shutdown_handler = get_shutdown_handler()

        if shutdown_handler.is_shutting_down:
            request = Request(scope, receive)
            logger.warning(
                "request_rejected_shutdown",
                path=request.url.path,
                method=request.method,
            )
            response = JSONResponse(
                status_code=503,
                content={
                    "detail": "Server is shutting down. Please try again later.",
                    "error": "service_unavailable",
                },
                headers={"Retry-After": "30"},
            )
            await response(scope, receive, send)
            return

        shutdown_handler.increment_requests()
        try:
            await self.app(scope, receive, send)
        finally:
            shutdown_handler.decrement_requests()
