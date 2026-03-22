"""Case movement model for tracking legal process updates."""

from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from domains.jusmonitoria.db.base import TenantBaseModel


class CaseMovement(TenantBaseModel):
    """
    Case movement model representing updates to legal processes.
    
    Movements are fetched from DataJud API and analyzed by AI
    to determine importance and required actions.
    Includes pgvector embedding for semantic search.
    """
    
    __tablename__ = "case_movements"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "legal_case_id", "content_hash",
            name="uq_case_movements_tenant_case_hash"
        ),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    legal_case_id: Mapped[UUID] = mapped_column(
        ForeignKey("legal_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Legal case this movement belongs to",
    )
    
    # Movement data
    movement_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
        comment="Date of the movement",
    )
    
    movement_type: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Type of movement",
    )
    
    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Full description of the movement",
    )
    
    # Deduplication
    content_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="SHA256 hash of content for deduplication",
    )
    
    # AI analysis
    is_important: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="Whether AI classified as important",
    )
    
    ai_summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="AI-generated summary",
    )
    
    requires_action: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="Whether movement requires action",
    )
    
    # Embedding for semantic search (1536 dimensions for OpenAI text-embedding-3-small)
    embedding: Mapped[Optional[Vector]] = mapped_column(
        Vector(1536),
        nullable=True,
        comment="Vector embedding for semantic search",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    legal_case: Mapped["LegalCase"] = relationship(
        "LegalCase",
        foreign_keys=[legal_case_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<CaseMovement(id={self.id}, case={self.legal_case_id}, date={self.movement_date})>"
