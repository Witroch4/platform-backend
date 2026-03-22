"""LeadAutomacao model — mirror of Prisma LeadAutomacao table."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class LeadAutomacao(SocialwiseModel):
    """State table linking a lead to an automation."""

    __tablename__ = "LeadAutomacao"
    __table_args__ = (UniqueConstraint("leadId", "automacaoId", name="LeadAutomacao_leadId_automacaoId_key"),)

    lead_id: Mapped[str] = mapped_column("leadId", ForeignKey("Lead.id", ondelete="CASCADE"), nullable=False)
    automacao_id: Mapped[str] = mapped_column(
        "automacaoId",
        ForeignKey("Automacao.id", ondelete="CASCADE"),
        nullable=False,
    )
    link_sent: Mapped[bool] = mapped_column("linkSent", Boolean, nullable=False, default=False)
    waiting_for_email: Mapped[bool] = mapped_column("waitingForEmail", Boolean, nullable=False, default=False)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="automacoes", lazy="selectin")
    automacao: Mapped["Automacao"] = relationship("Automacao", back_populates="lead_links", lazy="selectin")

    def __repr__(self) -> str:
        return f"<LeadAutomacao(id={self.id}, lead_id={self.lead_id}, automacao_id={self.automacao_id})>"
