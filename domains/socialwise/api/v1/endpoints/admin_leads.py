"""FastAPI admin routes for the Leads group (B.7.5a — Core).

Port of:
- app/api/admin/leads-chatwit/leads/route.ts (GET, POST, DELETE)
- app/api/admin/leads-chatwit/lead-status/route.ts (GET)
- app/api/admin/leads-chatwit/stats/route.ts (GET)
- app/api/admin/leads-chatwit/usuarios/route.ts (GET, DELETE)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.leads.admin_leads_service import (
    LeadsServiceError,
    delete_lead,
    delete_usuario,
    get_lead_status,
    get_stats,
    list_leads,
    list_usuarios,
    update_lead,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class UpdateLeadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str
    nomeReal: str | None = None
    email: str | None = None
    anotacoes: str | None = None
    concluido: bool | None = None
    fezRecurso: bool | None = None
    datasRecurso: str | None = None
    textoDOEspelho: Any | None = None
    espelhoCorrecao: str | None = None
    pdfUnificado: str | None = None
    imagensConvertidas: Any | None = None
    analiseUrl: str | None = None
    analiseProcessada: bool | None = None
    aguardandoAnalise: bool | None = None
    analisePreliminar: Any | None = None
    analiseValidada: bool | None = None
    consultoriaFase2: bool | None = None
    alwaysShowInLeadList: bool | None = None
    recursoPreliminar: Any | None = None
    aguardandoManuscrito: bool | None = None
    manuscritoProcessado: bool | None = None
    provaManuscrita: Any | None = None
    aguardandoEspelho: bool | None = None
    espelhoProcessado: bool | None = None


# ---------------------------------------------------------------------------
# Routes: Leads
# ---------------------------------------------------------------------------

@router.get("/leads")
async def api_list_leads(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str | None = Query(default=None),
    usuarioId: str | None = Query(default=None),
    search: str | None = Query(default=None),
    visibility: str = Query(default="all"),
    marketing: bool = Query(default=False),
    fezRecurso: bool = Query(default=False),
    semRecurso: bool = Query(default=False),
    concluido: bool = Query(default=False),
    updatedAfter: str | None = Query(default=None),
    updatedBefore: str | None = Query(default=None),
    onlyWithPhone: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=200),
) -> Any:
    result = await list_leads(
        session,
        ctx.user_id,
        lead_id=id,
        usuario_id=usuarioId,
        search=search,
        visibility=visibility,
        marketing_mode=marketing,
        fez_recurso=fezRecurso,
        sem_recurso=semRecurso,
        concluido=concluido,
        updated_after=updatedAfter,
        updated_before=updatedBefore,
        only_with_phone=onlyWithPhone,
        page=page,
        limit=limit,
    )
    if result is None:
        return JSONResponse({"error": "Lead não encontrado"}, status_code=404)
    return result


@router.post("/leads")
async def api_update_lead(
    request: UpdateLeadRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    if not request.id:
        return JSONResponse({"error": "ID do lead é obrigatório"}, status_code=400)
    try:
        return await update_lead(session, ctx.user_id, request.id, request.model_dump(exclude_none=True))
    except LeadsServiceError as e:
        return JSONResponse({"error": str(e)}, status_code=404)


@router.delete("/leads")
async def api_delete_lead(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str | None = Query(default=None),
) -> Any:
    if not id:
        return JSONResponse({"error": "ID do lead é obrigatório"}, status_code=400)
    try:
        await delete_lead(session, ctx.user_id, id)
        return {"success": True, "message": "Lead removido com sucesso"}
    except LeadsServiceError as e:
        return JSONResponse({"error": str(e)}, status_code=404)


# ---------------------------------------------------------------------------
# Routes: Lead Status
# ---------------------------------------------------------------------------

@router.get("/lead-status")
async def api_lead_status(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str | None = Query(default=None),
) -> Any:
    if not id:
        return JSONResponse({"error": "ID do lead não fornecido"}, status_code=400)
    result = await get_lead_status(session, id)
    if result is None:
        return JSONResponse({"error": "Lead não encontrado"}, status_code=404)
    return result


# ---------------------------------------------------------------------------
# Routes: Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def api_leads_stats(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    return await get_stats(session, ctx.user_id)


# ---------------------------------------------------------------------------
# Routes: Usuarios
# ---------------------------------------------------------------------------

@router.get("/usuarios")
async def api_list_usuarios(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
) -> Any:
    return await list_usuarios(session, ctx.user_id, search=search, page=page, limit=limit)


@router.delete("/usuarios")
async def api_delete_usuario(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str | None = Query(default=None),
) -> Any:
    if not id:
        return JSONResponse({"error": "ID do usuário é obrigatório"}, status_code=400)
    try:
        await delete_usuario(session, ctx.user_id, id)
        return {"success": True, "message": "Usuário e todos os seus dados removidos com sucesso"}
    except LeadsServiceError as e:
        code = 403 if "Acesso negado" in str(e) else 404
        return JSONResponse({"error": str(e)}, status_code=code)
