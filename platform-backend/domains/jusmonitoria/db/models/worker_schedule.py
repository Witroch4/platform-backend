"""Worker schedule model for configurable task scheduling."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.jusmonitoria.db.base import BaseModel


class WorkerSchedule(BaseModel):
    """
    Stores cron-based scheduling configuration for async workers.

    Global (not tenant-scoped) since workers operate across tenants.
    """

    __tablename__ = "worker_schedules"

    task_name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        comment="Unique task identifier: datajud_poller, morning_briefing, etc",
    )

    cron_expression: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Cron expression: '0 */6 * * *'",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
    )

    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    next_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    config: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Task-specific configuration parameters",
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        comment="Human-readable description of the task",
    )

    def __repr__(self) -> str:
        return f"<WorkerSchedule(task={self.task_name}, cron={self.cron_expression}, active={self.is_active})>"
