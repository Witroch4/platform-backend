"""AiAssistantInbox model — mirror of Prisma AiAssistantInbox join table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, generate_cuid


class AiAssistantInbox(SocialwiseBase):
    __tablename__ = "AiAssistantInbox"
    __table_args__ = (
        UniqueConstraint("assistantId", "inboxDbId", name="AiAssistantInbox_assistantId_inboxDbId_key"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    assistant_id: Mapped[str] = mapped_column(
        "assistantId",
        ForeignKey("AiAssistant.id", ondelete="CASCADE"),
        nullable=False,
    )
    inbox_db_id: Mapped[str] = mapped_column(
        "inboxDbId",
        ForeignKey("ChatwitInbox.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    assistant: Mapped["AiAssistant"] = relationship(
        "AiAssistant",
        back_populates="inbox_links",
        lazy="selectin",
    )
    inbox: Mapped["ChatwitInbox"] = relationship(
        "ChatwitInbox",
        back_populates="ai_assistant_links",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<AiAssistantInbox(id={self.id}, assistantId={self.assistant_id}, "
            f"inboxDbId={self.inbox_db_id}, active={self.is_active})>"
        )
