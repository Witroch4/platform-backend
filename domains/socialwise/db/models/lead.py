"""Lead model — mirror of Prisma Lead table."""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class LeadSource(str, enum.Enum):
    INSTAGRAM = "INSTAGRAM"
    CHATWIT_OAB = "CHATWIT_OAB"
    MANUAL = "MANUAL"
    WHATSAPP_SOCIAL_FLOW = "WHATSAPP_SOCIAL_FLOW"


class Lead(SocialwiseModel):
    __tablename__ = "Lead"
    __table_args__ = (
        Index("Lead_userId_accountId_email_phone_idx", "userId", "accountId", "email", "phone"),
        Index("Lead_tags_idx", "tags"),
        Index("Lead_source_sourceIdentifier_accountId_key", "source", "sourceIdentifier", "accountId", unique=True),
    )

    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column("avatarUrl", String, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    source_identifier: Mapped[str] = mapped_column("sourceIdentifier", String, nullable=False)
    tags: Mapped[list[str]] = mapped_column("tags", ARRAY(String), nullable=False, default=list)
    user_id: Mapped[Optional[str]] = mapped_column("userId", String, nullable=True)
    account_id: Mapped[Optional[str]] = mapped_column("accountId", String, nullable=True)

    # Relationship to LeadOabData (one-to-one)
    oab_data: Mapped[Optional["LeadOabData"]] = relationship(
        "LeadOabData",
        back_populates="lead",
        uselist=False,
        lazy="selectin",
    )
    instagram_profile: Mapped[Optional["LeadInstagramProfile"]] = relationship(
        "LeadInstagramProfile",
        back_populates="lead",
        uselist=False,
        lazy="selectin",
    )
    automacoes: Mapped[list["LeadAutomacao"]] = relationship(
        "LeadAutomacao",
        back_populates="lead",
        lazy="selectin",
    )
    payments: Mapped[list["LeadPayment"]] = relationship(
        "LeadPayment",
        back_populates="lead",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Lead(id={self.id}, source={self.source}, phone={self.phone})>"
