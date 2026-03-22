"""Generated artifacts (PDFs, images, etc.) tracking."""

from sqlalchemy import BigInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from platform_core.db.base import PlatformModel


class Artifact(PlatformModel):
    __tablename__ = "artifacts"

    domain: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    artifact_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # pdf, image, audio, csv
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_bucket: Mapped[str] = mapped_column(String(100), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_task: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tenant_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, default=dict)
