"""WebhookDelivery model — mirror of Prisma WebhookDelivery table."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, generate_cuid


class WebhookEvent(str, enum.Enum):
    QUEUE_HEALTH_CHANGED = "QUEUE_HEALTH_CHANGED"
    JOB_COMPLETED = "JOB_COMPLETED"
    JOB_FAILED = "JOB_FAILED"
    ALERT_TRIGGERED = "ALERT_TRIGGERED"
    FLOW_COMPLETED = "FLOW_COMPLETED"
    FLOW_FAILED = "FLOW_FAILED"


class WebhookDelivery(SocialwiseBase):
    """Single outbound webhook delivery attempt."""

    __tablename__ = "WebhookDelivery"
    __table_args__ = (
        Index("WebhookDelivery_webhookId_eventType_idx", "webhookId", "eventType"),
        Index("WebhookDelivery_createdAt_idx", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    webhook_id: Mapped[str] = mapped_column(
        "webhookId",
        ForeignKey("WebhookConfig.id"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column("eventType", String, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    response_status: Mapped[Optional[int]] = mapped_column("responseStatus", Integer, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column("responseBody", String, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    delivered_at: Mapped[Optional[datetime]] = mapped_column("deliveredAt", DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    webhook: Mapped["WebhookConfig"] = relationship("WebhookConfig", back_populates="deliveries", lazy="selectin")

    def __repr__(self) -> str:
        return f"<WebhookDelivery(id={self.id}, webhook_id={self.webhook_id}, status={self.response_status})>"
