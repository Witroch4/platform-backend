"""User model for authentication and authorization."""

import enum
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class UserRole(str, enum.Enum):
    """User roles for RBAC."""

    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    LAWYER = "lawyer"
    ASSISTANT = "assistant"
    VIEWER = "viewer"


class User(TenantBaseModel):
    """
    User model for authentication and authorization.
    
    Users belong to a tenant (law firm) and have specific roles
    that determine their permissions within the system.
    """
    
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Authentication
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="User email address (unique per tenant)",
    )
    
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Bcrypt hashed password",
    )
    
    # Profile
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="User full name",
    )

    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="User phone number",
    )

    avatar_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="URL to user avatar image",
    )

    oab_number: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="OAB registration number (digits only)",
    )

    oab_state: Mapped[Optional[str]] = mapped_column(
        String(2),
        nullable=True,
        comment="OAB state (2-letter code, e.g. SP, RJ)",
    )

    cpf: Mapped[Optional[str]] = mapped_column(
        String(14),
        nullable=True,
        comment="User CPF (digits only, stored as 11 digits)",
    )

    # Authorization
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        nullable=False,
        default=UserRole.LAWYER,
        index=True,
        comment="User role for RBAC",
    )
    
    
    # Status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Whether user account is active",
    )
    
    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Whether user has verified their email",
    )
    
    verification_token: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
        comment="Token for email verification",
    )
    
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Last login timestamp",
    )

    password_reset_token: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
        comment="Token for password reset",
    )

    password_reset_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Password reset token expiration",
    )

    # Two-Factor Authentication
    totp_secret: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Encrypted TOTP secret for 2FA",
    )

    totp_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Whether 2FA is enabled",
    )

    backup_codes: Mapped[Optional[str]] = mapped_column(
        String(2000),
        nullable=True,
        comment="JSON-encoded encrypted backup codes for 2FA",
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )

    oabs: Mapped[list["UserOAB"]] = relationship(
        "UserOAB",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="UserOAB.is_primary.desc()",
    )

    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
    
    def has_role(self, *roles: UserRole) -> bool:
        """Check if user has any of the specified roles."""
        return self.role in roles
    
    def is_admin(self) -> bool:
        """Check if user is an admin."""
        return self.role == UserRole.ADMIN

    def is_super_admin(self) -> bool:
        """Check if user is a super admin."""
        return self.role == UserRole.SUPER_ADMIN
