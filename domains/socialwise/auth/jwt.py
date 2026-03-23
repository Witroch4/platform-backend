"""JWT + cookie helpers for Socialwise browser authentication."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from jose import JWTError, jwt
from pydantic import BaseModel

from platform_core.config import settings


SameSiteValue = Literal["lax", "strict", "none"]


class SocialwiseTokenData(BaseModel):
    """Decoded Socialwise browser token."""

    user_id: str
    role: str
    permissions: list[str]
    token_type: str
    csrf_token: str | None = None


def get_socialwise_role_permissions(role: str) -> list[str]:
    """Map Socialwise roles to coarse-grained permissions."""

    permissions = {
        "SUPERADMIN": [
            "socialwise:read",
            "socialwise:write",
            "socialwise:admin",
            "socialwise:superadmin",
        ],
        "ADMIN": [
            "socialwise:read",
            "socialwise:write",
            "socialwise:admin",
        ],
        "DEFAULT": [
            "socialwise:read",
        ],
    }
    return permissions.get(role, permissions["DEFAULT"]).copy()


def create_socialwise_access_token(
    *,
    user_id: str,
    role: str,
    csrf_token: str,
    permissions: list[str] | None = None,
) -> tuple[str, int]:
    """Create the FastAPI-owned browser session token for Socialwise."""

    now = datetime.now(UTC)
    expire = now + timedelta(minutes=settings.socialwise_auth_access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "permissions": permissions or get_socialwise_role_permissions(role),
        "csrf": csrf_token,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "access",
        "iss": "socialwise-platform",
    }
    token = jwt.encode(
        payload,
        settings.socialwise_auth_secret,
        algorithm=settings.jwt_algorithm,
    )
    max_age = max(settings.socialwise_auth_access_token_expire_minutes * 60, 60)
    return token, max_age


def verify_socialwise_access_token(token: str) -> SocialwiseTokenData:
    """Validate a Socialwise browser session token."""

    try:
        payload = jwt.decode(
            token,
            settings.socialwise_auth_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise JWTError(f"Invalid Socialwise token: {exc}") from exc

    token_type = payload.get("type")
    if token_type != "access":
        raise JWTError(f"Invalid token type: {token_type}")

    user_id = payload.get("sub")
    if not user_id:
        raise JWTError("Token missing subject")

    return SocialwiseTokenData(
        user_id=str(user_id),
        role=str(payload.get("role", "DEFAULT")),
        permissions=[str(permission) for permission in payload.get("permissions", [])],
        token_type="access",
        csrf_token=str(payload["csrf"]) if payload.get("csrf") else None,
    )


def _base_cookie_payload(*, name: str, value: str, http_only: bool, max_age: int) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "value": value,
        "httpOnly": http_only,
        "secure": settings.socialwise_auth_cookie_secure,
        "sameSite": cast_same_site(settings.socialwise_auth_same_site),
        "path": settings.socialwise_auth_cookie_path,
        "maxAge": max_age,
    }
    if settings.socialwise_auth_cookie_domain:
        payload["domain"] = settings.socialwise_auth_cookie_domain
    return payload


def cast_same_site(value: str) -> SameSiteValue:
    normalized = value.lower()
    if normalized not in {"lax", "strict", "none"}:
        return "lax"
    return normalized  # type: ignore[return-value]


def build_cookie_payloads(*, session_token: str, csrf_token: str, max_age: int) -> list[dict[str, Any]]:
    """Build the browser cookie descriptors returned by auth endpoints."""

    return [
        _base_cookie_payload(
            name=settings.socialwise_auth_cookie_name,
            value=session_token,
            http_only=True,
            max_age=max_age,
        ),
        _base_cookie_payload(
            name=settings.socialwise_auth_csrf_cookie_name,
            value=csrf_token,
            http_only=False,
            max_age=max_age,
        ),
    ]


def build_logout_cookie_payloads() -> list[dict[str, Any]]:
    """Build cookie descriptors that clear Socialwise browser auth."""

    return build_cookie_payloads(session_token="", csrf_token="", max_age=0)
