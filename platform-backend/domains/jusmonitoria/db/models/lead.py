"""Lead model for CRM funnel management."""

import enum
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class LeadStatus(str, enum.Enum):
    """Lead status in the funnel."""
    
    ACTIVE = "active"
    CONVERTED = "converted"
    LOST = "lost"
    ARCHIVED = "archived"


class LeadStage(str, enum.Enum):
    """Lead stage in the sales funnel."""
    
    NEW = "novo"
    CONTACTED = "contatado"
    QUALIFIED = "qualificado"
    PROPOSAL = "proposta"
    NEGOTIATION = "negociacao"
    CONVERTED = "convertido"


class LeadSource(str, enum.Enum):
    """Lead acquisition source."""
    
    CHATWIT = "chatwit"
    WEBSITE = "website"
    REFERRAL = "indicacao"
    SOCIAL_MEDIA = "redes_sociais"
    ADVERTISING = "publicidade"
    OTHER = "outro"


class Lead(TenantBaseModel):
    """
    Lead model representing potential clients in the CRM funnel.
    
    Leads are qualified through AI analysis and can be converted
    to clients when they hire the law firm's services.
    """
    
    __tablename__ = "leads"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    assigned_to: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="User responsible for this lead",
    )
    
    converted_to_client_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        comment="Client created from this lead",
    )
    
    # Basic information
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Lead full name",
    )
    
    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Phone number",
    )
    
    email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Email address",
    )
    
    # Origin
    source: Mapped[LeadSource] = mapped_column(
        Enum(LeadSource, name="lead_source", native_enum=False),
        nullable=False,
        default=LeadSource.CHATWIT,
        index=True,
        comment="Lead acquisition source",
    )
    
    chatwit_contact_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="Chatwit contact ID for integration",
    )

    instagram_username: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Instagram username for DM leads",
    )

    instagram_profile_picture_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Cached Instagram profile picture URL",
    )
    
    # Funnel management
    stage: Mapped[LeadStage] = mapped_column(
        Enum(LeadStage, name="lead_stage", native_enum=False),
        nullable=False,
        default=LeadStage.NEW,
        index=True,
        comment="Current stage in sales funnel",
    )
    
    score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        index=True,
        comment="Lead quality score (0-100)",
    )
    
    # AI analysis
    ai_summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="AI-generated summary of lead qualification",
    )
    
    ai_recommended_action: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="AI-recommended next action",
    )
    
    # Status
    status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, name="lead_status", native_enum=False),
        nullable=False,
        default=LeadStatus.ACTIVE,
        index=True,
        comment="Lead status",
    )
    
    converted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When lead was converted to client",
    )
    
    # Metadata
    lead_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Additional lead metadata",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    assigned_user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[assigned_to],
        lazy="selectin",
    )
    
    converted_client: Mapped[Optional["Client"]] = relationship(
        "Client",
        foreign_keys=[converted_to_client_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<Lead(id={self.id}, name={self.full_name}, stage={self.stage}, score={self.score})>"
