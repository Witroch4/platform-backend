"""Audit log model for security and compliance."""

from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class AuditLog(TenantBaseModel):
    """
    Audit log model for tracking all user actions.
    
    Records all significant actions for security auditing,
    compliance, and debugging purposes.
    """
    
    __tablename__ = "audit_logs"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="User who performed the action",
    )
    
    # Action information
    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Action performed (create, update, delete, etc.)",
    )
    
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Type of entity affected",
    )
    
    entity_id: Mapped[UUID] = mapped_column(
        nullable=False,
        index=True,
        comment="ID of entity affected",
    )
    
    # Data changes
    old_values: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Previous values before change",
    )
    
    new_values: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="New values after change",
    )
    
    # Request context
    ip_address: Mapped[Optional[str]] = mapped_column(
        INET,
        nullable=True,
        comment="IP address of request",
    )
    
    user_agent: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="User agent string",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action}, entity={self.entity_type}:{self.entity_id})>"
