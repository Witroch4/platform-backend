"""FxRate model — mirror of Prisma FxRate table."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseBase


class FxRate(SocialwiseBase):
    __tablename__ = "FxRate"

    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    base: Mapped[str] = mapped_column(String, primary_key=True, nullable=False, default="USD")
    quote: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)

    def __repr__(self) -> str:
        date_str = self.date.isoformat() if isinstance(self.date, datetime) else self.date
        return f"<FxRate(date={date_str}, base={self.base}, quote={self.quote}, rate={self.rate})>"
