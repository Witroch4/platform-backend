"""Minimal User mirror for Socialwise worker dependencies."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class User(SocialwiseModel):
    """Subset of Prisma User used by Socialwise workers."""

    __tablename__ = "User"

    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="DEFAULT")
    mtf_variaveis_populadas: Mapped[bool] = mapped_column(
        "mtfVariaveisPopuladas",
        Boolean,
        nullable=False,
        default=False,
    )

    accounts: Mapped[list["Account"]] = relationship(
        "Account",
        back_populates="user",
        lazy="selectin",
    )
    agendamentos: Mapped[list["Agendamento"]] = relationship(
        "Agendamento",
        back_populates="user",
        lazy="selectin",
    )
    automacoes: Mapped[list["Automacao"]] = relationship(
        "Automacao",
        back_populates="user",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"
