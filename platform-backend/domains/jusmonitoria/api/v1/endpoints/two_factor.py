"""Two-Factor Authentication (TOTP) endpoints."""

import json
import logging
import secrets
from typing import Annotated

import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_user
from domains.jusmonitoria.auth.password import verify_password
from domains.jusmonitoria.crypto import decrypt, encrypt
from domains.jusmonitoria.services.email_service import EmailService
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.schemas.two_factor import (
    TwoFactorDisableRequest,
    TwoFactorRegenerateBackupRequest,
    TwoFactorRegenerateBackupResponse,
    TwoFactorSetupResponse,
    TwoFactorStatusResponse,
    TwoFactorVerifyRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/2fa", tags=["Two-Factor Authentication"])


def _generate_backup_codes(count: int = 8) -> list[str]:
    """Generate a list of random backup codes."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


@router.get("/status", response_model=TwoFactorStatusResponse)
async def get_2fa_status(
    current_user: Annotated[User, Depends(get_current_user)],
) -> TwoFactorStatusResponse:
    """Get current 2FA status for the authenticated user."""
    return TwoFactorStatusResponse(
        enabled=current_user.totp_enabled,
        has_backup_codes=bool(current_user.backup_codes),
    )


@router.post("/setup", response_model=TwoFactorSetupResponse)
async def setup_2fa(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> TwoFactorSetupResponse:
    """
    Generate a new TOTP secret and QR code URI for 2FA setup.

    The user must verify the code with /2fa/verify to activate 2FA.
    """
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA já está ativado. Desative primeiro para reconfigurar.",
        )

    # Generate TOTP secret
    secret = pyotp.random_base32()

    # Generate QR code URI
    totp = pyotp.TOTP(secret)
    qr_uri = totp.provisioning_uri(
        name=current_user.email,
        issuer_name="JusMonitorIA",
    )

    # Generate backup codes
    backup_codes = _generate_backup_codes()

    # Store encrypted secret and backup codes (not yet enabled)
    current_user.totp_secret = encrypt(secret)
    current_user.backup_codes = encrypt(json.dumps(backup_codes))
    await session.commit()

    logger.info(
        "2FA setup initiated",
        extra={"user_id": str(current_user.id)},
    )

    return TwoFactorSetupResponse(
        secret=secret,
        qr_code_uri=qr_uri,
        backup_codes=backup_codes,
    )


@router.post("/verify", status_code=status.HTTP_200_OK)
async def verify_and_enable_2fa(
    data: TwoFactorVerifyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """
    Verify a TOTP code and enable 2FA.

    Must be called after /2fa/setup with a valid code from the authenticator app.
    """
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA já está ativado.",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Execute /2fa/setup primeiro.",
        )

    # Decrypt and verify
    secret = decrypt(current_user.totp_secret)
    totp = pyotp.TOTP(secret)

    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código inválido. Verifique seu aplicativo autenticador e tente novamente.",
        )

    # Enable 2FA
    current_user.totp_enabled = True
    await session.commit()

    logger.info(
        "2FA enabled successfully",
        extra={"user_id": str(current_user.id)},
    )

    # Send notification email
    await EmailService.send_2fa_notification_email(
        name=current_user.full_name or current_user.email,
        email=current_user.email,
        action="ativada",
    )

    return {"message": "Autenticação de dois fatores ativada com sucesso."}


@router.post("/disable", status_code=status.HTTP_200_OK)
async def disable_2fa(
    data: TwoFactorDisableRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Disable 2FA. Requires password confirmation."""
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA não está ativado.",
        )

    # Verify password
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Senha incorreta.",
        )

    # Disable 2FA and clear secrets
    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.backup_codes = None
    await session.commit()

    logger.info(
        "2FA disabled",
        extra={"user_id": str(current_user.id)},
    )

    # Send notification email
    await EmailService.send_2fa_notification_email(
        name=current_user.full_name or current_user.email,
        email=current_user.email,
        action="desativada",
    )

    return {"message": "Autenticação de dois fatores desativada."}


@router.post("/regenerate-backup-codes", response_model=TwoFactorRegenerateBackupResponse)
async def regenerate_backup_codes(
    data: TwoFactorRegenerateBackupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> TwoFactorRegenerateBackupResponse:
    """Regenerate backup codes. Requires 2FA to be enabled and password confirmation."""
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA não está ativado.",
        )

    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Senha incorreta.",
        )

    backup_codes = _generate_backup_codes()
    current_user.backup_codes = encrypt(json.dumps(backup_codes))
    await session.commit()

    logger.info(
        "Backup codes regenerated",
        extra={"user_id": str(current_user.id)},
    )

    return TwoFactorRegenerateBackupResponse(backup_codes=backup_codes)


def verify_totp_code(user: User, code: str) -> bool:
    """
    Verify a TOTP code or backup code for a user.

    Returns True if valid, False otherwise.
    Used by the login endpoint for 2FA verification.
    """
    if not user.totp_secret:
        return False

    secret = decrypt(user.totp_secret)
    totp = pyotp.TOTP(secret)

    # Try TOTP code first
    if totp.verify(code, valid_window=1):
        return True

    # Try backup codes
    if user.backup_codes and len(code) == 8:
        try:
            codes = json.loads(decrypt(user.backup_codes))
            if code.upper() in codes:
                # Remove used backup code
                codes.remove(code.upper())
                user.backup_codes = encrypt(json.dumps(codes)) if codes else None
                return True
        except (json.JSONDecodeError, Exception):
            pass

    return False
