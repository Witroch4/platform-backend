"""Pydantic schemas for Invoice (Fatura) API."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from domains.jusmonitoria.db.models.fatura import FormaPagamento, StatusFatura


class FaturaCreate(BaseModel):
    """Schema for creating an invoice."""

    contrato_id: UUID = Field(..., description="ID do contrato")
    client_id: UUID = Field(..., description="ID do cliente")
    referencia: Optional[str] = Field(None, max_length=20, description="Referência (ex: 2026-03)")
    valor: Decimal = Field(..., gt=0, description="Valor da fatura")
    data_vencimento: date = Field(..., description="Data de vencimento")
    observacoes: Optional[str] = Field(None, description="Observações")


class FaturaUpdate(BaseModel):
    """Schema for updating an invoice (e.g., registering payment)."""

    status: Optional[StatusFatura] = None
    valor_pago: Optional[Decimal] = Field(None, ge=0)
    data_pagamento: Optional[date] = None
    forma_pagamento: Optional[FormaPagamento] = None
    observacoes: Optional[str] = None
    nosso_numero: Optional[str] = Field(None, max_length=50)


class FaturaResponse(BaseModel):
    """Schema for invoice response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    contrato_id: UUID
    client_id: UUID
    client_name: Optional[str] = None
    contrato_titulo: Optional[str] = None
    numero: str
    referencia: Optional[str] = None
    valor: Decimal
    valor_pago: Decimal
    data_vencimento: date
    data_pagamento: Optional[date] = None
    status: StatusFatura
    forma_pagamento: Optional[FormaPagamento] = None
    observacoes: Optional[str] = None
    nosso_numero: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FaturaListResponse(BaseModel):
    """Schema for paginated invoice list response."""

    items: list[FaturaResponse]
    total: int
    skip: int
    limit: int
