"""Automacao model — mirror of Prisma Automacao table."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class Automacao(SocialwiseModel):
    """Instagram automation used by the Socialwise webhook worker."""

    __tablename__ = "Automacao"
    __table_args__ = (Index("Automacao_userId_accountId_idx", "userId", "accountId"),)

    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    folder_id: Mapped[Optional[str]] = mapped_column("folderId", String, nullable=True)
    account_id: Mapped[str] = mapped_column("accountId", ForeignKey("Account.id", ondelete="CASCADE"), nullable=False)
    selected_media_id: Mapped[Optional[str]] = mapped_column("selectedMediaId", String, nullable=True)
    any_media_selected: Mapped[bool] = mapped_column("anyMediaSelected", Boolean, nullable=False, default=False)
    anyword: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    palavras_chave: Mapped[Optional[str]] = mapped_column("palavrasChave", String, nullable=True)
    frase_boas_vindas: Mapped[Optional[str]] = mapped_column("fraseBoasVindas", String, nullable=True)
    public_reply: Mapped[Optional[str]] = mapped_column("publicReply", String, nullable=True)
    button_payload: Mapped[str] = mapped_column("buttonPayload", String, nullable=False, unique=True)
    live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped["User"] = relationship("User", back_populates="automacoes", lazy="selectin")
    account: Mapped["Account"] = relationship("Account", back_populates="automacoes", lazy="selectin")
    lead_links: Mapped[list["LeadAutomacao"]] = relationship(
        "LeadAutomacao",
        back_populates="automacao",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Automacao(id={self.id}, account_id={self.account_id}, live={self.live})>"
