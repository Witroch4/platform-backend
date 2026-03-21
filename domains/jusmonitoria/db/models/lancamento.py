"""Financial transaction (Lancamento) model."""

import enum
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class TipoLancamento(str, enum.Enum):
    """Transaction type."""

    RECEITA = "receita"
    DESPESA = "despesa"


class CategoriaLancamento(str, enum.Enum):
    """Transaction category."""

    HONORARIOS = "honorarios"
    CUSTAS = "custas"
    PERICIA = "pericia"
    DESLOCAMENTO = "deslocamento"
    EXITO = "exito"
    OUTROS = "outros"


class Lancamento(TenantBaseModel):
    """
    Financial transaction model.

    Represents individual revenue or expense entries,
    optionally linked to contracts and invoices.
    """

    __tablename__ = "lancamentos"

    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    contrato_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("contratos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Related contract",
    )

    fatura_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("faturas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Related invoice",
    )

    client_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Related client",
    )

    # Classification
    tipo: Mapped[TipoLancamento] = mapped_column(
        Enum(TipoLancamento, name="tipo_lancamento", native_enum=False),
        nullable=False,
        index=True,
        comment="Revenue or expense",
    )

    categoria: Mapped[CategoriaLancamento] = mapped_column(
        Enum(CategoriaLancamento, name="categoria_lancamento", native_enum=False),
        nullable=False,
        default=CategoriaLancamento.HONORARIOS,
        comment="Transaction category",
    )

    descricao: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="Transaction description",
    )

    # Financial
    valor: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        nullable=False,
        comment="Transaction amount",
    )

    # Dates
    data_lancamento: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
        comment="Transaction date",
    )

    data_competencia: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Accrual date (competence period)",
    )

    # Chatwit integration
    chatwit_order_nsu: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        unique=True,
        index=True,
        comment="Chatwit/InfinitePay order NSU for idempotency",
    )

    receipt_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Payment receipt URL from provider",
    )

    # Extra
    observacoes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Notes",
    )

    # Relationships
    contrato: Mapped[Optional["Contrato"]] = relationship(
        "Contrato",
        foreign_keys=[contrato_id],
        lazy="selectin",
    )

    fatura: Mapped[Optional["Fatura"]] = relationship(
        "Fatura",
        foreign_keys=[fatura_id],
        lazy="selectin",
    )

    client: Mapped[Optional["Client"]] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Lancamento(id={self.id}, tipo={self.tipo}, valor={self.valor})>"
