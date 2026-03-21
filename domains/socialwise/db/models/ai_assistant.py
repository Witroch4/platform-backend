"""AiAssistant model — mirror of Prisma AiAssistant table.

Fallback config source for OAB eval agents when no Blueprint is found.
"""

from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseBase


class AiAssistant(SocialwiseBase):
    __tablename__ = "AiAssistant"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    user_id: Mapped[str] = mapped_column("userId", String(30), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    model: Mapped[str] = mapped_column(String, nullable=False, default="gpt-5-nano")
    provider: Mapped[str] = mapped_column(String, nullable=False, default="OPENAI")
    max_output_tokens: Mapped[int] = mapped_column("maxOutputTokens", Integer, nullable=False, default=648)
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    reasoning_effort: Mapped[str] = mapped_column("reasoningEffort", String, nullable=False, default="minimal")
    thinking_level: Mapped[Optional[str]] = mapped_column("thinkingLevel", String, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column("createdAt", DateTime, server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column("updatedAt", DateTime, server_default=func.now(), nullable=True)

    def __repr__(self) -> str:
        return f"<AiAssistant(id={self.id}, name={self.name}, model={self.model})>"
