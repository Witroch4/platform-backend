"""AiAgentBlueprint model — mirror of Prisma AiAgentBlueprint table.

Used by OAB eval agents to load configuration (model, prompt, tokens, etc).
"""

from typing import Optional

from sqlalchemy import DateTime, Float, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseBase


class AiAgentBlueprint(SocialwiseBase):
    __tablename__ = "AiAgentBlueprint"
    __table_args__ = (
        Index("AiAgentBlueprint_ownerId_idx", "ownerId"),
        Index("AiAgentBlueprint_agentType_idx", "agentType"),
        Index("AiAgentBlueprint_linkedColumn_idx", "linkedColumn"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    owner_id: Mapped[str] = mapped_column("ownerId", String(30), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    agent_type: Mapped[str] = mapped_column("agentType", String, nullable=False, default="TOOLS")
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    model: Mapped[str] = mapped_column(String, nullable=False, default="gpt-4o-mini")
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_p: Mapped[Optional[float]] = mapped_column("topP", Float, nullable=True)
    max_output_tokens: Mapped[Optional[int]] = mapped_column("maxOutputTokens", Integer, nullable=True)
    system_prompt: Mapped[Optional[str]] = mapped_column("systemPrompt", String, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    toolset: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    output_parser: Mapped[Optional[dict]] = mapped_column("outputParser", JSONB, nullable=True)
    memory: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    canvas_state: Mapped[Optional[dict]] = mapped_column("canvasState", JSONB, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    linked_column: Mapped[Optional[str]] = mapped_column("linkedColumn", String, nullable=True)
    default_provider: Mapped[Optional[str]] = mapped_column("defaultProvider", String, nullable=True)
    thinking_level: Mapped[Optional[str]] = mapped_column("thinkingLevel", String, nullable=True)
    reasoning_effort: Mapped[Optional[str]] = mapped_column("reasoningEffort", String, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column("createdAt", DateTime, server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column("updatedAt", DateTime, server_default=func.now(), nullable=True)

    def __repr__(self) -> str:
        return f"<AiAgentBlueprint(id={self.id}, name={self.name}, linkedColumn={self.linked_column})>"
