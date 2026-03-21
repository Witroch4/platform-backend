"""Invoice (Fatura) model for financial management."""

import enum
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domains.jusmonitoria.db.base import TenantBaseModel


class StatusFatura(str, enum.Enum):
    """Invoice status."""

    PENDENTE = "pendente"
    PAGA = "paga"
    VENCIDA = "vencida"
    CANCELADA = "cancelada"
    PARCIAL = "parcial"


class FormaPagamento(str, enum.Enum):
    """Payment method."""

    PIX = "pix"
    BOLETO = "boleto"
    TRANSFERENCIA = "transferencia"
    CARTAO = "cartao"
    DINHEIRO = "dinheiro"


class Fatura(TenantBaseModel):
    """
    Invoice model linked to contracts.

    Represents monthly or one-time invoices generated from contracts.
    """

    __tablename__ = "faturas"

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
        comment="Contract this invoice belongs to",
    )

    client_id: Mapped[UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Client to be billed",
    )

    # Identification
    numero: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Invoice number",
    )

    referencia: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Reference period (e.g. 2026-03)",
    )

    # Financial
    valor: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        nullable=False,
        comment="Invoice amount",
    )

    valor_pago: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0.00",
        comment="Amount paid",
    )

    # Dates
    data_vencimento: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
        comment="Due date",
    )

    data_pagamento: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Payment date",
    )

    # Status and payment
    status: Mapped[StatusFatura] = mapped_column(
        Enum(StatusFatura, name="status_fatura", native_enum=False),
        nullable=False,
        default=StatusFatura.PENDENTE,
        index=True,
        comment="Invoice status",
    )

    forma_pagamento: Mapped[Optional[FormaPagamento]] = mapped_column(
        Enum(FormaPagamento, name="forma_pagamento", native_enum=False),
        nullable=True,
        comment="Payment method used",
    )

    # Extra
    observacoes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Notes about this invoice",
    )

    nosso_numero: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="Bank boleto reference number",
    )

    # Relationships
    contrato: Mapped["Contrato"] = relationship(
        "Contrato",
        foreign_keys=[contrato_id],
        lazy="selectin",
    )

    client: Mapped["Client"] = relationship(
        "Client",
        foreign_keys=[client_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Fatura(id={self.id}, numero={self.numero}, status={self.status})>"
