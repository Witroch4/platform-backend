"""FlowSession model — mirror of Prisma FlowSession table."""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class FlowSessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    WAITING_INPUT = "WAITING_INPUT"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


class FlowSession(SocialwiseModel):
    __tablename__ = "FlowSession"
    __table_args__ = (
        Index("FlowSession_conversationId_idx", "conversationId"),
        Index("FlowSession_status_idx", "status"),
        Index("FlowSession_flowId_idx", "flowId"),
        Index("FlowSession_inboxId_status_idx", "inboxId", "status"),
        Index("FlowSession_createdAt_idx", "createdAt"),
        Index("FlowSession_contactId_status_idx", "contactId", "status"),
    )

    flow_id: Mapped[str] = mapped_column(
        "flowId", String(30),
        ForeignKey("Flow.id"),
        nullable=False,
    )
    conversation_id: Mapped[str] = mapped_column("conversationId", String, nullable=False)
    contact_id: Mapped[str] = mapped_column("contactId", String, nullable=False)
    inbox_id: Mapped[str] = mapped_column("inboxId", String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default=FlowSessionStatus.ACTIVE.value)
    current_node_id: Mapped[Optional[str]] = mapped_column("currentNodeId", String(30), nullable=True)
    variables: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    execution_log: Mapped[list] = mapped_column("executionLog", JSONB, nullable=False, default=list, server_default="[]")
    completed_at: Mapped[Optional[datetime]] = mapped_column("completedAt", DateTime(timezone=True), nullable=True)

    # Relationships
    flow: Mapped["Flow"] = relationship("Flow", back_populates="sessions", lazy="selectin")

    def __repr__(self) -> str:
        return f"<FlowSession(id={self.id}, flowId={self.flow_id}, status={self.status})>"
