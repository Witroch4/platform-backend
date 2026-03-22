"""Scheduler state tracking."""

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from platform_core.db.base import PlatformModel


class ScheduledTask(PlatformModel):
    __tablename__ = "scheduled_tasks"

    domain: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    task_name: Mapped[str] = mapped_column(String(200), nullable=False)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
