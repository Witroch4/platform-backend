"""User integration model for storing OAuth tokens and integration states."""

import enum
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class IntegrationType(str, enum.Enum):
    """Supported integration types."""

    INSTAGRAM = "instagram"
    CHATWIT = "chatwit"


class UserIntegration(TenantBaseModel):
    """
    Stores OAuth tokens and integration metadata per user per integration.

    Tokens are encrypted at rest using Fernet symmetric encryption.
    """

    __tablename__ = "user_integrations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "user_id",
            "integration_type",
            name="uq_user_integrations_tenant_user_type",
        ),
    )

    # Foreign keys
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    integration_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Integration type: instagram, chatwit",
    )

    # Encrypted token stored as base64 string
    access_token_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Fernet-encrypted OAuth access token",
    )

    token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # External platform info
    external_user_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="User ID on the external platform",
    )

    external_username: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    external_profile_picture_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    extra_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default="{}",
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="selectin",
    )
