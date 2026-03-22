"""PriceCard model — mirror of Prisma PriceCard table."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class PriceCard(SocialwiseModel):
    __tablename__ = "PriceCard"
    __table_args__ = (
        Index(
            "PriceCard_provider_product_unit_region_effectiveFrom_effectiveTo_idx",
            "provider",
            "product",
            "unit",
            "region",
            "effectiveFrom",
            "effectiveTo",
        ),
    )

    provider: Mapped[str] = mapped_column(String, nullable=False)
    product: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="USD")
    price_per_unit: Mapped[Decimal] = mapped_column("pricePerUnit", Numeric(18, 8), nullable=False)
    effective_from: Mapped[datetime] = mapped_column("effectiveFrom", DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime | None] = mapped_column("effectiveTo", DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    def __repr__(self) -> str:
        return f"<PriceCard(id={self.id}, provider={self.provider}, product={self.product}, unit={self.unit})>"
