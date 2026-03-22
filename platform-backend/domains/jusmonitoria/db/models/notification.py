"""Notification database model."""

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, ForeignKey, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import Base


class NotificationType(str, Enum):
    """Types of notifications."""
    
    URGENT_MOVEMENT = "urgent_movement"  # Nova movimentação urgente
    QUALIFIED_LEAD = "qualified_lead"  # Lead qualificado automaticamente
    BRIEFING_AVAILABLE = "briefing_available"  # Briefing matinal disponível
    MENTION = "mention"  # Menção em nota


class Notification(Base):
    """
    Notification model for real-time user notifications.
    
    Stores notifications that are sent to users via WebSocket
    and displayed in the notification center.
    """

    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    
    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    type: Mapped[NotificationType] = mapped_column(
        SQLEnum(NotificationType, name="notification_type"),
        nullable=False,
        index=True,
    )
    
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    
    read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )
    
    # Metadata for linking to related entities
    notification_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSON,
        nullable=True,
        default=dict,
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )
    
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        back_populates="notifications",
    )
    
    user: Mapped["User"] = relationship(
        "User",
        back_populates="notifications",
    )
    
    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, type={self.type}, user_id={self.user_id}, read={self.read})>"
