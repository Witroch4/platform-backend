"""FastAPI admin routes for the Leads Operations group (B.7.5e).

Port of:
- app/api/admin/leads-chatwit/operations/status/route.ts (GET)
- app/api/admin/leads-chatwit/operations/cancel/route.ts (POST)
- app/api/admin/leads-chatwit/batch/send-for-analysis/route.ts (POST)
- app/api/admin/leads-chatwit/atualizar-especialidade/route.ts (PUT)
- app/api/admin/leads-chatwit/register-token/route.ts (POST, GET)
- app/api/admin/leads-chatwit/custom-token/route.ts (deprecated 410)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.leads.admin_leads_operations_service import (
    OperationsServiceError,
    atualizar_especialidade,
    batch_send_for_analysis,
    cancel_operation,
    get_operation_status,
    get_token_info,
    register_token,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads-operations"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CancelOperationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str | None = None
    leadID: str | None = None
    stage: str


class BatchAnalysisItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    manuscrito: Any | None = None
    espelho: Any | None = None


class AtualizarEspecialidadeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    especialidade: str | None = None
    espelhoPadraoId: str | None = None


class RegisterTokenRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    chatwitAccessToken: str
    chatwitAccountId: str


# ---------------------------------------------------------------------------
# operations/status (GET)
# ---------------------------------------------------------------------------


@router.get("/operations/status")
async def get_status(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: str = Query(...),
    stage: str = Query(...),
):
    try:
        result = await get_operation_status(session, leadId, stage)
        return JSONResponse(content=result)
    except OperationsServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# operations/cancel (POST)
# ---------------------------------------------------------------------------


@router.post("/operations/cancel")
async def post_cancel(
    body: CancelOperationRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    lead_id = body.leadId or body.leadID
    if not lead_id:
        return JSONResponse(content={"error": "leadId é obrigatório"}, status_code=400)

    try:
        result = await cancel_operation(session, lead_id, body.stage)
        status_code = result.pop("_status_code", 200)
        return JSONResponse(content=result, status_code=status_code)
    except OperationsServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# batch/send-for-analysis (POST)
# ---------------------------------------------------------------------------


@router.post("/batch/send-for-analysis")
async def post_batch_send(
    body: list[BatchAnalysisItem],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    if not body:
        return JSONResponse(content={"error": "Dados inválidos"}, status_code=400)

    try:
        items = [item.model_dump(exclude_unset=True) for item in body]
        result = await batch_send_for_analysis(session, items)
        status_code = result.pop("_status_code", 200)
        return JSONResponse(content=result, status_code=status_code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# atualizar-especialidade (PUT)
# ---------------------------------------------------------------------------


@router.put("/atualizar-especialidade")
async def put_atualizar_especialidade(
    body: AtualizarEspecialidadeRequest,
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await atualizar_especialidade(session, payload)
        return JSONResponse(content=result)
    except OperationsServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# register-token (POST + GET)
# ---------------------------------------------------------------------------


@router.post("/register-token")
async def post_register_token(
    body: RegisterTokenRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await register_token(
            session,
            user_id=ctx.user_id,
            user_name=None,
            user_email=None,
            chatwit_access_token=body.chatwitAccessToken,
            chatwit_account_id=body.chatwitAccountId,
        )
        return JSONResponse(content=result)
    except OperationsServiceError as e:
        code = 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.get("/register-token")
async def get_register_token(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await get_token_info(
            session,
            user_id=ctx.user_id,
            user_name=None,
            user_email=None,
        )
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# custom-token (deprecated — 410 Gone)
# ---------------------------------------------------------------------------


@router.get("/custom-token")
async def get_custom_token():
    return JSONResponse(
        content={"error": "Rota obsoleta. Use o token do usuário (User.chatwitAccessToken)."},
        status_code=410,
    )


@router.post("/custom-token")
async def post_custom_token():
    return JSONResponse(
        content={"error": "Rota obsoleta. Use o token do usuário (User.chatwitAccessToken)."},
        status_code=410,
    )
