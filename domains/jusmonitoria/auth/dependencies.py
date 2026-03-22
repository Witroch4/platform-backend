"""FastAPI dependencies for authentication and authorization."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.auth.dependencies import security, get_token_data, inject_token_state
from platform_core.auth.jwt import TokenData
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User, UserRole
from domains.jusmonitoria.db.repositories.user_repository import UserRepository


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> User:
    """
    Get current authenticated user from JWT token.

    Validates token, extracts user_id and tenant_id,
    and fetches user from database.

    Args:
        request: FastAPI request object
        credentials: HTTP Bearer token credentials
        session: Database session

    Returns:
        Authenticated User object

    Raises:
        HTTPException: 401 if token invalid or user not found
    """
    token_data: TokenData = get_token_data(credentials)

    # Fetch user from database
    user_repo = UserRepository(session, token_data.tenant_id)
    user = await user_repo.get_by_id(token_data.user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    # Inject tenant_id into request state for middleware
    inject_token_state(request, token_data)

    return user


def require_role(*allowed_roles: UserRole):
    """
    Dependency factory to require specific user roles.

    Usage:
        @router.get("/admin")
        async def admin_endpoint(
            user: Annotated[User, Depends(require_role(UserRole.ADMIN))]
        ):
            ...

    Args:
        *allowed_roles: One or more UserRole values

    Returns:
        Dependency function that validates user role
    """
    async def role_checker(
        user: Annotated[User, Depends(get_current_user)]
    ) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {[r.value for r in allowed_roles]}",
            )
        return user

    return role_checker


def require_permission(*required_permissions: str):
    """
    Dependency factory to require specific permissions.

    Usage:
        @router.delete("/clients/{client_id}")
        async def delete_client(
            user: Annotated[User, Depends(require_permission("clients:delete"))]
        ):
            ...

    Args:
        *required_permissions: One or more permission strings

    Returns:
        Dependency function that validates user permissions
    """
    async def permission_checker(
        request: Request,
        user: Annotated[User, Depends(get_current_user)]
    ) -> User:
        user_permissions = getattr(request.state, "permissions", [])

        # Check if user has all required permissions
        missing_permissions = [
            perm for perm in required_permissions
            if perm not in user_permissions
        ]

        if missing_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permissions: {missing_permissions}",
            )

        return user

    return permission_checker


async def verify_tenant_access(
    request: Request,
    resource_tenant_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    """
    Verify that user's tenant_id matches the resource's tenant_id.

    This prevents cross-tenant data access by ensuring the authenticated
    user can only access resources belonging to their tenant.

    Args:
        request: FastAPI request object
        resource_tenant_id: Tenant ID of the resource being accessed
        user: Current authenticated user

    Raises:
        HTTPException: 403 if tenant_id mismatch
    """
    token_tenant_id = getattr(request.state, "tenant_id", None)

    if not token_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant identification missing from token",
        )

    # Super admins can access any tenant's resources
    user_role = getattr(request.state, "user_role", "")
    if user_role == UserRole.SUPER_ADMIN.value:
        return

    if token_tenant_id != resource_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: resource belongs to different tenant",
        )


# Convenience type aliases for common dependencies
CurrentUser = Annotated[User, Depends(get_current_user)]
SuperAdminUser = Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))]
AdminUser = Annotated[User, Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))]
LawyerUser = Annotated[User, Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.LAWYER))]


async def get_current_tenant_id(
    request: Request,
    user: CurrentUser,
) -> UUID:
    """
    Get current tenant ID from authenticated user.

    Args:
        request: FastAPI request object
        user: Current authenticated user

    Returns:
        Tenant ID
    """
    tenant_id = getattr(request.state, "tenant_id", None)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant identification missing",
        )

    return tenant_id
