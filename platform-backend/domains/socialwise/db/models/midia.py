"""Midia model — mirror of Prisma Midia table."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, generate_cuid


class Midia(SocialwiseBase):
    """Media attachment linked to an Agendamento."""

    __tablename__ = "Midia"
    __table_args__ = (Index("Midia_agendamentoId_idx", "agendamentoId"),)

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    agendamento_id: Mapped[str] = mapped_column(
        "agendamentoId",
        ForeignKey("Agendamento.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column("mime_type", String, nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column("thumbnail_url", String, nullable=True)
    contador: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    agendamento: Mapped["Agendamento"] = relationship("Agendamento", back_populates="midias", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Midia(id={self.id}, agendamento_id={self.agendamento_id})>"
