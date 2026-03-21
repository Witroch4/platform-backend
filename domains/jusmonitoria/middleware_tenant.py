"""Tenant isolation middleware for multi-tenant architecture."""

import json
import logging
from uuid import UUID

from jose import JWTError, jwt
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from platform_core.config import settings

logger = logging.getLogger(__name__)


class TenantMiddleware:
    """
    Pure ASGI middleware to extract and validate tenant_id from requests.

    Extracts tenant_id from:
    1. X-Tenant-ID header (for service-to-service calls)
    2. JWT token payload (for authenticated user requests)

    Injects tenant_id into request.state for use in repositories and services.
    Returns 403 if tenant_id is invalid or missing for protected routes.
    """

    # Routes that don't require tenant isolation
    EXCLUDED_PATHS = {
        "/",
        "/health",
        "/health/live",
        "/health/ready",
        "/metrics",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/integrations/instagram/callback",
        # Chatwit webhook endpoints resolve tenant from payload/secret internally
        "/api/v1/integrations/chatwit",
        "/api/v1/integrations/chatwit/webhook",
        "/api/v1/integrations/chatwit/init",
    }
    EXCLUDED_PREFIXES = (
        "/api/v1/pje/jurisdicoes",
    )

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        path = request.url.path

        # Skip tenant validation for excluded paths
        if path in self.EXCLUDED_PATHS or any(path.startswith(prefix) for prefix in self.EXCLUDED_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Extract tenant_id from header or JWT
        tenant_id = self._extract_tenant_id(request)

        if tenant_id is None:
            logger.warning(
                "Missing tenant_id for protected route",
                extra={
                    "path": path,
                    "method": request.method,
                    "client": request.client.host if request.client else None,
                },
            )
            # Send 403 response
            body = json.dumps({
                "detail": "Tenant identification required. "
                "Provide X-Tenant-ID header or valid JWT token."
            }).encode()
            await send({
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": body,
            })
            return

        # Inject tenant_id into request state
        scope.setdefault("state", {})
        scope["state"]["tenant_id"] = tenant_id

        logger.debug(
            "Tenant context established",
            extra={
                "tenant_id": str(tenant_id),
                "path": path,
            },
        )

        await self.app(scope, receive, send)

    def _extract_tenant_id(self, request: Request) -> UUID | None:
        """
        Extract tenant_id from X-Tenant-ID header or JWT token.

        Priority:
        1. X-Tenant-ID header (for service-to-service calls)
        2. JWT token payload (for user requests)
        """
        # Try X-Tenant-ID header first
        tenant_id_header = request.headers.get("X-Tenant-ID")
        if tenant_id_header:
            try:
                return UUID(tenant_id_header)
            except (ValueError, AttributeError) as e:
                logger.warning(
                    "Invalid X-Tenant-ID header format",
                    extra={"header_value": tenant_id_header, "error": str(e)},
                )
                return None

        # Try extracting from JWT token
        authorization = request.headers.get("Authorization")
        if not authorization:
            return None

        # Extract token from "Bearer <token>" format
        try:
            scheme, token = authorization.split()
            if scheme.lower() != "bearer":
                logger.warning(
                    "Invalid authorization scheme",
                    extra={"scheme": scheme},
                )
                return None
        except ValueError:
            logger.warning("Malformed Authorization header")
            return None

        # Decode JWT and extract tenant_id
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
                options={"verify_exp": "exp" in jwt.get_unverified_claims(token)},
            )
            tenant_id_str = payload.get("tenant_id")

            if not tenant_id_str:
                logger.warning("JWT token missing tenant_id claim")
                return None

            return UUID(tenant_id_str)

        except JWTError as e:
            logger.warning(
                "JWT token validation failed",
                extra={"error": str(e)},
            )
            return None
        except (ValueError, AttributeError) as e:
            logger.warning(
                "Invalid tenant_id format in JWT",
                extra={"error": str(e)},
            )
            return None
