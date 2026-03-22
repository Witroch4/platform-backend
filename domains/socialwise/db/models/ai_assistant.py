"""AiAssistant model — mirror of Prisma AiAssistant table."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase


class AiAssistant(SocialwiseBase):
    __tablename__ = "AiAssistant"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    user_id: Mapped[str] = mapped_column("userId", String(30), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    product_name: Mapped[Optional[str]] = mapped_column("productName", String, nullable=True)
    generate_faqs: Mapped[bool] = mapped_column("generateFaqs", Boolean, nullable=False, default=False)
    capture_memories: Mapped[bool] = mapped_column("captureMemories", Boolean, nullable=False, default=False)
    instructions: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    intent_output_format: Mapped[str] = mapped_column("intentOutputFormat", String, nullable=False, default="JSON")
    model: Mapped[str] = mapped_column(String, nullable=False, default="gpt-5-nano")
    provider: Mapped[str] = mapped_column(String, nullable=False, default="OPENAI")
    fallback_provider: Mapped[Optional[str]] = mapped_column("fallbackProvider", String, nullable=True)
    fallback_model: Mapped[Optional[str]] = mapped_column("fallbackModel", String, nullable=True)
    embedipreview: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verbosity: Mapped[str] = mapped_column(String, nullable=False, default="low")
    max_output_tokens: Mapped[int] = mapped_column("maxOutputTokens", Integer, nullable=False, default=648)
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_p: Mapped[Optional[float]] = mapped_column("topP", Float, nullable=True)
    temp_schema: Mapped[float] = mapped_column("tempSchema", Float, nullable=False, default=0.1)
    temp_copy: Mapped[float] = mapped_column("tempCopy", Float, nullable=False, default=0.4)
    warmup_deadline_ms: Mapped[int] = mapped_column("warmupDeadlineMs", Integer, nullable=False, default=15000)
    hard_deadline_ms: Mapped[int] = mapped_column("hardDeadlineMs", Integer, nullable=False, default=15000)
    soft_deadline_ms: Mapped[int] = mapped_column("softDeadlineMs", Integer, nullable=False, default=18000)
    short_title_llm: Mapped[bool] = mapped_column("shortTitleLLM", Boolean, nullable=False, default=True)
    tool_choice: Mapped[str] = mapped_column("toolChoice", String, nullable=False, default="auto")
    propose_human_handoff: Mapped[bool] = mapped_column(
        "proposeHumanHandoff",
        Boolean,
        nullable=False,
        default=True,
    )
    disable_intent_suggestion: Mapped[bool] = mapped_column(
        "disableIntentSuggestion",
        Boolean,
        nullable=False,
        default=False,
    )
    enable_auto_remarketing: Mapped[bool] = mapped_column(
        "enableAutoRemarketing",
        Boolean,
        nullable=False,
        default=False,
    )
    remarketing_delay_minutes: Mapped[int] = mapped_column(
        "remarketingDelayMinutes",
        Integer,
        nullable=False,
        default=30,
    )
    remarketing_message: Mapped[Optional[str]] = mapped_column("remarketingMessage", String, nullable=True)
    session_ttl_seconds: Mapped[int] = mapped_column("sessionTtlSeconds", Integer, nullable=False, default=86400)
    session_ttl_dev_seconds: Mapped[int] = mapped_column(
        "sessionTtlDevSeconds",
        Integer,
        nullable=False,
        default=300,
    )
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    reasoning_effort: Mapped[str] = mapped_column("reasoningEffort", String, nullable=False, default="minimal")
    created_at: Mapped[Optional[str]] = mapped_column("createdAt", DateTime, server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column("updatedAt", DateTime, server_default=func.now(), nullable=True)
    inbox_links: Mapped[list["AiAssistantInbox"]] = relationship(
        "AiAssistantInbox",
        back_populates="assistant",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<AiAssistant(id={self.id}, name={self.name}, model={self.model})>"
