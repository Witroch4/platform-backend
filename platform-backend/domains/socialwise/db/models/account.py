"""Minimal Account mirror for Socialwise worker dependencies."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class Account(SocialwiseModel):
    """Subset of Prisma Account required by scheduling and Instagram workers."""

    __tablename__ = "Account"
    __table_args__ = (
        Index("Account_provider_providerAccountId_key", "provider", "providerAccountId", unique=True),
        Index("Account_userId_idx", "userId"),
    )

    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    provider_account_id: Mapped[str] = mapped_column("providerAccountId", String, nullable=False)
    refresh_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    access_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    expires_at: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    token_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    id_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    session_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ig_user_id: Mapped[Optional[str]] = mapped_column("igUserId", String, nullable=True)
    ig_username: Mapped[Optional[str]] = mapped_column("igUsername", String, nullable=True)
    is_main: Mapped[bool] = mapped_column("isMain", Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship("User", back_populates="accounts", lazy="selectin")
    agendamentos: Mapped[list["Agendamento"]] = relationship(
        "Agendamento",
        back_populates="account",
        lazy="selectin",
    )
    automacoes: Mapped[list["Automacao"]] = relationship(
        "Automacao",
        back_populates="account",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Account(id={self.id}, provider={self.provider}, ig_user_id={self.ig_user_id})>"
