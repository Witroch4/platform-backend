"""JWT token creation and verification."""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from pydantic import BaseModel

from platform_core.config import settings


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    user_id: str
    tenant_id: str
    role: str
    permissions: list[str]
    exp: int | None = None  # None = sem expiração
    iat: int
    type: str  # "access" or "refresh"


class TokenData(BaseModel):
    """Decoded token data."""
    
    user_id: UUID
    tenant_id: UUID
    role: str
    permissions: list[str]
    token_type: str


def create_access_token(
    user_id: UUID,
    tenant_id: UUID,
    role: str,
    permissions: list[str] | None = None,
) -> str:
    """
    Create JWT access token.
    
    Args:
        user_id: User UUID
        tenant_id: Tenant UUID
        role: User role (admin, lawyer, assistant, viewer)
        permissions: List of permission strings
    
    Returns:
        Encoded JWT token string
    """
    if permissions is None:
        permissions = _get_role_permissions(role)
    
    now = datetime.utcnow()

    payload: dict[str, Any] = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id),
        "role": role,
        "permissions": permissions,
        "iat": int(now.timestamp()),
        "type": "access",
    }

    # 0 = sem expiração
    if settings.jwt_access_token_expire_minutes > 0:
        expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
        payload["exp"] = int(expire.timestamp())
    
    token = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    
    return token


def create_refresh_token(
    user_id: UUID,
    tenant_id: UUID,
) -> str:
    """
    Create JWT refresh token.
    
    Refresh tokens have longer expiration and fewer claims.
    They can only be used to obtain new access tokens.
    
    Args:
        user_id: User UUID
        tenant_id: Tenant UUID
    
    Returns:
        Encoded JWT refresh token string
    """
    now = datetime.utcnow()

    payload: dict[str, Any] = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id),
        "iat": int(now.timestamp()),
        "type": "refresh",
    }

    # 0 = sem expiração
    if settings.jwt_refresh_token_expire_days > 0:
        expire = now + timedelta(days=settings.jwt_refresh_token_expire_days)
        payload["exp"] = int(expire.timestamp())
    
    token = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    
    return token


def verify_token(token: str, expected_type: str = "access") -> TokenData:
    """
    Verify and decode JWT token.
    
    Args:
        token: JWT token string
        expected_type: Expected token type ("access" or "refresh")
    
    Returns:
        TokenData with decoded claims
    
    Raises:
        JWTError: If token is invalid, expired, or wrong type
        ValueError: If required claims are missing or invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": "exp" in jwt.get_unverified_claims(token)},
        )
    except JWTError as e:
        raise JWTError(f"Token validation failed: {str(e)}")
    
    # Validate token type
    token_type = payload.get("type")
    if token_type != expected_type:
        raise JWTError(f"Invalid token type. Expected {expected_type}, got {token_type}")
    
    # Extract required claims
    user_id_str = payload.get("user_id")
    tenant_id_str = payload.get("tenant_id")
    
    if not user_id_str or not tenant_id_str:
        raise ValueError("Token missing required claims: user_id or tenant_id")
    
    # Parse UUIDs
    try:
        user_id = UUID(user_id_str)
        tenant_id = UUID(tenant_id_str)
    except (ValueError, AttributeError) as e:
        raise ValueError(f"Invalid UUID format in token: {str(e)}")
    
    # For access tokens, extract role and permissions
    role = payload.get("role", "")
    permissions = payload.get("permissions", [])
    
    return TokenData(
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        permissions=permissions,
        token_type=token_type,
    )


def _get_role_permissions(role: str) -> list[str]:
    """
    Get default permissions for a role.
    
    Implements RBAC permission mapping:
    - admin: Full access to all resources
    - lawyer: Manage clients, processes, leads
    - assistant: View and update assigned items
    - viewer: Read-only access
    
    Args:
        role: User role string
    
    Returns:
        List of permission strings
    """
    admin_permissions = [
        "users:read",
        "users:write",
        "users:delete",
        "clients:read",
        "clients:write",
        "clients:delete",
        "processes:read",
        "processes:write",
        "processes:delete",
        "leads:read",
        "leads:write",
        "leads:delete",
        "tags:read",
        "tags:write",
        "tags:delete",
        "settings:read",
        "settings:write",
    ]

    role_permissions = {
        "super_admin": [
            *admin_permissions,
            "admin:read",
            "admin:write",
            "tenants:read",
            "tenants:write",
            "tenants:delete",
            "providers:read",
            "providers:write",
            "workers:read",
            "workers:write",
            "agents:read",
            "agents:write",
            "audit:read_all",
            "metrics:read_all",
        ],
        "admin": admin_permissions,
        "lawyer": [
            "clients:read",
            "clients:write",
            "processes:read",
            "processes:write",
            "leads:read",
            "leads:write",
            "tags:read",
            "tags:write",
        ],
        "assistant": [
            "clients:read",
            "clients:write",
            "processes:read",
            "leads:read",
            "leads:write",
            "tags:read",
        ],
        "viewer": [
            "clients:read",
            "processes:read",
            "leads:read",
            "tags:read",
        ],
    }
    
    return role_permissions.get(role, [])
