"""UsuarioChatwit model — mirror of Prisma UsuarioChatwit table."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.socialwise.db.base import SocialwiseModel


class UsuarioChatwit(SocialwiseModel):
    __tablename__ = "UsuarioChatwit"

    app_user_id: Mapped[str] = mapped_column("appUserId", String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    available_name: Mapped[Optional[str]] = mapped_column("availableName", String, nullable=True)
    account_name: Mapped[str] = mapped_column("accountName", String, nullable=False)
    channel: Mapped[str] = mapped_column(String, nullable=False)
    chatwit_access_token: Mapped[Optional[str]] = mapped_column(
        "chatwitAccessToken", String, unique=True, nullable=True,
    )
    chatwit_account_id: Mapped[str] = mapped_column("chatwitAccountId", String, nullable=False)

    whatsapp_global_config: Mapped[Optional["WhatsAppGlobalConfig"]] = relationship(
        "WhatsAppGlobalConfig",
        back_populates="usuario_chatwit",
        uselist=False,
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<UsuarioChatwit(id={self.id}, name={self.name})>"
