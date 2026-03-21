"""Pydantic schemas for OAB-scraped cases API."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CasoOABCreate(BaseModel):
    """POST /casos-oab request body for manual process addition."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    numero: str = Field(..., min_length=1, max_length=25, description="Número CNJ do processo")


class CasoOABListItem(BaseModel):
    """Single item in the cases list response."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel, from_attributes=True)

    id: UUID
    numero: str
    classe: Optional[str] = None
    assunto: Optional[str] = None
    partes_resumo: Optional[str] = None
    oab_numero: str
    oab_uf: str
    tribunal: str = "trf1"
    ultima_sincronizacao: Optional[datetime] = None
    total_movimentacoes: int = 0
    novas_movimentacoes: int = 0
    total_documentos: int = 0
    monitoramento_ativo: bool = True
    created_at: datetime


class CasoOABDetail(CasoOABListItem):
    """Full case detail with partes, movimentacoes, and documentos."""

    partes_json: Optional[list[dict[str, Any]]] = None
    movimentacoes_json: Optional[list[dict[str, Any]]] = None
    documentos_json: Optional[list[dict[str, Any]]] = None


class CasoOABListResponse(BaseModel):
    """Paginated list of cases."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    items: list[CasoOABListItem]
    total: int


class SyncStatusResponse(BaseModel):
    """Status of the last OAB sync."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    ultimo_sync: Optional[datetime] = None
    status: str = "idle"
    total_processos: int = 0
    oab_numero: Optional[str] = None
    oab_uf: Optional[str] = None
    is_primary: Optional[bool] = None
    progresso_detalhado: Optional[dict] = None


class SyncTriggerResponse(BaseModel):
    """Response from manual sync trigger."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    sucesso: bool
    mensagem: str = ""
    queued: bool = False
    total: int = 0
    novos_processos: int = 0
    novas_movimentacoes: int = 0


class SyncAllTriggerResponse(BaseModel):
    """Response from sync-all trigger (all user OABs)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    sucesso: bool
    mensagem: str = ""
    total_oabs: int = 0
    enqueued: int = 0
    skipped: int = 0
    details: list[dict] = []


class SyncStatusAllResponse(BaseModel):
    """Sync status for all user OABs."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    statuses: list[SyncStatusResponse] = []
    any_running: bool = False
