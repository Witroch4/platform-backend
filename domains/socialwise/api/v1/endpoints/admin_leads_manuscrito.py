"""FastAPI admin routes for the Leads Manuscrito + Espelho group (B.7.5b).

Port of:
- app/api/admin/leads-chatwit/manuscrito/route.ts (PUT, DELETE)
- app/api/admin/leads-chatwit/enviar-manuscrito/route.ts (POST)
- app/api/admin/leads-chatwit/convert-to-images/route.ts (POST, GET)
- app/api/admin/leads-chatwit/deletar-espelho/route.ts (DELETE, PUT)
- app/api/admin/leads-chatwit/espelhos-padrao/route.ts (GET, POST, PUT)
- app/api/admin/leads-chatwit/biblioteca-espelhos/route.ts (GET, POST, PUT, DELETE)
- app/api/admin/leads-chatwit/associar-espelho/route.ts (POST)
- app/api/admin/leads-chatwit/oab-rubrics/route.ts (GET)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.leads.admin_leads_manuscrito_service import (
    ManuscritoServiceError,
    associar_espelho,
    convert_pdf_to_images,
    create_biblioteca_espelho,
    delete_biblioteca_espelho,
    delete_espelho,
    delete_manuscrito,
    enviar_documento,
    get_converted_images,
    list_biblioteca_espelhos,
    list_espelhos_padrao,
    list_oab_rubrics,
    save_espelho,
    update_biblioteca_espelho,
    update_espelho_padrao,
    update_manuscrito,
    upsert_espelho_padrao,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads-manuscrito"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ManuscritoUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    texto: Any


class EspelhoSaveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    texto: Any | None = None
    imagens: Any | None = None


class EnviarDocumentoRequest(BaseModel):
    """Flexible payload — matches the diverse frontend submissions."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")


class ConvertPdfRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    pdfUrls: list[str] | None = None


class EspelhoPadraoCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    especialidade: str
    nome: str
    descricao: str | None = None
    usuarioId: str | None = None
    espelhoCorrecao: str | None = None
    tipoProcessamento: str | None = None


class EspelhoPadraoUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    id: str
    textoMarkdown: str | None = None
    processado: bool | None = None
    aguardandoProcessamento: bool | None = None


class BibliotecaCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    nome: str
    usuarioId: str
    descricao: str | None = None
    textoDOEspelho: Any | None = None
    espelhoCorrecao: str | None = None


class BibliotecaUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    id: str
    nome: str | None = None
    descricao: str | None = None
    textoDOEspelho: Any | None = None
    espelhoCorrecao: str | None = None
    espelhoBibliotecaProcessado: bool | None = None
    aguardandoEspelho: bool | None = None


class AssociarEspelhoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    espelhoId: str | None = None


# ---------------------------------------------------------------------------
# manuscrito
# ---------------------------------------------------------------------------


@router.put("/manuscrito")
async def put_manuscrito(
    body: ManuscritoUpdateRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await update_manuscrito(session, body.leadId, body.texto)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.delete("/manuscrito")
async def del_manuscrito(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: str = Query(...),
):
    try:
        result = await delete_manuscrito(session, leadId)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# enviar-manuscrito
# ---------------------------------------------------------------------------


@router.post("/enviar-manuscrito")
async def post_enviar_manuscrito(
    body: EnviarDocumentoRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        payload = body.model_dump(exclude_unset=True)
        result = await enviar_documento(session, payload)
        status_code = 202 if result.get("mode") == "queued" else 200
        return JSONResponse(content=result, status_code=status_code)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# convert-to-images
# ---------------------------------------------------------------------------


@router.post("/convert-to-images")
async def post_convert_to_images(
    body: ConvertPdfRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await convert_pdf_to_images(session, body.leadId, body.pdfUrls)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.get("/convert-to-images")
async def get_convert_to_images(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: str = Query(...),
):
    try:
        result = await get_converted_images(session, leadId)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# deletar-espelho
# ---------------------------------------------------------------------------


@router.delete("/deletar-espelho")
async def del_espelho(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: str = Query(...),
):
    try:
        result = await delete_espelho(session, leadId)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.put("/deletar-espelho")
async def put_espelho(
    body: EspelhoSaveRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await save_espelho(session, body.leadId, body.texto, body.imagens)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# espelhos-padrao
# ---------------------------------------------------------------------------


@router.get("/espelhos-padrao")
async def get_espelhos_padrao(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    especialidade: str | None = Query(None),
):
    try:
        result = await list_espelhos_padrao(session, especialidade)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.post("/espelhos-padrao")
async def post_espelhos_padrao(
    body: EspelhoPadraoCreateRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await upsert_espelho_padrao(
            session,
            body.especialidade,
            body.nome,
            body.descricao,
            body.usuarioId,
            body.espelhoCorrecao,
            body.tipoProcessamento,
        )
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.put("/espelhos-padrao")
async def put_espelhos_padrao(
    body: EspelhoPadraoUpdateRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await update_espelho_padrao(
            session, body.id, body.textoMarkdown, body.processado, body.aguardandoProcessamento
        )
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# biblioteca-espelhos
# ---------------------------------------------------------------------------


@router.get("/biblioteca-espelhos")
async def get_biblioteca_espelhos(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    usuarioId: str = Query(...),
):
    try:
        result = await list_biblioteca_espelhos(session, usuarioId)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.post("/biblioteca-espelhos")
async def post_biblioteca_espelhos(
    body: BibliotecaCreateRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await create_biblioteca_espelho(
            session, body.nome, body.usuarioId, body.descricao,
            body.textoDOEspelho, body.espelhoCorrecao,
        )
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.put("/biblioteca-espelhos")
async def put_biblioteca_espelhos(
    body: BibliotecaUpdateRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await update_biblioteca_espelho(
            session, body.id, body.nome, body.descricao,
            body.textoDOEspelho, body.espelhoCorrecao,
            body.espelhoBibliotecaProcessado, body.aguardandoEspelho,
        )
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.delete("/biblioteca-espelhos")
async def del_biblioteca_espelhos(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str = Query(...),
):
    try:
        result = await delete_biblioteca_espelho(session, id)
        return JSONResponse(content=result)
    except ManuscritoServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# associar-espelho
# ---------------------------------------------------------------------------


@router.post("/associar-espelho")
async def post_associar_espelho(
    body: AssociarEspelhoRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await associar_espelho(session, body.leadId, body.espelhoId)
        status_code = 404 if "não encontrado" in result.get("message", "").lower() else 200
        return JSONResponse(content=result, status_code=status_code)
    except ManuscritoServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# oab-rubrics
# ---------------------------------------------------------------------------


@router.get("/oab-rubrics")
async def get_oab_rubrics(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await list_oab_rubrics(session)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
