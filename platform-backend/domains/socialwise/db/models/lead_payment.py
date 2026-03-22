"""LeadPayment model — mirror of Prisma LeadPayment table."""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class PaymentServiceType(str, enum.Enum):
    OAB_RECURSO = "OAB_RECURSO"
    OAB_ANALISE = "OAB_ANALISE"
    OUTRO = "OUTRO"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class LeadPayment(SocialwiseModel):
    __tablename__ = "LeadPayment"
    __table_args__ = (
        Index("LeadPayment_leadId_status_idx", "leadId", "status"),
        Index("LeadPayment_externalId_idx", "externalId"),
    )

    lead_id: Mapped[str] = mapped_column(
        "leadId",
        String(30),
        ForeignKey("Lead.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount_cents: Mapped[int] = mapped_column("amountCents", Integer, nullable=False)
    paid_amount_cents: Mapped[Optional[int]] = mapped_column("paidAmountCents", Integer, nullable=True)
    service_type: Mapped[str] = mapped_column(
        "serviceType",
        String,
        nullable=False,
        default=PaymentServiceType.OUTRO.value,
    )
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default=PaymentStatus.PENDING.value,
    )
    capture_method: Mapped[Optional[str]] = mapped_column("captureMethod", String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receipt_url: Mapped[Optional[str]] = mapped_column("receiptUrl", String, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column("externalId", String, nullable=True, unique=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column("confirmedAt", DateTime(timezone=True), nullable=True)
    confirmed_by: Mapped[Optional[str]] = mapped_column("confirmedBy", String, nullable=True)
    chatwit_conversation_id: Mapped[Optional[int]] = mapped_column("chatwitConversationId", Integer, nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column("contactPhone", String, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="payments", lazy="selectin")

    def __repr__(self) -> str:
        return f"<LeadPayment(id={self.id}, leadId={self.lead_id}, status={self.status})>"
