"""Pydantic schemas for authentication endpoints."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class LoginRequest(BaseModel):
    """Login request payload."""

    email: EmailStr = Field(
        ...,
        description="User email address",
        examples=["user@example.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="User password",
    )


class RegisterRequest(BaseModel):
    """Registration request payload."""
    
    email: EmailStr = Field(
        ...,
        description="Email address of the owner",
        examples=["owner@example.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Password for the new account",
    )
    full_name: str = Field(
        ...,
        min_length=2,
        description="Full name of the user",
        examples=["João da Silva"],
    )
    firm_name: str = Field(
        ...,
        min_length=2,
        description="Name of the law firm / tenant",
        examples=["Silva & Associados Advogados"],
    )
    oab_number: Optional[str] = Field(
        default=None,
        description="OAB registration number (digits only)",
    )
    oab_state: Optional[str] = Field(
        default=None,
        max_length=2,
        description="OAB state (2-letter code, e.g. SP, RJ)",
    )


class VerifyEmailRequest(BaseModel):
    """Email verification request payload."""
    token: str = Field(
        ...,
        description="Verification UUID token sent via email",
    )


class LoginUserInfo(BaseModel):
    """User info returned in login response."""

    id: UUID
    email: str
    full_name: str
    role: str
    tenant_id: UUID
    is_super_admin: bool = False

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response payload."""

    access_token: str = Field(
        ...,
        description="JWT access token",
    )
    refresh_token: str = Field(
        ...,
        description="JWT refresh token",
    )
    token_type: str = Field(
        default="bearer",
        description="Token type",
    )
    expires_in: int = Field(
        ...,
        description="Access token expiration time in seconds",
    )
    user: LoginUserInfo | None = Field(
        default=None,
        description="Authenticated user info",
    )


class RefreshTokenRequest(BaseModel):
    """Refresh token request payload."""
    
    refresh_token: str = Field(
        ...,
        description="JWT refresh token",
    )


class ForgotPasswordRequest(BaseModel):
    """Forgot password request payload."""

    email: EmailStr = Field(
        ...,
        description="Email address associated with the account",
    )


class ResetPasswordRequest(BaseModel):
    """Reset password request payload."""

    token: str = Field(
        ...,
        description="Password reset token received via email",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        description="New password",
    )
    confirm_password: str = Field(
        ...,
        min_length=8,
        description="Password confirmation",
    )

    @model_validator(mode="after")
    def validate_passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Senhas não conferem")
        return self


class UserInfo(BaseModel):
    """User information in token response."""

    user_id: UUID
    email: str
    full_name: str
    role: str
    tenant_id: UUID
    is_super_admin: bool = False
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    oab_number: Optional[str] = None
    oab_state: Optional[str] = None

    class Config:
        from_attributes = True
