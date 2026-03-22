"""Shared authentication and authorization module."""

from platform_core.auth.jwt import (
    TokenPayload,
    TokenData,
    create_access_token,
    create_refresh_token,
    verify_token,
)
from platform_core.auth.password import hash_password, verify_password
from platform_core.auth.dependencies import get_token_data, inject_token_state, require_api_key

__all__ = [
    "TokenPayload",
    "TokenData",
    "create_access_token",
    "create_refresh_token",
    "verify_token",
    "hash_password",
    "verify_password",
    "get_token_data",
    "inject_token_state",
    "require_api_key",
]
