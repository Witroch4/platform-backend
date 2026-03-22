"""Logging middleware to add request context."""

import time
import uuid

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from platform_core.logging.config import bind_context, clear_context, get_logger

logger = get_logger(__name__)


class LoggingMiddleware:
    """
    Pure ASGI middleware to add logging context and log requests.

    Adds to context:
    - request_id: Unique identifier for the request
    - tenant_id: From JWT token (if authenticated)
    - user_id: From JWT token (if authenticated)
    - path: Request path
    - method: HTTP method
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    # Paths that generate too much noise and don't need request logging
    SILENT_PATHS = frozenset({"/health", "/metrics", "/readiness", "/liveness"})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        # Skip verbose logging for health/probe endpoints
        if request.url.path in self.SILENT_PATHS:
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())

        clear_context()

        bind_context(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        if hasattr(request.state, "tenant_id"):
            bind_context(tenant_id=str(request.state.tenant_id))
        if hasattr(request.state, "user_id"):
            bind_context(user_id=str(request.state.user_id))

        logger.info(
            "request_started",
            client_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

        start_time = time.time()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                # Inject X-Request-ID header
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
            duration = time.time() - start_time
            logger.info(
                "request_completed",
                status_code=status_code,
                duration_seconds=round(duration, 3),
            )
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                "request_failed",
                error=str(e),
                error_type=type(e).__name__,
                duration_seconds=round(duration, 3),
                exc_info=True,
            )
            raise
        finally:
            clear_context()
