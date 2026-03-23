"""Message model mirror for Socialwise webhook conversation history."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class Message(SocialwiseModel):
    __tablename__ = "Message"
    __table_args__ = (
        UniqueConstraint("chatId", "externalId", name="Message_chatId_externalId_key"),
        Index("Message_chatId_idx", "chatId"),
        Index("Message_externalId_idx", "externalId"),
    )

    chat_id: Mapped[str] = mapped_column(
        "chatId",
        String(30),
        ForeignKey("Chat.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(String, nullable=False)
    is_from_lead: Mapped[bool] = mapped_column("isFromLead", Boolean, nullable=False, default=True)
    external_id: Mapped[Optional[str]] = mapped_column("externalId", String, nullable=True)
    message_type: Mapped[str] = mapped_column("messageType", String, nullable=False, default="text")
    metadata_json: Mapped[Optional[dict[str, Any]]] = mapped_column("metadata", JSONB, nullable=True)

    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, chatId={self.chat_id}, externalId={self.external_id})>"
