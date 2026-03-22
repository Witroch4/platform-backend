"""Briefing model for daily summaries."""

from datetime import date
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class Briefing(TenantBaseModel):
    """
    Briefing model for daily AI-generated summaries.
    
    Contains categorized updates (urgent, attention, good news, noise)
    and executive summary for the day.
    """
    
    __tablename__ = "briefings"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Briefing date
    briefing_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
        comment="Date this briefing covers",
    )
    
    # Content
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Full briefing content (markdown)",
    )
    
    # Structured data
    urgent_items: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="Urgent cases requiring immediate attention",
    )
    
    attention_items: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="Cases requiring attention",
    )
    
    good_news_items: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="Positive updates",
    )
    
    noise_items: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="Low-priority updates",
    )
    
    # Metadata
    briefing_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Additional briefing metadata (stats, etc.)",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<Briefing(id={self.id}, date={self.briefing_date})>"
