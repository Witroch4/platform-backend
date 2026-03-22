"""AI conversation model for tracking agent interactions."""

from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class AIConversation(TenantBaseModel):
    """
    AI conversation model for tracking interactions with AI agents.
    
    Stores conversation history for context and debugging.
    """
    
    __tablename__ = "ai_conversations"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    client_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Client associated with conversation",
    )
    
    lead_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Lead associated with conversation",
    )
    
    # Conversation metadata
    conversation_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Type of conversation (triagem, investigacao, redacao, etc.)",
    )
    
    agent_name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Name of AI agent",
    )
    
    # Messages (array of message objects)
    messages: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="Array of conversation messages",
    )
    
    # Result
    result: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Final result of conversation",
    )
    
    # Metadata
    conversation_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Additional conversation metadata",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    client: Mapped[Optional["Client"]] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )
    
    lead: Mapped[Optional["Lead"]] = relationship(
        "Lead",
        foreign_keys=[lead_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<AIConversation(id={self.id}, type={self.conversation_type}, agent={self.agent_name})>"
