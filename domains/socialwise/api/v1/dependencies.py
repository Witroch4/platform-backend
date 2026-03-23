"""Shared FastAPI dependencies for Socialwise API routes."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.auth.jwt import verify_socialwise_access_token
from domains.socialwise.db.models.user import User
from platform_core.config import settings
from platform_core.db.sessions import get_socialwise_session


@dataclass(frozen=True, slots=True)
class AdminProxyContext:
    """Authenticated admin user context (JWT cookie or Bearer token)."""

    user_id: str
    role: str = "DEFAULT"
    permissions: tuple[str, ...] = ()
    auth_source: str = "cookie"


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


async def _load_user(session: AsyncSession, user_id: str) -> User | None:
    result = await session.execute(
        select(User).where(User.id == user_id),
    )
    return result.scalar_one_or_none()


async def get_admin_proxy_context(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
    session_cookie: Annotated[
        str | None,
        Cookie(alias=settings.socialwise_auth_cookie_name),
    ] = None,
    csrf_cookie: Annotated[
        str | None,
        Cookie(alias=settings.socialwise_auth_csrf_cookie_name),
    ] = None,
) -> AdminProxyContext:
    """Authorize admin requests via FastAPI-owned JWT cookies or Bearer token."""

    token = None
    auth_source = "cookie"
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        auth_source = "bearer"
    elif session_cookie:
        token = session_cookie

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        token_data = verify_socialwise_access_token(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {exc}",
        ) from exc

    if auth_source == "cookie" and request.method.upper() not in SAFE_METHODS:
        if not csrf_cookie or not x_csrf_token or csrf_cookie != x_csrf_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token inválido.",
            )
        if token_data.csrf_token and token_data.csrf_token != csrf_cookie:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sessão CSRF inválida.",
            )

    user = await _load_user(session, token_data.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return AdminProxyContext(
        user_id=user.id,
        role=user.role,
        permissions=tuple(token_data.permissions),
        auth_source=auth_source,
    )
