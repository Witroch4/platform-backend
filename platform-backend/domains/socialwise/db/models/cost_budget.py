"""CostBudget model — mirror of Prisma CostBudget table."""

from decimal import Decimal

from sqlalchemy import Boolean, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class CostBudget(SocialwiseModel):
    __tablename__ = "CostBudget"
    __table_args__ = (
        Index("CostBudget_inboxId_userId_isActive_idx", "inboxId", "userId", "isActive"),
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    inbox_id: Mapped[str | None] = mapped_column("inboxId", String, nullable=True)
    user_id: Mapped[str | None] = mapped_column("userId", String, nullable=True)
    period: Mapped[str] = mapped_column(String, nullable=False)
    limit_usd: Mapped[Decimal] = mapped_column("limitUSD", Numeric(18, 2), nullable=False)
    alert_at: Mapped[Decimal] = mapped_column("alertAt", Numeric(3, 2), nullable=False, default=Decimal("0.80"))
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<CostBudget(id={self.id}, name={self.name}, period={self.period})>"
