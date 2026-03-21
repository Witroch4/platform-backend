"""FlowCampaign and FlowCampaignContact models — mirror of Prisma tables."""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, SocialwiseModel


class FlowCampaignStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class FlowCampaignContactStatus(str, enum.Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class FlowCampaign(SocialwiseModel):
    __tablename__ = "FlowCampaign"
    __table_args__ = (
        Index("FlowCampaign_inboxId_status_idx", "inboxId", "status"),
        Index("FlowCampaign_scheduledAt_idx", "scheduledAt"),
        Index("FlowCampaign_status_idx", "status"),
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    flow_id: Mapped[str] = mapped_column(
        "flowId", String(30),
        ForeignKey("Flow.id"),
        nullable=False,
    )
    inbox_id: Mapped[str] = mapped_column("inboxId", String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default=FlowCampaignStatus.DRAFT.value)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column("scheduledAt", DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column("startedAt", DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column("completedAt", DateTime(timezone=True), nullable=True)
    paused_at: Mapped[Optional[datetime]] = mapped_column("pausedAt", DateTime(timezone=True), nullable=True)
    total_contacts: Mapped[int] = mapped_column("totalContacts", Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column("sentCount", Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column("failedCount", Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column("skippedCount", Integer, nullable=False, default=0)
    rate_limit: Mapped[int] = mapped_column("rateLimit", Integer, nullable=False, default=30)
    priority_level: Mapped[int] = mapped_column("priorityLevel", Integer, nullable=False, default=8)
    variables: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")

    # Relationships
    flow: Mapped["Flow"] = relationship("Flow", back_populates="campaigns", lazy="selectin")
    contacts: Mapped[list["FlowCampaignContact"]] = relationship(
        "FlowCampaignContact", back_populates="campaign", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<FlowCampaign(id={self.id}, name={self.name}, status={self.status})>"


class FlowCampaignContact(SocialwiseBase):
    """Campaign contact — uses SocialwiseBase (no createdAt/updatedAt in Prisma)."""

    __tablename__ = "FlowCampaignContact"
    __table_args__ = (
        Index("FlowCampaignContact_campaignId_status_idx", "campaignId", "status"),
        Index("FlowCampaignContact_contactId_idx", "contactId"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    campaign_id: Mapped[str] = mapped_column(
        "campaignId", String(30),
        ForeignKey("FlowCampaign.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_id: Mapped[str] = mapped_column("contactId", String, nullable=False)
    contact_phone: Mapped[Optional[str]] = mapped_column("contactPhone", String, nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column("contactName", String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default=FlowCampaignContactStatus.PENDING.value)
    session_id: Mapped[Optional[str]] = mapped_column("sessionId", String(30), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column("sentAt", DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column("errorMessage", String, nullable=True)
    retry_count: Mapped[int] = mapped_column("retryCount", Integer, nullable=False, default=0)
    variables: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")

    # Relationships
    campaign: Mapped["FlowCampaign"] = relationship("FlowCampaign", back_populates="contacts")

    def __repr__(self) -> str:
        return f"<FlowCampaignContact(id={self.id}, contactId={self.contact_id}, status={self.status})>"
