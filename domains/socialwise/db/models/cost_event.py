"""CostEvent model — mirror of Prisma CostEvent table."""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseBase, generate_cuid


class Provider(str, enum.Enum):
    OPENAI = "OPENAI"
    GEMINI = "GEMINI"
    CLAUDE = "CLAUDE"
    META_WHATSAPP = "META_WHATSAPP"
    INFRA = "INFRA"
    OTHER = "OTHER"


class Unit(str, enum.Enum):
    TOKENS_IN = "TOKENS_IN"
    TOKENS_OUT = "TOKENS_OUT"
    TOKENS_CACHED = "TOKENS_CACHED"
    IMAGE_LOW = "IMAGE_LOW"
    IMAGE_MEDIUM = "IMAGE_MEDIUM"
    IMAGE_HIGH = "IMAGE_HIGH"
    WHATSAPP_TEMPLATE = "WHATSAPP_TEMPLATE"
    AUTH_TEMPLATE = "AUTH_TEMPLATE"
    UTILITY_TEMPLATE = "UTILITY_TEMPLATE"
    MARKETING_TEMPLATE = "MARKETING_TEMPLATE"
    TOOL_CALL = "TOOL_CALL"
    VECTOR_GB_DAY = "VECTOR_GB_DAY"
    OTHER = "OTHER"


class EventStatus(str, enum.Enum):
    PENDING_PRICING = "PENDING_PRICING"
    PRICED = "PRICED"
    ERROR = "ERROR"


class CostEvent(SocialwiseBase):
    """Cost event — uses ts instead of createdAt/updatedAt."""

    __tablename__ = "CostEvent"
    __table_args__ = (
        Index("CostEvent_provider_product_unit_ts_idx", "provider", "product", "unit", "ts"),
        Index("CostEvent_sessionId_inboxId_userId_idx", "sessionId", "inboxId", "userId"),
        Index("CostEvent_status_idx", "status"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    trace_id: Mapped[Optional[str]] = mapped_column("traceId", String, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column("externalId", String, nullable=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    product: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    units: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="USD")
    unit_price: Mapped[Optional[float]] = mapped_column("unitPrice", Numeric(18, 8), nullable=True)
    cost: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default=EventStatus.PENDING_PRICING.value)
    session_id: Mapped[Optional[str]] = mapped_column("sessionId", String, nullable=True)
    inbox_id: Mapped[Optional[str]] = mapped_column("inboxId", String, nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column("userId", String, nullable=True)
    intent: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw: Mapped[dict] = mapped_column(JSONB, nullable=False)

    def __repr__(self) -> str:
        return f"<CostEvent(id={self.id}, provider={self.provider}, product={self.product}, cost={self.cost})>"
