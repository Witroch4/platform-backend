"""AuditLog model — mirror of Prisma AuditLog table."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseBase, generate_cuid


class AuditLog(SocialwiseBase):
    __tablename__ = "AuditLog"
    __table_args__ = (
        Index("AuditLog_userId_idx", "userId"),
        Index("AuditLog_createdAt_idx", "createdAt"),
        Index("AuditLog_resourceType_resourceId_idx", "resourceType", "resourceId"),
    )

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    user_id: Mapped[str | None] = mapped_column("userId", String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column("resourceType", String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column("resourceId", String(255), nullable=True)
    queue_name: Mapped[str | None] = mapped_column("queueName", String(255), nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column("ipAddress", INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column("userAgent", String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action}, resource_type={self.resource_type})>"
