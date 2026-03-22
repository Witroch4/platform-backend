"""Template model — mirror of Prisma Template table."""

import enum
from typing import Optional

from sqlalchemy import Boolean, Index, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class TemplateType(str, enum.Enum):
    WHATSAPP_OFFICIAL = "WHATSAPP_OFFICIAL"
    INTERACTIVE_MESSAGE = "INTERACTIVE_MESSAGE"
    AUTOMATION_REPLY = "AUTOMATION_REPLY"


class TemplateScope(str, enum.Enum):
    GLOBAL = "GLOBAL"
    PRIVATE = "PRIVATE"


class TemplateStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Template(SocialwiseModel):
    __tablename__ = "Template"
    __table_args__ = (
        Index(
            "Template_createdById_inboxId_type_scope_status_isActive_idx",
            "createdById", "inboxId", "type", "scope", "status", "isActive",
        ),
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    scope: Mapped[str] = mapped_column(String, nullable=False, default=TemplateScope.PRIVATE.value)
    status: Mapped[str] = mapped_column(String, nullable=False, default=TemplateStatus.APPROVED.value)
    language: Mapped[str] = mapped_column(String, nullable=False, default="pt_BR")
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    usage_count: Mapped[int] = mapped_column("usageCount", Integer, nullable=False, default=0)
    simple_reply_text: Mapped[Optional[str]] = mapped_column("simpleReplyText", String, nullable=True)
    created_by_id: Mapped[str] = mapped_column("createdById", String(30), nullable=False)
    inbox_id: Mapped[Optional[str]] = mapped_column("inboxId", String(30), nullable=True)
    interactive_content: Mapped[Optional["InteractiveContent"]] = relationship(
        "InteractiveContent",
        back_populates="template",
        uselist=False,
        lazy="selectin",
    )
    whatsapp_official_info: Mapped[Optional["WhatsAppOfficialInfo"]] = relationship(
        "WhatsAppOfficialInfo",
        back_populates="template",
        uselist=False,
        lazy="selectin",
    )
    mappings: Mapped[list["MapeamentoIntencao"]] = relationship(
        "MapeamentoIntencao",
        back_populates="template",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Template(id={self.id}, name={self.name}, type={self.type})>"
