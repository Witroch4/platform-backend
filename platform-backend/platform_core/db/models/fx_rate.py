"""Foreign exchange rate cache (USD/BRL)."""

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from platform_core.db.base import PlatformModel


class FxRate(PlatformModel):
    __tablename__ = "fx_rates"

    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    target_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BRL")
    rate: Mapped[float] = mapped_column(Numeric(12, 6), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # bcb, exchangerate-api, manual
    fetched_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
