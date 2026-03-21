"""Timeline embedding model for semantic search."""

from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from domains.jusmonitoria.db.base import TenantBaseModel


class TimelineEmbedding(TenantBaseModel):
    """
    Timeline embedding model for semantic search of events.
    
    Stores vector embeddings of timeline events to enable
    semantic search across all activities.
    """
    
    __tablename__ = "timeline_embeddings"
    __table_args__ = (
        UniqueConstraint("timeline_event_id", name="uq_timeline_embeddings_event"),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    timeline_event_id: Mapped[UUID] = mapped_column(
        ForeignKey("timeline_events.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        comment="Timeline event this embedding belongs to",
    )
    
    # Embedding (1536 dimensions for OpenAI text-embedding-3-small)
    embedding: Mapped[Vector] = mapped_column(
        Vector(1536),
        nullable=False,
        comment="Vector embedding for semantic search",
    )
    
    # Model information
    model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="text-embedding-3-small",
        comment="Embedding model used",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    timeline_event: Mapped["TimelineEvent"] = relationship(
        "TimelineEvent",
        foreign_keys=[timeline_event_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<TimelineEmbedding(id={self.id}, event={self.timeline_event_id})>"
