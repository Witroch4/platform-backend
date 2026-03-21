"""Agent execution log for monitoring AI agent performance."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import BaseModel


class AgentExecutionLog(BaseModel):
    """
    Tracks every AI agent execution for monitoring and analytics.

    Not tenant-scoped (uses BaseModel) so super admin can query globally.
    The tenant_id field is stored for filtering but not as a FK constraint.
    """

    __tablename__ = "agent_execution_logs"

    tenant_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        index=True,
        comment="Tenant that triggered the execution",
    )

    agent_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Agent name: triagem, investigador, redator, maestro",
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="Execution status: running, success, error",
    )

    input_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )

    output_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )

    total_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )

    provider_used: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="unknown",
        index=True,
        comment="LLM provider: openai, anthropic, google",
    )

    model_used: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="unknown",
        comment="Model identifier used",
    )

    duration_ms: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Execution duration in milliseconds",
    )

    error_message: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Error message if execution failed",
    )

    context: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, default=None,
        comment="Additional execution metadata",
    )

    def __repr__(self) -> str:
        return (
            f"<AgentExecutionLog(agent={self.agent_name}, "
            f"status={self.status}, tokens={self.total_tokens})>"
        )
