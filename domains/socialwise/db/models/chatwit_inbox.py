"""ChatwitInbox model — mirror of Prisma ChatwitInbox table.

Needed by FlowCampaign worker to resolve inbox → accountId + channelType.
"""

from typing import Optional

from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class ChatwitInbox(SocialwiseModel):
    __tablename__ = "ChatwitInbox"

    nome: Mapped[str] = mapped_column(String, nullable=False)
    inbox_id: Mapped[str] = mapped_column("inboxId", String, nullable=False)
    channel_type: Mapped[str] = mapped_column("channelType", String, nullable=False)
    usuario_chatwit_id: Mapped[str] = mapped_column("usuarioChatwitId", String, nullable=False)
    whatsapp_api_key: Mapped[Optional[str]] = mapped_column("whatsappApiKey", String, nullable=True)
    phone_number_id: Mapped[Optional[str]] = mapped_column("phoneNumberId", String, nullable=True)
    whatsapp_business_account_id: Mapped[Optional[str]] = mapped_column(
        "whatsappBusinessAccountId", String, nullable=True,
    )
    fallback_para_inbox_id: Mapped[Optional[str]] = mapped_column(
        "fallbackParaInboxId", String, nullable=True,
    )
    socialwise_inherit_from_agent: Mapped[Optional[bool]] = mapped_column(
        "socialwiseInheritFromAgent", Boolean, nullable=True, default=True,
    )
    socialwise_reasoning_effort: Mapped[Optional[str]] = mapped_column(
        "socialwiseReasoningEffort", String, nullable=True,
    )
    socialwise_verbosity: Mapped[Optional[str]] = mapped_column(
        "socialwiseVerbosity", String, nullable=True,
    )
    socialwise_temperature: Mapped[Optional[float]] = mapped_column(
        "socialwiseTemperature", Float, nullable=True,
    )
    socialwise_temp_schema: Mapped[Optional[float]] = mapped_column(
        "socialwiseTempSchema", Float, nullable=True,
    )
    socialwise_warmup_deadline_ms: Mapped[Optional[int]] = mapped_column(
        "socialwiseWarmupDeadlineMs", Integer, nullable=True,
    )
    socialwise_hard_deadline_ms: Mapped[Optional[int]] = mapped_column(
        "socialwiseHardDeadlineMs", Integer, nullable=True,
    )
    socialwise_soft_deadline_ms: Mapped[Optional[int]] = mapped_column(
        "socialwiseSoftDeadlineMs", Integer, nullable=True,
    )
    socialwise_short_title_llm: Mapped[Optional[bool]] = mapped_column(
        "socialwiseShortTitleLLM", Boolean, nullable=True,
    )
    socialwise_tool_choice: Mapped[Optional[str]] = mapped_column(
        "socialwiseToolChoice", String, nullable=True,
    )

    # Relationships
    usuario_chatwit: Mapped["UsuarioChatwit"] = relationship(
        "UsuarioChatwit", foreign_keys=[usuario_chatwit_id],
        primaryjoin="ChatwitInbox.usuario_chatwit_id == UsuarioChatwit.id",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<ChatwitInbox(id={self.id}, nome={self.nome}, channelType={self.channel_type})>"
