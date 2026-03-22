"""Legal case model for process monitoring."""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class LegalCase(TenantBaseModel):
    """
    Legal case model representing judicial processes being monitored.
    
    Cases are associated with clients and monitored via DataJud API.
    They contain movements, deadlines, and AI-generated insights.
    """
    
    __tablename__ = "legal_cases"
    __table_args__ = (
        UniqueConstraint("tenant_id", "cnj_number", name="uq_legal_cases_tenant_cnj"),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    client_id: Mapped[UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Client associated with this case",
    )
    
    # CNJ identification
    cnj_number: Mapped[str] = mapped_column(
        String(25),
        nullable=False,
        comment="CNJ process number (NNNNNNN-DD.AAAA.J.TR.OOOO)",
    )
    
    # Case information
    court: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Court name",
    )
    
    case_type: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Type of legal case",
    )
    
    subject: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Case subject/matter",
    )
    
    status: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Current case status",
    )
    
    # Parties
    plaintiff: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Plaintiff(s) in the case",
    )
    
    defendant: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Defendant(s) in the case",
    )
    
    # Important dates
    filing_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Date case was filed",
    )
    
    last_movement_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        index=True,
        comment="Date of last movement",
    )
    
    next_deadline: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        index=True,
        comment="Next important deadline",
    )
    
    # Monitoring configuration
    monitoring_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Whether to monitor this case",
    )
    
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Last sync with DataJud",
    )
    
    sync_frequency_hours: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=6,
        comment="How often to sync (in hours)",
    )
    
    # Metadata
    custom_fields: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Custom fields for tenant-specific data",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    client: Mapped["Client"] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )
    
    # Back references (defined in other models)
    # movements: Mapped[list["CaseMovement"]] = relationship(back_populates="legal_case")
    
    def __repr__(self) -> str:
        return f"<LegalCase(id={self.id}, cnj={self.cnj_number}, client={self.client_id})>"
