"""Event model for system-wide event tracking."""

from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class Event(TenantBaseModel):
    """
    Event model for system-wide event tracking and processing.
    
    Used by the event bus for async processing and automation triggers.
    Different from TimelineEvent which is user-facing.
    """
    
    __tablename__ = "events"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Event information
    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Type of event for routing",
    )
    
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Type of entity that triggered event",
    )
    
    entity_id: Mapped[UUID] = mapped_column(
        nullable=False,
        index=True,
        comment="ID of entity that triggered event",
    )
    
    # Payload
    payload: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Event payload data",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<Event(id={self.id}, type={self.event_type}, entity={self.entity_type}:{self.entity_id})>"
