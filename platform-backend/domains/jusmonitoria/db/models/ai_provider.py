"""AI provider model for dynamic LLM configuration."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class AIProvider(TenantBaseModel):
    """
    AI provider configuration for dynamic LLM routing.
    
    Allows tenants to configure multiple AI providers with
    priorities and rate limits for fallback and load balancing.
    """
    
    __tablename__ = "ai_providers"
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Provider configuration
    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Provider name (openai, anthropic, google, etc.)",
    )
    
    model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Model identifier",
    )
    
    # API credentials (encrypted)
    api_key_encrypted: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Encrypted API key",
    )
    
    # Priority and status
    priority: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        index=True,
        comment="Priority for provider selection (higher = preferred)",
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Whether provider is active",
    )
    
    # Model parameters
    max_tokens: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Maximum tokens per request",
    )
    
    temperature: Mapped[float] = mapped_column(
        Numeric(3, 2),
        nullable=False,
        default=0.7,
        comment="Temperature for generation",
    )
    
    # Usage tracking
    usage_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total number of requests made",
    )
    
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Last time provider was used",
    )
    
    # Relationships
    tenant: Mapped["Tenant"] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        lazy="selectin",
    )
    
    def __repr__(self) -> str:
        return f"<AIProvider(id={self.id}, provider={self.provider}, model={self.model})>"
