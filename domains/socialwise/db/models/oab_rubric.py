"""OabRubric model — mirror of Prisma OabRubric table."""

from typing import Optional

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class OabRubric(SocialwiseModel):
    __tablename__ = "OabRubric"

    code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exam: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_url: Mapped[Optional[str]] = mapped_column("pdfUrl", String, nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    schema_data: Mapped[dict] = mapped_column("schema", JSONB, nullable=False)

    def __repr__(self) -> str:
        return f"<OabRubric(id={self.id}, exam={self.exam}, area={self.area})>"
