"""Pydantic schemas for Financial dashboard and transactions."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from domains.jusmonitoria.db.models.lancamento import CategoriaLancamento, TipoLancamento


class ResumoReceitas(BaseModel):
    """Revenue summary."""

    total_faturado: float = Field(description="Total billed in the period")
    total_recebido: float = Field(description="Total received in the period")
    total_a_receber: float = Field(description="Total pending to receive")
    total_em_atraso: float = Field(description="Total overdue")


class DashboardFinanceiroResponse(BaseModel):
    """Financial dashboard response."""

    resumo: ResumoReceitas
    contratos_ativos: int = Field(description="Number of active contracts")
    faturas_pendentes: int = Field(description="Number of pending invoices")
    faturas_vencidas: int = Field(description="Number of overdue invoices")
    receita_por_mes: list[dict] = Field(
        default_factory=list,
        description="Revenue by month [{mes, valor_faturado, valor_recebido}]",
    )


class LancamentoCreate(BaseModel):
    """Schema for creating a financial transaction."""

    contrato_id: Optional[UUID] = Field(None, description="Contrato relacionado")
    fatura_id: Optional[UUID] = Field(None, description="Fatura relacionada")
    client_id: Optional[UUID] = Field(None, description="Cliente relacionado")
    tipo: TipoLancamento = Field(..., description="Receita ou despesa")
    categoria: CategoriaLancamento = Field(
        default=CategoriaLancamento.HONORARIOS,
        description="Categoria do lançamento",
    )
    descricao: str = Field(..., min_length=1, max_length=500, description="Descrição")
    valor: Decimal = Field(..., gt=0, description="Valor")
    data_lancamento: date = Field(..., description="Data do lançamento")
    data_competencia: Optional[date] = Field(None, description="Data de competência")
    observacoes: Optional[str] = Field(None, description="Observações")


class LancamentoResponse(BaseModel):
    """Schema for transaction response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    contrato_id: Optional[UUID] = None
    fatura_id: Optional[UUID] = None
    client_id: Optional[UUID] = None
    tipo: TipoLancamento
    categoria: CategoriaLancamento
    descricao: str
    valor: Decimal
    data_lancamento: date
    data_competencia: Optional[date] = None
    observacoes: Optional[str] = None
    chatwit_order_nsu: Optional[str] = None
    receipt_url: Optional[str] = None
    client_name: Optional[str] = None
    contrato_titulo: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LancamentoListResponse(BaseModel):
    """Schema for paginated transaction list response."""

    items: list[LancamentoResponse]
    total: int
    skip: int
    limit: int


class RelatorioFilter(BaseModel):
    """Filter parameters for financial reports."""

    data_inicio: date = Field(..., description="Start date")
    data_fim: date = Field(..., description="End date")
    client_id: Optional[UUID] = Field(None, description="Filter by client")
    contrato_id: Optional[UUID] = Field(None, description="Filter by contract")
