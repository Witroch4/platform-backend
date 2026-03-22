"""Authentication endpoints."""

import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from domains.jusmonitoria.auth.dependencies import get_current_user
from domains.jusmonitoria.auth.jwt import create_access_token, create_refresh_token, verify_token
from domains.jusmonitoria.auth.password import verify_password
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.user_repository import UserRepository
from domains.jusmonitoria.db.repositories.tenant import TenantRepository
from domains.jusmonitoria.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LoginUserInfo,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserInfo,
    VerifyEmailRequest,
)
from domains.jusmonitoria.services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


# In-memory rate limiting (for production, use Redis)
_login_attempts: dict[str, list[datetime]] = {}
MAX_LOGIN_ATTEMPTS = 5
RATE_LIMIT_WINDOW_SECONDS = 60


def check_rate_limit(identifier: str) -> None:
    """
    Check if identifier has exceeded rate limit.
    
    Args:
        identifier: IP address or email to check
    
    Raises:
        HTTPException: 429 if rate limit exceeded
    """
    now = datetime.utcnow()
    
    # Clean old attempts
    if identifier in _login_attempts:
        _login_attempts[identifier] = [
            attempt for attempt in _login_attempts[identifier]
            if (now - attempt).total_seconds() < RATE_LIMIT_WINDOW_SECONDS
        ]
    
    # Check rate limit
    attempts = _login_attempts.get(identifier, [])
    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Please try again in {RATE_LIMIT_WINDOW_SECONDS} seconds.",
        )
    
    # Record attempt
    if identifier not in _login_attempts:
        _login_attempts[identifier] = []
    _login_attempts[identifier].append(now)


from unidecode import unidecode
import re
import uuid
from domains.jusmonitoria.auth.password import hash_password as get_password_hash
from domains.jusmonitoria.db.models.user import UserRole

def generate_slug(name: str) -> str:
    """Simple slug generator from firm name."""
    s = unidecode(name).lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    # Add random string to ensure uniqueness
    suffix = str(uuid.uuid4())[:6]
    return f"{s}-{suffix}"


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register new user and law firm",
    description="Registers a new tenant (law firm) and its owner, sending a confirmation email.",
)
async def register(
    request: Request,
    register_data: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Register a new user and tenant."""
    # Rate limit check by IP
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip)

    # 1. Check if email exists
    from sqlalchemy import select
    from domains.jusmonitoria.db.models.user import User
    
    result = await session.execute(
        select(User).where(User.email == register_data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
        
    # 2. Create Tenant
    tenant_repo = TenantRepository(session)
    slug = generate_slug(register_data.firm_name)
    
    tenant = await tenant_repo.create(
        name=register_data.firm_name,
        slug=slug,
        plan="basic"
    )
    
    # 3. Create User (Owner)
    verification_token = str(uuid.uuid4())
    
    user = User(
        tenant_id=tenant.id,
        email=register_data.email,
        password_hash=get_password_hash(register_data.password),
        full_name=register_data.full_name,
        role=UserRole.ADMIN,
        is_active=True,
        email_verified=False,
        verification_token=verification_token,
        oab_number=register_data.oab_number,
        oab_state=register_data.oab_state,
    )
    
    session.add(user)
    await session.commit()
    
    # 4. Send Confirmation Email
    await EmailService.send_verification_email(
        name=user.full_name,
        email=user.email,
        token=verification_token
    )
    
    logger.info(
        "New user registration completed",
        extra={
            "tenant_id": str(tenant.id),
            "user_id": str(user.id),
            "email": user.email,
        }
    )
    
    return {
        "message": "Registration successful. Please check your email to confirm your account."
    }


@router.post(
    "/verify-email",
    status_code=status.HTTP_200_OK,
    summary="Verify user email",
    description="Verify the email using the token sent upon registration.",
)
async def verify_email(
    verify_data: VerifyEmailRequest,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    from sqlalchemy import select
    from domains.jusmonitoria.db.models.user import User
    
    result = await session.execute(
        select(User).where(User.verification_token == verify_data.token)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
        
    if user.email_verified:
        return {"message": "Email already verified"}
        
    user.email_verified = True
    user.verification_token = None
    
    await session.commit()
    
    logger.info(
        "Email verified",
        extra={
            "user_id": str(user.id),
            "email": user.email,
        }
    )
    
    return {"message": "Email verified successfully"}



@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User login",
    description="Authenticate user with email and password. Returns access and refresh tokens.",
)
async def login(
    request: Request,
    login_data: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> TokenResponse:
    """
    Authenticate user and return JWT tokens.
    
    Rate limited to 5 attempts per minute per IP address.
    
    Args:
        request: FastAPI request object
        login_data: Login credentials
        session: Database session
    
    Returns:
        TokenResponse with access and refresh tokens
    
    Raises:
        HTTPException: 401 if credentials invalid
        HTTPException: 429 if rate limit exceeded
    """
    # Rate limiting by IP address
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip)

    # Fetch user by email globally (email is unique across tenants)
    from sqlalchemy import select
    result = await session.execute(
        select(User).where(User.email == login_data.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user:
        logger.warning(
            "Login failed: user not found",
            extra={
                "email": login_data.email,
                "ip": client_ip,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Verifica se e-mail foi validado
    if getattr(user, 'email_verified', True) is False:
        logger.warning(
            "Login failed: email not verified",
            extra={
                "email": login_data.email,
                "user_id": str(user.id),
                "ip": client_ip,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Por favor, verifique seu e-mail antes de fazer login. Cheque sua caixa de entrada.",
        )

    # Verify password
    if not verify_password(login_data.password, user.password_hash):
        logger.warning(
            "Login failed: invalid password",
            extra={
                "email": login_data.email,
                "user_id": str(user.id),
                "ip": client_ip,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    # Check if 2FA is enabled
    if getattr(user, 'totp_enabled', False) and user.totp_enabled:
        # Generate a short-lived temporary token for 2FA verification
        temp_token = create_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            role="2fa_pending",
        )

        logger.info(
            "Login requires 2FA verification",
            extra={
                "user_id": str(user.id),
                "email": user.email,
                "ip": client_ip,
            },
        )

        return {
            "requires_2fa": True,
            "temp_token": temp_token,
        }

    # Create tokens
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role.value,
    )

    refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
    )

    # Update last login timestamp
    from datetime import datetime as dt
    user.last_login_at = dt.utcnow()
    await session.commit()

    logger.info(
        "User logged in successfully",
        extra={
            "user_id": str(user.id),
            "email": user.email,
            "tenant_id": str(user.tenant_id),
            "ip": client_ip,
        },
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=LoginUserInfo(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            tenant_id=user.tenant_id,
            is_super_admin=user.is_super_admin(),
        ),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="Get a new access token using a valid refresh token.",
)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> TokenResponse:
    """
    Refresh access token using refresh token.
    
    Args:
        refresh_data: Refresh token request
        session: Database session
    
    Returns:
        TokenResponse with new access and refresh tokens
    
    Raises:
        HTTPException: 401 if refresh token invalid
    """
    try:
        # Verify refresh token
        token_data = verify_token(refresh_data.refresh_token, expected_type="refresh")
    except (JWTError, ValueError) as e:
        logger.warning(
            "Refresh token validation failed",
            extra={"error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token: {str(e)}",
        )
    
    # Fetch user to ensure they still exist and are active
    user_repo = UserRepository(session, token_data.tenant_id)
    user = await user_repo.get_by_id(token_data.user_id)
    
    if not user or not user.is_active:
        logger.warning(
            "Refresh token rejected: user not found or inactive",
            extra={
                "user_id": str(token_data.user_id),
                "tenant_id": str(token_data.tenant_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Create new tokens
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role.value,
    )
    
    new_refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
    )
    
    logger.info(
        "Access token refreshed",
        extra={
            "user_id": str(user.id),
            "tenant_id": str(user.tenant_id),
        },
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="User logout",
    description="Logout current user. Client should discard tokens.",
)
async def logout(
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    """
    Logout current user.
    
    Note: JWT tokens are stateless, so logout is handled client-side
    by discarding the tokens. This endpoint exists for logging purposes
    and future token blacklisting implementation.
    
    Args:
        user: Current authenticated user
    """
    logger.info(
        "User logged out",
        extra={
            "user_id": str(user.id),
            "email": user.email,
            "tenant_id": str(user.tenant_id),
        },
    )
    
    # In a production system with token blacklisting:
    # - Add token to Redis blacklist with TTL = token expiration
    # - Middleware checks blacklist on each request
    
    return None


@router.get(
    "/me",
    response_model=UserInfo,
    status_code=status.HTTP_200_OK,
    summary="Get current user",
    description="Get information about the currently authenticated user.",
)
async def get_me(
    user: Annotated[User, Depends(get_current_user)],
) -> UserInfo:
    """
    Get current user information.
    
    Args:
        user: Current authenticated user
    
    Returns:
        UserInfo with user details
    """
    return UserInfo(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        tenant_id=user.tenant_id,
        is_super_admin=user.is_super_admin(),
        phone=user.phone,
        avatar_url=user.avatar_url,
        oab_number=user.oab_number,
        oab_state=user.oab_state,
    )


@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Request password reset",
    description="Send a password reset link to the user's email. Always returns 200 to avoid email enumeration.",
)
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Request a password reset email."""
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"forgot:{client_ip}")

    from sqlalchemy import select
    from datetime import timedelta

    result = await session.execute(
        select(User).where(User.email == data.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if user:
        token = str(uuid.uuid4())
        user.password_reset_token = token
        user.password_reset_expires_at = (
            datetime.utcnow() + timedelta(hours=1)
        )
        await session.commit()

        await EmailService.send_password_reset_email(
            name=user.full_name,
            email=user.email,
            token=token,
        )

        logger.info(
            "Password reset email sent",
            extra={"user_id": str(user.id), "email": user.email},
        )
    else:
        logger.info(
            "Password reset requested for non-existent email",
            extra={"email": data.email},
        )

    return {
        "message": "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha."
    }


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Reset password with token",
    description="Reset the user's password using the token received via email.",
)
async def reset_password(
    data: ResetPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Reset password using a valid reset token."""
    from sqlalchemy import select

    result = await session.execute(
        select(User).where(
            User.password_reset_token == data.token,
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou expirado",
        )

    if (
        not user.password_reset_expires_at
        or user.password_reset_expires_at < datetime.utcnow()
    ):
        user.password_reset_token = None
        user.password_reset_expires_at = None
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token expirado. Solicite uma nova redefinição de senha.",
        )

    user.password_hash = get_password_hash(data.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    await session.commit()

    logger.info(
        "Password reset successful",
        extra={"user_id": str(user.id), "email": user.email},
    )

    return {"message": "Senha redefinida com sucesso. Faça login com sua nova senha."}


@router.post(
    "/verify-2fa",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify 2FA code during login",
    description="Second step of login when 2FA is enabled. Validates TOTP code and returns full tokens.",
)
async def verify_2fa_login(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    temp_token: str = None,
    code: str = None,
) -> TokenResponse:
    """Verify 2FA code and complete login."""
    from domains.jusmonitoria.schemas.two_factor import TwoFactorLoginRequest
    from domains.jusmonitoria.api.v1.endpoints.two_factor import verify_totp_code

    # Parse body manually to support both JSON body
    body = await request.json()
    temp_token = body.get("temp_token", temp_token)
    code = body.get("code", code)

    if not temp_token or not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="temp_token e code são obrigatórios.",
        )

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"2fa:{client_ip}")

    # Verify the temporary token
    try:
        token_data = verify_token(temp_token, expected_type="access")
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token temporário inválido ou expirado. Faça login novamente.",
        )

    # Fetch user
    from sqlalchemy import select as sa_select
    result = await session.execute(
        sa_select(User).where(User.id == token_data.user_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado ou 2FA não está ativo.",
        )

    # Verify TOTP code
    if not verify_totp_code(user, code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Código de verificação inválido.",
        )

    # Commit any backup code changes
    await session.commit()

    # Generate full tokens
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role.value,
    )

    refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
    )

    # Update last login
    from datetime import datetime as dt
    user.last_login_at = dt.utcnow()
    await session.commit()

    logger.info(
        "User logged in with 2FA",
        extra={
            "user_id": str(user.id),
            "email": user.email,
            "tenant_id": str(user.tenant_id),
            "ip": client_ip,
        },
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=LoginUserInfo(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            tenant_id=user.tenant_id,
            is_super_admin=user.is_super_admin(),
        ),
    )
