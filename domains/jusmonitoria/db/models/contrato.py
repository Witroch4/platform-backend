"""Contract model for legal contract management."""

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    Date,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class TipoContrato(str, enum.Enum):
    """Contract type."""

    PRESTACAO_SERVICOS = "prestacao_servicos"
    HONORARIOS_EXITO = "honorarios_exito"
    MISTO = "misto"
    CONSULTORIA = "consultoria"
    CONTENCIOSO = "contencioso"


class StatusContrato(str, enum.Enum):
    """Contract status."""

    RASCUNHO = "rascunho"
    ATIVO = "ativo"
    SUSPENSO = "suspenso"
    ENCERRADO = "encerrado"
    CANCELADO = "cancelado"
    VENCIDO = "vencido"


class IndiceReajuste(str, enum.Enum):
    """Price adjustment index."""

    IGPM = "igpm"
    IPCA = "ipca"
    INPC = "inpc"
    SELIC = "selic"
    FIXO = "fixo"


class Contrato(TenantBaseModel):
    """
    Contract model representing legal service contracts.

    Each contract is linked to a client and an assigned lawyer,
    with financial terms and configurable billing/reminder settings.
    """

    __tablename__ = "contratos"

    __table_args__ = (
        UniqueConstraint("tenant_id", "numero_contrato", name="uq_contrato_numero_tenant"),
    )

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    client_id: Mapped[UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Client associated with this contract",
    )

    assigned_to: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Lawyer responsible for this contract",
    )

    # Identification
    numero_contrato: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Contract number, unique per tenant",
    )

    titulo: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="Contract title",
    )

    descricao: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Contract description",
    )

    # Type and status
    tipo: Mapped[TipoContrato] = mapped_column(
        Enum(TipoContrato, name="tipo_contrato", native_enum=False),
        nullable=False,
        default=TipoContrato.PRESTACAO_SERVICOS,
        index=True,
        comment="Contract type",
    )

    status: Mapped[StatusContrato] = mapped_column(
        Enum(StatusContrato, name="status_contrato", native_enum=False),
        nullable=False,
        default=StatusContrato.RASCUNHO,
        index=True,
        comment="Contract status",
    )

    # Financial terms
    valor_total: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Total contract value",
    )

    valor_mensal: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Monthly fee",
    )

    valor_entrada: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Down payment / initial fee",
    )

    percentual_exito: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Success fee percentage",
    )

    indice_reajuste: Mapped[Optional[IndiceReajuste]] = mapped_column(
        Enum(IndiceReajuste, name="indice_reajuste", native_enum=False),
        nullable=True,
        comment="Price adjustment index",
    )

    # Dates
    data_inicio: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Contract start date",
    )

    data_vencimento: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        index=True,
        comment="Contract end/renewal date",
    )

    data_assinatura: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Date contract was signed",
    )

    # Billing settings
    dia_vencimento_fatura: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
        comment="Day of month for invoice due date (1-31)",
    )

    dias_lembrete_antes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=7,
        comment="Days before due date to send reminder",
    )

    dias_cobranca_apos: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: [1, 7, 15],
        server_default="[1, 7, 15]",
        comment="Days after due date to send collection notices (escalating)",
    )

    # Content
    conteudo_html: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Full contract body in HTML for rich text editing and PDF/DOCX export",
    )

    clausulas: Mapped[Optional[list]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Contract clauses as JSON array [{titulo, descricao}]",
    )

    observacoes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Internal notes",
    )

    documento_url: Mapped[Optional[str]] = mapped_column(
        String(1000),
        nullable=True,
        comment="URL to signed document in S3",
    )

    # Relationships
    client: Mapped["Client"] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )

    assigned_user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[assigned_to],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Contrato(id={self.id}, numero={self.numero_contrato}, status={self.status})>"
