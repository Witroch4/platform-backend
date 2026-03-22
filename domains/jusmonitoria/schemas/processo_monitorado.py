"""Pydantic schemas for monitored processes API."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ProcessoMonitoradoCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    numero: str = Field(..., min_length=1, max_length=50)
    apelido: Optional[str] = Field(None, max_length=200)


class ProcessoMonitoradoUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    apelido: Optional[str] = Field(None, max_length=200)


class ProcessoMonitoradoResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    numero: str
    apelido: Optional[str] = None
    dados_datajud: Optional[dict] = None
    ultima_consulta: Optional[datetime] = None
    movimentacoes_conhecidas: int = 0
    novas_movimentacoes: int = 0
    peticao_id: Optional[UUID] = None
    criado_por: Optional[UUID] = None
    criado_em: datetime = Field(validation_alias="created_at")
    atualizado_em: datetime = Field(validation_alias="updated_at")


class ProcessoMonitoradoListResponse(BaseModel):
    items: list[ProcessoMonitoradoResponse]
    total: int
