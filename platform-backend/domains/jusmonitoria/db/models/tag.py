"""Tag models for organizing clients and cases."""

from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class Tag(TenantBaseModel):
    """
    Tag model for organizing and categorizing entities.
    
    Tags can be applied to clients, legal cases, and leads
    for flexible organization and filtering.
    """
    
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_tags_tenant_name"),
    )
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Tag information
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Tag name (unique per tenant)",
    )
    
    color: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        default="#3B82F6",
        comment="Hex color code for UI display",
    )
    
    category: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="Optional category for grouping tags",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<Tag(id={self.id}, name={self.name})>"


class ClientTag(TenantBaseModel):
    """Association table for client-tag many-to-many relationship."""
    
    __tablename__ = "client_tags"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_id", "tag_id", name="uq_client_tags_tenant_client_tag"),
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
    )
    
    tag_id: Mapped[UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
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
    
    tag: Mapped["Tag"] = relationship(
        "Tag",
        foreign_keys=[tag_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<ClientTag(client={self.client_id}, tag={self.tag_id})>"


class LegalCaseTag(TenantBaseModel):
    """Association table for legal_case-tag many-to-many relationship."""
    
    __tablename__ = "legal_case_tags"
    __table_args__ = (
        UniqueConstraint("tenant_id", "legal_case_id", "tag_id", name="uq_legal_case_tags_tenant_case_tag"),
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
    )
    
    tag_id: Mapped[UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
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
    
    tag: Mapped["Tag"] = relationship(
        "Tag",
        foreign_keys=[tag_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<LegalCaseTag(case={self.legal_case_id}, tag={self.tag_id})>"
