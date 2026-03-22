"""WebhookConfig model — mirror of Prisma WebhookConfig table."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Boolean, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class WebhookConfig(SocialwiseModel):
    """Outbound webhook configuration used by queue-management admin APIs."""

    __tablename__ = "WebhookConfig"
    __table_args__ = (Index("WebhookConfig_enabled_idx", "enabled"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    events: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    headers: Mapped[Optional[dict[str, str]]] = mapped_column(JSONB, nullable=True)
    secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    retry_policy: Mapped[Optional[dict[str, Any]]] = mapped_column("retryPolicy", JSONB, nullable=True)
    created_by: Mapped[str] = mapped_column("createdBy", String(255), nullable=False)

    deliveries: Mapped[list["WebhookDelivery"]] = relationship(
        "WebhookDelivery",
        back_populates="webhook",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<WebhookConfig(id={self.id}, name={self.name}, enabled={self.enabled})>"
