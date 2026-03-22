"""LeadInstagramProfile model — mirror of Prisma LeadInstagramProfile table."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, generate_cuid


class LeadInstagramProfile(SocialwiseBase):
    """Instagram-specific state for a lead."""

    __tablename__ = "LeadInstagramProfile"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    lead_id: Mapped[str] = mapped_column(
        "leadId",
        ForeignKey("Lead.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    is_follower: Mapped[bool] = mapped_column("isFollower", Boolean, nullable=False, default=False)
    last_message_at: Mapped[Optional[datetime]] = mapped_column("lastMessageAt", DateTime(timezone=True), nullable=True)
    is_online: Mapped[bool] = mapped_column("isOnline", Boolean, nullable=False, default=False)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="instagram_profile", lazy="selectin")

    def __repr__(self) -> str:
        return f"<LeadInstagramProfile(lead_id={self.lead_id}, is_follower={self.is_follower})>"
