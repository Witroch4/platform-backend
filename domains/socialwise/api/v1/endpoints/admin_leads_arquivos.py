"""FastAPI admin routes for the Leads Arquivos + Documentos group (B.7.5d).

Port of:
- app/api/admin/leads-chatwit/arquivos/route.ts (GET, POST, DELETE, PATCH)
- app/api/admin/leads-chatwit/upload-files/route.ts (POST)
- app/api/admin/leads-chatwit/unify/route.ts (GET, POST)
- app/api/admin/leads-chatwit/enviar-pdf-analise-lead/route.ts (POST)
- app/api/admin/leads-chatwit/enviar-pdf-recurso-lead/route.ts (POST)
- app/api/admin/leads-chatwit/recebearquivos/route.ts (POST, GET)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.leads.admin_leads_arquivos_service import (
    ArquivosServiceError,
    create_arquivo,
    delete_arquivo,
    enviar_pdf_analise,
    enviar_pdf_recurso,
    get_unified_pdf_url,
    list_arquivos,
    patch_arquivo,
    recebearquivos_health,
    recebearquivos_process,
    unify_files,
    upload_files,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads-arquivos"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CreateArquivoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str
    fileType: str
    dataUrl: str


class PatchArquivoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    id: str
    pdfConvertido: str | None = None


class UnifyRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    leadId: str | None = None
    usuarioId: str | None = None


# ---------------------------------------------------------------------------
# /arquivos — CRUD
# ---------------------------------------------------------------------------


@router.get("/arquivos")
async def get_arquivos(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: str | None = None,
    usuarioId: str | None = None,
):
    try:
        arquivos = await list_arquivos(session, lead_id=leadId, usuario_id=usuarioId)
        return JSONResponse(content={"arquivos": arquivos})
    except ArquivosServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.post("/arquivos")
async def post_arquivo(
    body: CreateArquivoRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await create_arquivo(session, body.leadId, body.fileType, body.dataUrl)
        return JSONResponse(content={"success": True, "arquivo": result})
    except ArquivosServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.delete("/arquivos")
async def delete_arquivo_endpoint(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str | None = None,
    type: str | None = None,
    leadId: str | None = None,
):
    try:
        result = await delete_arquivo(session, id, type, leadId, ctx.role)
        return JSONResponse(content=result)
    except ArquivosServiceError as e:
        if "Unauthorized" in str(e):
            return JSONResponse(content={"error": str(e)}, status_code=401)
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.patch("/arquivos")
async def patch_arquivo_endpoint(
    body: PatchArquivoRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await patch_arquivo(session, body.id, body.pdfConvertido)
        return JSONResponse(content={"success": True, "arquivo": result})
    except ArquivosServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# /upload-files — multipart upload
# ---------------------------------------------------------------------------


@router.post("/upload-files")
async def post_upload_files(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: Annotated[str, Form()],
    files: list[UploadFile] = File(...),
):
    try:
        file_tuples = []
        for f in files:
            data = await f.read()
            file_tuples.append((f.filename or "file", data, f.content_type or "application/octet-stream"))

        result = await upload_files(session, leadId, file_tuples)
        return JSONResponse(content={
            "success": True,
            "message": f"{len(result)} arquivo(s) enviado(s) com sucesso",
            "files": result,
        })
    except ArquivosServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# /unify — PDF merger
# ---------------------------------------------------------------------------


@router.get("/unify")
async def get_unify(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    leadId: str | None = None,
    usuarioId: str | None = None,
):
    try:
        pdf_url = await get_unified_pdf_url(session, lead_id=leadId, usuario_id=usuarioId)
        return RedirectResponse(url=pdf_url)
    except ArquivosServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.post("/unify")
async def post_unify(
    body: UnifyRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        result = await unify_files(session, lead_id=body.leadId, usuario_id=body.usuarioId)
        return JSONResponse(content=result)
    except ArquivosServiceError as e:
        code = 404 if "não encontrado" in str(e).lower() else 400
        return JSONResponse(content={"error": str(e)}, status_code=code)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# /enviar-pdf-analise-lead — send análise PDF to Chatwit
# ---------------------------------------------------------------------------


@router.post("/enviar-pdf-analise-lead")
async def post_enviar_pdf_analise(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    sourceId: str | None = None,
    message: str | None = None,
    accessToken: str | None = None,
):
    if not sourceId:
        return JSONResponse(content={"error": "sourceId obrigatório"}, status_code=400)
    try:
        result = await enviar_pdf_analise(
            session,
            source_id=sourceId,
            message=message or "Segue o documento em anexo.",
            access_token=accessToken,
        )
        return JSONResponse(content=result)
    except ArquivosServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# /enviar-pdf-recurso-lead — send recurso PDF to Chatwit
# ---------------------------------------------------------------------------


@router.post("/enviar-pdf-recurso-lead")
async def post_enviar_pdf_recurso(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    sourceId: str | None = None,
    message: str | None = None,
    accessToken: str | None = None,
):
    if not sourceId:
        return JSONResponse(content={"error": "sourceId obrigatório"}, status_code=400)
    try:
        result = await enviar_pdf_recurso(
            session,
            source_id=sourceId,
            message=message or "Segue o nosso Recurso, qualquer dúvida estamos à disposição.",
            access_token=accessToken,
        )
        return JSONResponse(content=result)
    except ArquivosServiceError as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# /recebearquivos — lead sync webhook
# ---------------------------------------------------------------------------


@router.get("/recebearquivos")
async def get_recebearquivos():
    result = await recebearquivos_health()
    return JSONResponse(content=result)


@router.post("/recebearquivos")
async def post_recebearquivos(
    body: dict[str, Any],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    """Webhook receiver for Chatwit lead sync — no auth required (webhook)."""
    try:
        result = await recebearquivos_process(session, body)
        status_code = result.pop("_status_code", 200)
        return JSONResponse(content=result, status_code=status_code)
    except Exception as e:
        return JSONResponse(
            content={"success": False, "error": "erro interno", "details": str(e)},
            status_code=500,
        )
