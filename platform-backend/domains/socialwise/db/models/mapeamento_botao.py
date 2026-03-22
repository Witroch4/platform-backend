"""MapeamentoBotao model — mirror of Prisma MapeamentoBotao table."""

import enum

from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from domains.socialwise.db.base import SocialwiseModel


class ActionType(str, enum.Enum):
    SEND_TEMPLATE = "SEND_TEMPLATE"
    ADD_TAG = "ADD_TAG"
    REMOVE_TAG = "REMOVE_TAG"
    START_FLOW = "START_FLOW"
    ASSIGN_TO_AGENT = "ASSIGN_TO_AGENT"
    BUTTON_REACTION = "BUTTON_REACTION"


class MapeamentoBotao(SocialwiseModel):
    __tablename__ = "MapeamentoBotao"
    __table_args__ = (
        Index("MapeamentoBotao_inboxId_idx", "inboxId"),
    )

    button_id: Mapped[str] = mapped_column("buttonId", String, unique=True, nullable=False)
    action_type: Mapped[str] = mapped_column("actionType", String, nullable=False)
    action_payload: Mapped[dict] = mapped_column("actionPayload", JSONB, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    inbox_id: Mapped[str] = mapped_column("inboxId", String(30), nullable=False)

    def __repr__(self) -> str:
        return f"<MapeamentoBotao(id={self.id}, buttonId={self.button_id}, actionType={self.action_type})>"
