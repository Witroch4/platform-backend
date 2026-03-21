"""MapeamentoIntencao model — mirror of Prisma MapeamentoIntencao table."""

from typing import Optional

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class MapeamentoIntencao(SocialwiseModel):
    __tablename__ = "MapeamentoIntencao"
    __table_args__ = (
        UniqueConstraint("intentName", "inboxId", name="MapeamentoIntencao_intentName_inboxId_key"),
        Index("MapeamentoIntencao_flowId_idx", "flowId"),
    )

    intent_name: Mapped[str] = mapped_column("intentName", String, nullable=False)
    inbox_id: Mapped[str] = mapped_column("inboxId", String(30), nullable=False)
    template_id: Mapped[Optional[str]] = mapped_column("templateId", String(30), nullable=True)
    flow_id: Mapped[Optional[str]] = mapped_column(
        "flowId", String(30),
        ForeignKey("Flow.id", ondelete="SET NULL"),
        nullable=True,
    )
    custom_variables: Mapped[Optional[dict]] = mapped_column("customVariables", JSONB, nullable=True)

    # Relationship to Flow
    flow: Mapped[Optional["Flow"]] = relationship("Flow", back_populates="mapeamentos", lazy="selectin")

    def __repr__(self) -> str:
        return f"<MapeamentoIntencao(id={self.id}, intent={self.intent_name}, flowId={self.flow_id})>"
