"""InteractiveContent-related models — mirrors of Prisma interactive template tables."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseBase, SocialwiseModel, generate_cuid


class Body(SocialwiseBase):
    __tablename__ = "Body"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    text: Mapped[str] = mapped_column(String, nullable=False)
    interactive_contents: Mapped[list["InteractiveContent"]] = relationship(
        "InteractiveContent",
        back_populates="body",
        lazy="selectin",
    )


class InteractiveContent(SocialwiseModel):
    __tablename__ = "InteractiveContent"

    template_id: Mapped[str] = mapped_column(
        "templateId",
        String(30),
        ForeignKey("Template.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    body_id: Mapped[str] = mapped_column(
        "bodyId",
        String(30),
        ForeignKey("Body.id"),
        nullable=False,
    )
    interactive_type: Mapped[str] = mapped_column("interactiveType", String, nullable=False, default="button")
    generic_payload: Mapped[Optional[dict]] = mapped_column("genericPayload", JSONB, nullable=True)

    template: Mapped["Template"] = relationship(
        "Template",
        back_populates="interactive_content",
        lazy="selectin",
    )
    body: Mapped[Body] = relationship("Body", back_populates="interactive_contents", lazy="selectin")
    header: Mapped[Optional["Header"]] = relationship(
        "Header",
        back_populates="interactive_content",
        uselist=False,
        lazy="selectin",
    )
    footer: Mapped[Optional["Footer"]] = relationship(
        "Footer",
        back_populates="interactive_content",
        uselist=False,
        lazy="selectin",
    )
    action_cta_url: Mapped[Optional["ActionCtaUrl"]] = relationship(
        "ActionCtaUrl",
        back_populates="interactive_content",
        uselist=False,
        lazy="selectin",
    )
    action_reply_button: Mapped[Optional["ActionReplyButton"]] = relationship(
        "ActionReplyButton",
        back_populates="interactive_content",
        uselist=False,
        lazy="selectin",
    )


class Header(SocialwiseBase):
    __tablename__ = "Header"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    type: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    interactive_content_id: Mapped[str] = mapped_column(
        "interactiveContentId",
        String(30),
        ForeignKey("InteractiveContent.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    interactive_content: Mapped[InteractiveContent] = relationship(
        "InteractiveContent",
        back_populates="header",
        lazy="selectin",
    )


class Footer(SocialwiseBase):
    __tablename__ = "Footer"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    text: Mapped[str] = mapped_column(String, nullable=False)
    interactive_content_id: Mapped[str] = mapped_column(
        "interactiveContentId",
        String(30),
        ForeignKey("InteractiveContent.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    interactive_content: Mapped[InteractiveContent] = relationship(
        "InteractiveContent",
        back_populates="footer",
        lazy="selectin",
    )


class ActionCtaUrl(SocialwiseBase):
    __tablename__ = "ActionCtaUrl"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    display_text: Mapped[str] = mapped_column("displayText", String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    interactive_content_id: Mapped[str] = mapped_column(
        "interactiveContentId",
        String(30),
        ForeignKey("InteractiveContent.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    interactive_content: Mapped[InteractiveContent] = relationship(
        "InteractiveContent",
        back_populates="action_cta_url",
        lazy="selectin",
    )


class ActionReplyButton(SocialwiseBase):
    __tablename__ = "ActionReplyButton"

    id: Mapped[str] = mapped_column(String(30), primary_key=True, nullable=False, default=generate_cuid)
    buttons: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    interactive_content_id: Mapped[str] = mapped_column(
        "interactiveContentId",
        String(30),
        ForeignKey("InteractiveContent.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    interactive_content: Mapped[InteractiveContent] = relationship(
        "InteractiveContent",
        back_populates="action_reply_button",
        lazy="selectin",
    )


class WhatsAppOfficialInfo(SocialwiseModel):
    __tablename__ = "WhatsAppOfficialInfo"

    template_id: Mapped[str] = mapped_column(
        "templateId",
        String(30),
        ForeignKey("Template.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    meta_template_id: Mapped[str] = mapped_column("metaTemplateId", String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    quality_score: Mapped[Optional[str]] = mapped_column("qualityScore", String, nullable=True)
    components: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")

    template: Mapped["Template"] = relationship(
        "Template",
        back_populates="whatsapp_official_info",
        lazy="selectin",
    )
