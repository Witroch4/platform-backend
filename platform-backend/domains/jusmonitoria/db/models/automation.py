"""Automation model for configurable workflows."""

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class Automation(TenantBaseModel):
    """
    Automation model for configurable workflows.
    
    Defines triggers and actions that execute automatically
    when certain events occur in the system.
    """
    
    __tablename__ = "automations"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Automation configuration
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Automation name",
    )
    
    description: Mapped[str] = mapped_column(
        Text,
        nullable=True,
        comment="Automation description",
    )
    
    # Trigger configuration
    trigger_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Event type that triggers this automation",
    )
    
    trigger_conditions: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Conditions that must be met to trigger",
    )
    
    # Actions to execute
    actions: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="Array of actions to execute",
    )
    
    # Status
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Whether automation is enabled",
    )
    
    # Metadata
    automation_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Additional automation metadata",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<Automation(id={self.id}, name={self.name}, enabled={self.enabled})>"
