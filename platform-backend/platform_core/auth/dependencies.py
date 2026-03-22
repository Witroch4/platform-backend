"""Generic FastAPI auth dependencies — domain-agnostic building blocks.

Domains compose these with their own user-lookup logic.
Example: JusMonitorIA's ``get_current_user`` calls ``get_token_data()``
then fetches the User from its own DB.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from platform_core.auth.jwt import TokenData, verify_token
from platform_core.config import settings

security = HTTPBearer()


def get_token_data(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> TokenData:
    """Extract and verify JWT Bearer token, returning decoded ``TokenData``.

    Raises:
        HTTPException 401: If token is missing, expired, or invalid.
    """
    try:
        return verify_token(credentials.credentials, expected_type="access")
    except (JWTError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def inject_token_state(request: Request, token_data: TokenData) -> None:
    """Inject decoded JWT claims into ``request.state`` for downstream use.

    Sets: ``tenant_id``, ``user_id``, ``user_role``, ``permissions``.
    """
    request.state.tenant_id = token_data.tenant_id
    request.state.user_id = token_data.user_id
    request.state.user_role = token_data.role
    request.state.permissions = token_data.permissions


def require_api_key(
    x_internal_api_key: Annotated[str | None, Header(alias="X-Internal-API-Key")] = None,
) -> str:
    """Validate service-to-service ``X-Internal-API-Key`` header.

    Returns the validated key on success.

    Raises:
        HTTPException 401: If key is missing or does not match.
    """
    if x_internal_api_key != settings.platform_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
    return x_internal_api_key
