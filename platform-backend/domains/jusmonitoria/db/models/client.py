"""Client model for CRM management."""

import enum
from typing import Optional
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class ClientStatus(str, enum.Enum):
    """Client status."""
    
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class Client(TenantBaseModel):
    """
    Client model representing active clients of the law firm.
    
    Clients can be created directly or converted from leads.
    They have associated legal cases and a complete 360° profile.
    """
    
    __tablename__ = "clients"
    
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
        comment="Lawyer responsible for this client",
    )
    
    lead_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
        comment="Original lead if converted",
    )
    
    # Personal information
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Client full name",
    )
    
    cpf_cnpj: Mapped[Optional[str]] = mapped_column(
        String(18),
        nullable=True,
        comment="CPF or CNPJ",
    )
    
    email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Email address",
    )
    
    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Phone number",
    )
    
    # Address
    address: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Address information",
    )
    
    # Chatwit integration
    chatwit_contact_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="Chatwit contact ID for messaging",
    )
    
    # Status and health
    status: Mapped[ClientStatus] = mapped_column(
        Enum(ClientStatus, name="client_status", native_enum=False),
        nullable=False,
        default=ClientStatus.ACTIVE,
        index=True,
        comment="Client status",
    )
    
    health_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=100,
        comment="Client health score (0-100)",
    )
    
    # Notes and metadata
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Internal notes about client",
    )
    
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
    
    assigned_user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[assigned_to],
        lazy="selectin",
    )
    
    source_lead: Mapped[Optional["Lead"]] = relationship(
        "Lead",
        foreign_keys=[lead_id],
        lazy="selectin",
    )
    
    # Back references (defined in other models)
    # legal_cases: Mapped[list["LegalCase"]] = relationship(back_populates="client")
    # timeline_events: Mapped[list["TimelineEvent"]] = relationship(...)
    
    def __repr__(self) -> str:
        return f"<Client(id={self.id}, name={self.full_name}, status={self.status})>"
