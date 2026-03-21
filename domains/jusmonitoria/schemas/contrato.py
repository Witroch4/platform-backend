"""Pydantic schemas for Contract API."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from domains.jusmonitoria.db.models.contrato import IndiceReajuste, StatusContrato, TipoContrato


class ClausulaContrato(BaseModel):
    """Schema for a contract clause."""

    titulo: str = Field(..., min_length=1, max_length=255)
    descricao: str = Field(..., min_length=1)


class ContratoBase(BaseModel):
    """Base contract schema with common fields."""

    titulo: str = Field(..., min_length=1, max_length=500, description="Título do contrato")
    descricao: Optional[str] = Field(None, description="Descrição do contrato")
    tipo: TipoContrato = Field(default=TipoContrato.PRESTACAO_SERVICOS, description="Tipo do contrato")
    client_id: UUID = Field(..., description="ID do cliente")
    assigned_to: Optional[UUID] = Field(None, description="Advogado responsável")
    valor_total: Optional[Decimal] = Field(None, ge=0, description="Valor total do contrato")
    valor_mensal: Optional[Decimal] = Field(None, ge=0, description="Valor mensal (fee)")
    valor_entrada: Optional[Decimal] = Field(None, ge=0, description="Valor de entrada")
    percentual_exito: Optional[Decimal] = Field(None, ge=0, le=100, description="Percentual de êxito")
    indice_reajuste: Optional[IndiceReajuste] = Field(None, description="Índice de reajuste")
    data_inicio: Optional[date] = Field(None, description="Data de início")
    data_vencimento: Optional[date] = Field(None, description="Data de vencimento/renovação")
    data_assinatura: Optional[date] = Field(None, description="Data de assinatura")
    dia_vencimento_fatura: int = Field(default=10, ge=1, le=31, description="Dia do vencimento da fatura")
    dias_lembrete_antes: int = Field(default=7, ge=1, le=30, description="Dias antes do vencimento para lembrete")
    dias_cobranca_apos: list[int] = Field(
        default=[1, 7, 15],
        description="Dias após vencimento para cobranças escalonadas",
    )
    conteudo_html: Optional[str] = Field(None, description="Corpo completo do contrato em HTML (editor rich text)")
    clausulas: Optional[list[ClausulaContrato]] = Field(None, description="Cláusulas do contrato")
    observacoes: Optional[str] = Field(None, description="Observações internas")
    documento_url: Optional[str] = Field(None, max_length=1000, description="URL do documento assinado")


class ContratoCreate(ContratoBase):
    """Schema for creating a new contract."""
    pass


class ContratoUpdate(BaseModel):
    """Schema for updating an existing contract."""

    titulo: Optional[str] = Field(None, min_length=1, max_length=500)
    descricao: Optional[str] = None
    tipo: Optional[TipoContrato] = None
    status: Optional[StatusContrato] = None
    client_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    valor_total: Optional[Decimal] = Field(None, ge=0)
    valor_mensal: Optional[Decimal] = Field(None, ge=0)
    valor_entrada: Optional[Decimal] = Field(None, ge=0)
    percentual_exito: Optional[Decimal] = Field(None, ge=0, le=100)
    indice_reajuste: Optional[IndiceReajuste] = None
    data_inicio: Optional[date] = None
    data_vencimento: Optional[date] = None
    data_assinatura: Optional[date] = None
    dia_vencimento_fatura: Optional[int] = Field(None, ge=1, le=31)
    dias_lembrete_antes: Optional[int] = Field(None, ge=1, le=30)
    dias_cobranca_apos: Optional[list[int]] = None
    conteudo_html: Optional[str] = None
    clausulas: Optional[list[ClausulaContrato]] = None
    observacoes: Optional[str] = None
    documento_url: Optional[str] = Field(None, max_length=1000)


class ContratoResponse(BaseModel):
    """Schema for contract response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    numero_contrato: str
    titulo: str
    descricao: Optional[str] = None
    tipo: TipoContrato
    status: StatusContrato
    client_id: UUID
    client_name: Optional[str] = None
    assigned_to: Optional[UUID] = None
    assigned_user_name: Optional[str] = None
    valor_total: Optional[Decimal] = None
    valor_mensal: Optional[Decimal] = None
    valor_entrada: Optional[Decimal] = None
    percentual_exito: Optional[Decimal] = None
    indice_reajuste: Optional[IndiceReajuste] = None
    data_inicio: Optional[date] = None
    data_vencimento: Optional[date] = None
    data_assinatura: Optional[date] = None
    dia_vencimento_fatura: int
    dias_lembrete_antes: int
    dias_cobranca_apos: list[int]
    conteudo_html: Optional[str] = None
    clausulas: Optional[list[ClausulaContrato]] = None
    observacoes: Optional[str] = None
    documento_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ContratoListResponse(BaseModel):
    """Schema for paginated contract list response."""

    items: list[ContratoResponse]
    total: int
    skip: int
    limit: int
