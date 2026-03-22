"""User preference model for storing user-specific settings."""

from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class UserPreference(TenantBaseModel):
    """
    User preference model for storing user-specific settings.
    
    Stores preferences like dashboard filters, view settings, and other
    personalization options.
    """
    
    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "preference_key", name="uq_user_preferences_tenant_user_key"),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="User who owns this preference",
    )
    
    # Preference data
    preference_key: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Preference key (e.g., 'dashboard_filters', 'theme')",
    )
    
    preference_value: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Preference value as JSON",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<UserPreference(user={self.user_id}, key={self.preference_key})>"

