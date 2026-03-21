"""Intent model — mirror of Prisma Intent table used by SocialWise Flow."""

from __future__ import annotations

import enum
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class IntentActionType(str, enum.Enum):
    TEMPLATE = "TEMPLATE"
    INTERACTIVE = "INTERACTIVE"
    TEXT = "TEXT"
    HUMAN_FALLBACK = "HUMAN_FALLBACK"


class Intent(SocialwiseModel):
    __tablename__ = "Intent"
    __table_args__ = (
        Index("Intent_accountId_isActive_idx", "accountId", "isActive"),
        Index("Intent_slug_idx", "slug"),
    )

    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    action_type: Mapped[str] = mapped_column("actionType", String, nullable=False)
    template_id: Mapped[Optional[str]] = mapped_column(
        "templateId",
        ForeignKey("Template.id"),
        nullable=True,
    )
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(1536), nullable=True)
    similarity_threshold: Mapped[float] = mapped_column(
        "similarityThreshold",
        Float,
        nullable=False,
        default=0.8,
    )
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    usage_count: Mapped[int] = mapped_column("usageCount", Integer, nullable=False, default=0)
    created_by_id: Mapped[str] = mapped_column(
        "createdById",
        ForeignKey("User.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[Optional[str]] = mapped_column("accountId", String(30), nullable=True)

    def __repr__(self) -> str:
        return f"<Intent(id={self.id}, slug={self.slug}, active={self.is_active})>"
