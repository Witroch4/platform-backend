"""Chat model — mirror of Prisma Chat table."""

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class Chat(SocialwiseModel):
    __tablename__ = "Chat"
    __table_args__ = (
        UniqueConstraint("leadId", "accountId", name="Chat_leadId_accountId_key"),
    )

    lead_id: Mapped[str] = mapped_column(
        "leadId", String(30),
        ForeignKey("Lead.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[str] = mapped_column(
        "accountId", String(30),
        ForeignKey("Account.id", ondelete="CASCADE"),
        nullable=False,
    )

    lead: Mapped["Lead"] = relationship("Lead", lazy="selectin")
    account: Mapped["Account"] = relationship("Account", lazy="selectin")
    messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="chat",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Chat(id={self.id}, leadId={self.lead_id}, accountId={self.account_id})>"
