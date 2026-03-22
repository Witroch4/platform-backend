"""Pydantic schemas for Two-Factor Authentication."""

from pydantic import BaseModel, Field


class TwoFactorSetupResponse(BaseModel):
    """Response with TOTP secret and QR code URI for setup."""

    secret: str = Field(..., description="TOTP secret key (base32)")
    qr_code_uri: str = Field(..., description="otpauth:// URI for QR code generation")
    backup_codes: list[str] = Field(..., description="One-time backup codes")


class TwoFactorVerifyRequest(BaseModel):
    """Request to verify a TOTP code (used during setup and login)."""

    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit TOTP code from authenticator app",
    )


class TwoFactorDisableRequest(BaseModel):
    """Request to disable 2FA."""

    password: str = Field(
        ...,
        min_length=8,
        description="Current password for confirmation",
    )


class TwoFactorStatusResponse(BaseModel):
    """Response indicating 2FA status."""

    enabled: bool
    has_backup_codes: bool = False


class TwoFactorRegenerateBackupRequest(BaseModel):
    """Request to regenerate backup codes (requires password)."""

    password: str = Field(
        ...,
        min_length=8,
        description="Current password for confirmation",
    )


class TwoFactorRegenerateBackupResponse(BaseModel):
    """Response with new backup codes."""

    backup_codes: list[str] = Field(..., description="New one-time backup codes")


class TwoFactorLoginRequest(BaseModel):
    """Request for 2FA step during login."""

    temp_token: str = Field(..., description="Temporary token from login step 1")
    code: str = Field(
        ...,
        min_length=6,
        max_length=8,
        description="6-digit TOTP code or 8-char backup code",
    )


class TwoFactorLoginResponse(BaseModel):
    """Response indicating 2FA is required on login."""

    requires_2fa: bool = True
    temp_token: str = Field(..., description="Temporary token for 2FA verification")
