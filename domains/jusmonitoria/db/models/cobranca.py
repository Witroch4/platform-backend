"""Billing reminder/collection (Cobranca) model."""

import enum
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class TipoCobranca(str, enum.Enum):
    """Collection type."""

    LEMBRETE_VENCIMENTO = "lembrete_vencimento"
    COBRANCA_ATRASO = "cobranca_atraso"
    AVISO_REAJUSTE = "aviso_reajuste"
    RENOVACAO = "renovacao"


class StatusCobranca(str, enum.Enum):
    """Collection status."""

    PENDENTE = "pendente"
    ENVIADO = "enviado"
    FALHOU = "falhou"


class CanalCobranca(str, enum.Enum):
    """Collection channel."""

    CHATWIT = "chatwit"
    EMAIL = "email"


class Cobranca(TenantBaseModel):
    """
    Billing reminder/collection model.

    Tracks payment reminders and collection notices sent to clients
    via Chatwit (WhatsApp) or email.
    """

    __tablename__ = "cobrancas"

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    contrato_id: Mapped[UUID] = mapped_column(
        ForeignKey("contratos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Related contract",
    )

    fatura_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("faturas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Related invoice",
    )

    client_id: Mapped[UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Client to be notified",
    )

    # Type and channel
    tipo: Mapped[TipoCobranca] = mapped_column(
        Enum(TipoCobranca, name="tipo_cobranca", native_enum=False),
        nullable=False,
        index=True,
        comment="Type of collection notice",
    )

    canal: Mapped[CanalCobranca] = mapped_column(
        Enum(CanalCobranca, name="canal_cobranca", native_enum=False),
        nullable=False,
        default=CanalCobranca.CHATWIT,
        comment="Delivery channel",
    )

    status: Mapped[StatusCobranca] = mapped_column(
        Enum(StatusCobranca, name="status_cobranca", native_enum=False),
        nullable=False,
        default=StatusCobranca.PENDENTE,
        index=True,
        comment="Delivery status",
    )

    # Content
    mensagem: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Message content sent to client",
    )

    # Scheduling
    data_agendada: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        comment="Scheduled send date/time",
    )

    data_envio: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Actual send date/time",
    )

    # Chatwit integration
    chatwit_message_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Chatwit message ID after sending",
    )

    # Retry tracking
    tentativas: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of send attempts",
    )

    erro: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Last error message if failed",
    )

    # Relationships
    contrato: Mapped["Contrato"] = relationship(
        "Contrato",
        foreign_keys=[contrato_id],
        lazy="selectin",
    )

    fatura: Mapped[Optional["Fatura"]] = relationship(
        "Fatura",
        foreign_keys=[fatura_id],
        lazy="selectin",
    )

    client: Mapped["Client"] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Cobranca(id={self.id}, tipo={self.tipo}, status={self.status})>"
