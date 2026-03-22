"""Tenant isolation middleware for multi-tenant architecture.

Extracted from domains/jusmonitoria/middleware_tenant.py into shared
platform_core. The domain file is now a thin re-export shim.
"""

from __future__ import annotations

import json
from uuid import UUID

from jose import JWTError, jwt
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class TenantMiddleware:
    """Pure ASGI middleware to extract and validate tenant_id from requests.

    Extracts tenant_id from:
    1. X-Tenant-ID header (for service-to-service calls)
    2. JWT token payload (for authenticated user requests)

    Injects tenant_id into request.state for use in repositories and services.
    Returns 403 if tenant_id is invalid or missing for protected routes.
    """

    EXCLUDED_PATHS = frozenset({
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
        "/api/v1/integrations/chatwit",
        "/api/v1/integrations/chatwit/webhook",
        "/api/v1/integrations/chatwit/init",
    })
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

        if path in self.EXCLUDED_PATHS or any(
            path.startswith(prefix) for prefix in self.EXCLUDED_PREFIXES
        ):
            await self.app(scope, receive, send)
            return

        tenant_id = self._extract_tenant_id(request)

        if tenant_id is None:
            logger.warning(
                "missing_tenant_id",
                path=path,
                method=request.method,
                client=request.client.host if request.client else None,
            )
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

        scope.setdefault("state", {})
        scope["state"]["tenant_id"] = tenant_id

        logger.debug(
            "tenant_context_established",
            tenant_id=str(tenant_id),
            path=path,
        )

        await self.app(scope, receive, send)

    def _extract_tenant_id(self, request: Request) -> UUID | None:
        """Extract tenant_id from X-Tenant-ID header or JWT token."""
        # 1. Try X-Tenant-ID header (service-to-service)
        tenant_id_header = request.headers.get("X-Tenant-ID")
        if tenant_id_header:
            try:
                return UUID(tenant_id_header)
            except (ValueError, AttributeError) as e:
                logger.warning(
                    "invalid_tenant_header",
                    header_value=tenant_id_header,
                    error=str(e),
                )
                return None

        # 2. Try JWT token
        authorization = request.headers.get("Authorization")
        if not authorization:
            return None

        try:
            scheme, token = authorization.split()
            if scheme.lower() != "bearer":
                logger.warning("invalid_auth_scheme", scheme=scheme)
                return None
        except ValueError:
            logger.warning("malformed_authorization_header")
            return None

        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
                options={"verify_exp": "exp" in jwt.get_unverified_claims(token)},
            )
            tenant_id_str = payload.get("tenant_id")
            if not tenant_id_str:
                logger.warning("jwt_missing_tenant_id")
                return None
            return UUID(tenant_id_str)

        except JWTError as e:
            logger.warning("jwt_validation_failed", error=str(e))
            return None
        except (ValueError, AttributeError) as e:
            logger.warning("invalid_tenant_in_jwt", error=str(e))
            return None
