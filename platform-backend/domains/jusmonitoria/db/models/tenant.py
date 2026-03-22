"""Tenant model for multi-tenant isolation."""

from typing import Optional

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import BaseModel


class Tenant(BaseModel):
    """
    Tenant model representing a law firm/office.
    
    All other entities in the system are associated with a tenant
    to ensure complete data isolation between different law firms.
    """
    
    __tablename__ = "tenants"
    
    # Basic information
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Law firm name",
    )
    
    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
        comment="URL-friendly identifier",
    )
    
    # Plan and status
    plan: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="basic",
        comment="Subscription plan (basic, professional, enterprise)",
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Whether tenant is active",
    )
    
    # Chatwit integration
    chatwit_account_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        unique=True,
        index=True,
        comment="Chatwit account_id for webhook routing",
    )
    chatwit_access_token_encrypted: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Fernet-encrypted Chatwit admin ACCESS_TOKEN",
    )
    chatwit_access_token_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
        index=True,
        comment="SHA256 hash of ACCESS_TOKEN for O(1) tenant lookup",
    )
    chatwit_webhook_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="ID of registered webhook in Chatwit for lifecycle management",
    )

    # Configuration
    settings: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Tenant-specific settings and preferences",
    )
    
    # Relationships
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )
    
    def __repr__(self) -> str:
        return f"<Tenant(id={self.id}, slug={self.slug}, name={self.name})>"
