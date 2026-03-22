"""InboxFlowCanvas model — mirror of Prisma InboxFlowCanvas table."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class InboxFlowCanvas(SocialwiseModel):
    __tablename__ = "InboxFlowCanvas"

    inbox_id: Mapped[str] = mapped_column(
        "inboxId",
        String(30),
        ForeignKey("ChatwitInbox.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    canvas: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)

    inbox: Mapped["ChatwitInbox"] = relationship("ChatwitInbox", lazy="selectin")

    def __repr__(self) -> str:
        return f"<InboxFlowCanvas(id={self.id}, inboxId={self.inbox_id}, version={self.version})>"
