"""Timeline event model for unified activity tracking."""

from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class TimelineEvent(TenantBaseModel):
    """
    Timeline event model for unified activity tracking.
    
    Tracks all activities across the system in a single timeline
    that can be filtered by entity type and entity ID.
    Supports polymorphic relationships to clients, leads, cases, etc.
    """
    
    __tablename__ = "timeline_events"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    created_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who created this event",
    )
    
    # Polymorphic entity reference
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Type of entity (client, lead, legal_case, etc.)",
    )
    
    entity_id: Mapped[UUID] = mapped_column(
        nullable=False,
        index=True,
        comment="ID of the entity this event belongs to",
    )
    
    # Event information
    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Type of event (message_received, movement_detected, etc.)",
    )
    
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Event title",
    )
    
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Detailed event description",
    )
    
    # Metadata
    event_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Additional event data",
    )
    
    # Source
    source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="system",
        comment="Event source (system, user, chatwit, datajud, ai)",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    creator: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<TimelineEvent(id={self.id}, type={self.event_type}, entity={self.entity_type}:{self.entity_id})>"
