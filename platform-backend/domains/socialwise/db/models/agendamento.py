"""Agendamento model — mirror of Prisma Agendamento table."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase


class Agendamento(SocialwiseBase):
    """Scheduling model. Has createdAt but no updatedAt in Prisma."""

    __tablename__ = "Agendamento"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[str] = mapped_column("accountId", ForeignKey("Account.id", ondelete="CASCADE"), nullable=False)
    data: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Platform flags
    facebook: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    instagram: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linkedin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    x: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stories: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reels: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    post_normal: Mapped[bool] = mapped_column("postNormal", Boolean, nullable=False, default=False)

    # Recurrence
    diario: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    semanal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    randomizar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tratar_como_unico_post: Mapped[bool] = mapped_column("tratarComoUnicoPost", Boolean, nullable=False, default=False)
    tratar_como_postagens_individuais: Mapped[bool] = mapped_column(
        "tratarComoPostagensIndividuais", Boolean, nullable=False, default=False,
    )

    # Completion status
    concluido_fb: Mapped[bool] = mapped_column("concluidoFB", Boolean, nullable=False, default=False)
    concluido_ig: Mapped[bool] = mapped_column("concluidoIG", Boolean, nullable=False, default=False)
    concluido_lk: Mapped[bool] = mapped_column("concluidoLK", Boolean, nullable=False, default=False)
    concluido_x: Mapped[bool] = mapped_column("concluidoX", Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="agendamentos", lazy="selectin")
    account: Mapped["Account"] = relationship("Account", back_populates="agendamentos", lazy="selectin")
    midias: Mapped[list["Midia"]] = relationship(
        "Midia",
        back_populates="agendamento",
        lazy="selectin",
        order_by="Midia.created_at.asc()",
    )

    def __repr__(self) -> str:
        return f"<Agendamento(id={self.id}, data={self.data})>"
