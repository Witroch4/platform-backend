"""FastAPI admin routes for the Leads Análise + Recurso group (B.7.5c).

Port of:
- app/api/admin/leads-chatwit/enviar-analise/route.ts (POST)
- app/api/admin/leads-chatwit/enviar-analise-validada/route.ts (POST)
- app/api/admin/leads-chatwit/gerar-recurso-interno/route.ts (POST)
- app/api/admin/leads-chatwit/enviar-recurso-validado/route.ts (POST)
- app/api/admin/leads-chatwit/enviar-consultoriafase2/route.ts (POST)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.leads.admin_leads_analise_service import (
    AnaliseServiceError,
    enviar_analise,
    enviar_analise_validada,
    enviar_consultoriafase2,
    enviar_recurso_validado,
    gerar_recurso_interno,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads-analise"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class EnviarAnaliseRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str | None = None
    leadID: str | None = None
    sourceId: str | None = None
    selectedProvider: str | None = None


class EnviarAnaliseValidadaRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadID: str
    analiseData: Any | None = None


class GerarRecursoInternoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    analiseValidada: Any
    dadosAdicionais: dict[str, Any] | None = None
    selectedProvider: str | None = None


class EnviarRecursoValidadoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadID: str
    html: str
    textoRecurso: str | None = None
    message: str | None = None
    accessToken: str | None = None


class EnviarConsultoriaFase2Request(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadID: str


# ---------------------------------------------------------------------------
# enviar-analise
# ---------------------------------------------------------------------------


@router.post("/enviar-analise")
async def post_enviar_analise(
    body: EnviarAnaliseRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await enviar_analise(session, payload)
        status_code = result.pop("_status_code", 200)
        return JSONResponse(content=result, status_code=status_code)
    except AnaliseServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# enviar-analise-validada
# ---------------------------------------------------------------------------


@router.post("/enviar-analise-validada")
async def post_enviar_analise_validada(
    body: EnviarAnaliseValidadaRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await enviar_analise_validada(session, payload)
        return JSONResponse(content=result)
    except AnaliseServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# gerar-recurso-interno
# ---------------------------------------------------------------------------


@router.post("/gerar-recurso-interno")
async def post_gerar_recurso_interno(
    body: GerarRecursoInternoRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await gerar_recurso_interno(session, payload)
        status_code = result.pop("_status_code", 200)
        return JSONResponse(content=result, status_code=status_code)
    except AnaliseServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# enviar-recurso-validado
# ---------------------------------------------------------------------------


@router.post("/enviar-recurso-validado")
async def post_enviar_recurso_validado(
    body: EnviarRecursoValidadoRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await enviar_recurso_validado(session, payload)
        return JSONResponse(content=result)
    except AnaliseServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# enviar-consultoriafase2
# ---------------------------------------------------------------------------


@router.post("/enviar-consultoriafase2")
async def post_enviar_consultoriafase2(
    body: EnviarConsultoriaFase2Request,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await enviar_consultoriafase2(session, payload)
        return JSONResponse(content=result)
    except AnaliseServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
