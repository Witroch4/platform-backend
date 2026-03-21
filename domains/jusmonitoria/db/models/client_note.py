"""Client note model for internal notes with mentions."""

from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class ClientNote(TenantBaseModel):
    """
    Client note model for internal notes about clients.
    
    Supports markdown formatting and @mentions of users.
    Mentioned users receive notifications.
    """
    
    __tablename__ = "client_notes"
    
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
        comment="Client this note belongs to",
    )
    
    author_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
        comment="User who created this note",
    )
    
    # Content
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Note content in markdown format",
    )
    
    # Mentions
    mentions: Mapped[list[UUID]] = mapped_column(
        ARRAY(String),
        nullable=False,
        default=list,
        server_default="{}",
        comment="List of mentioned user IDs",
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
    
    author: Mapped["User"] = relationship(
        "User",
        foreign_keys=[author_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<ClientNote(id={self.id}, client_id={self.client_id}, author_id={self.author_id})>"
