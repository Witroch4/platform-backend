"""Shared FastAPI dependencies for Socialwise API routes."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Header, HTTPException, status

from platform_core.config import settings


@dataclass(frozen=True, slots=True)
class AdminProxyContext:
    """Context propagated by the Next.js BFF proxy to admin FastAPI routes."""

    user_id: str


async def get_admin_proxy_context(
    x_internal_api_key: Annotated[str | None, Header(alias="X-Internal-API-Key")] = None,
    x_app_user_id: Annotated[str | None, Header(alias="X-App-User-Id")] = None,
) -> AdminProxyContext:
    """Authorize proxied admin requests coming from the Next.js BFF."""

    if x_internal_api_key != settings.platform_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if not x_app_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-App-User-Id header",
        )

    return AdminProxyContext(user_id=x_app_user_id)
