"""Audit middleware to automatically log user actions."""

from starlette.types import ASGIApp, Receive, Scope, Send

from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class AuditMiddleware:
    """
    Pure ASGI middleware to capture and log user actions.

    Captures:
    - All write operations (POST, PUT, PATCH, DELETE)
    - IP address and user agent
    - Adds audit context to request state for use by handlers
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        from starlette.requests import Request

        request = Request(scope, receive, send)

        # Skip audit for health checks and metrics
        if request.url.path in ("/health", "/health/live", "/health/ready", "/metrics"):
            await self.app(scope, receive, send)
            return

        # Extract client information
        client_ip = None
        if request.client:
            client_ip = request.client.host

        # Check for X-Forwarded-For header (proxy/load balancer)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()

        user_agent = request.headers.get("User-Agent")

        # Store in request state for use by handlers
        request.state.audit_ip = client_ip
        request.state.audit_user_agent = user_agent

        # Log write operations
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            logger.info(
                "write_operation",
                method=request.method,
                path=request.url.path,
                client_ip=client_ip,
            )

        await self.app(scope, receive, send)
