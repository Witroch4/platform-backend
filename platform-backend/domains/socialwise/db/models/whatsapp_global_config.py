"""WhatsAppGlobalConfig model — mirror of Prisma WhatsAppGlobalConfig table."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class WhatsAppGlobalConfig(SocialwiseModel):
    __tablename__ = "WhatsAppGlobalConfig"

    usuario_chatwit_id: Mapped[str] = mapped_column(
        "usuarioChatwitId",
        String(30),
        ForeignKey("UsuarioChatwit.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    whatsapp_api_key: Mapped[str] = mapped_column("whatsappApiKey", String, nullable=False)
    phone_number_id: Mapped[str] = mapped_column("phoneNumberId", String, nullable=False)
    whatsapp_business_account_id: Mapped[str] = mapped_column(
        "whatsappBusinessAccountId", String, nullable=False,
    )
    graph_api_base_url: Mapped[str] = mapped_column(
        "graphApiBaseUrl", String, nullable=False, default="https://graph.facebook.com/v22.0",
    )

    usuario_chatwit: Mapped["UsuarioChatwit"] = relationship(
        "UsuarioChatwit",
        back_populates="whatsapp_global_config",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<WhatsAppGlobalConfig(id={self.id}, business_account={self.whatsapp_business_account_id})>"
