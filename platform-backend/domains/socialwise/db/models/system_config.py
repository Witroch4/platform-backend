"""SystemConfig model — mirror of Prisma SystemConfig table."""

from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class SystemConfig(SocialwiseModel):
    __tablename__ = "SystemConfig"
    __table_args__ = (
        Index("SystemConfig_category_idx", "category"),
    )

    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column("updatedBy", String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<SystemConfig(key={self.key})>"
