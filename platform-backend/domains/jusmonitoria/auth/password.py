"""Password utils — delegates to platform_core shared implementation."""

from platform_core.auth.password import hash_password, verify_password

__all__ = ["hash_password", "verify_password"]
