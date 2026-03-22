"""FastAPI admin routes for WhatsApp Templates management."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.flow.admin_templates_service import (
    TemplateServiceError,
    check_template_status,
    create_template,
    delete_inbox_template,
    delete_template_meta,
    edit_template,
    ensure_media,
    get_template_details,
    list_inbox_templates,
    list_templates,
    upsert_inbox_template,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/mtf-diamante/templates",
    tags=["socialwise-admin-templates"],
)


def _error_response(exc: TemplateServiceError) -> JSONResponse:
    payload: dict[str, Any] = {"success": False, "error": exc.message}
    if exc.payload:
        payload.update(exc.payload)
    return JSONResponse(payload, status_code=exc.status_code)


async def _parse_json(request: Request) -> dict[str, Any]:
    try:
        return await request.json()
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Main templates CRUD (Meta API integration)
# ---------------------------------------------------------------------------


@router.get("")
async def list_templates_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    category: str | None = Query(default=None),
    language: str | None = Query(default=None),
    refresh: bool = Query(default=False),
    mock: bool = Query(default=False),
):
    try:
        return await list_templates(
            session,
            proxy.user_id,
            category=category,
            language=language,
            refresh=refresh,
            mock=mock,
        )
    except TemplateServiceError as exc:
        return _error_response(exc)


@router.post("")
async def create_template_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    body = await _parse_json(request)
    try:
        return await create_template(session, proxy.user_id, body)
    except TemplateServiceError as exc:
        return _error_response(exc)


@router.delete("")
async def delete_template_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    body = await _parse_json(request)
    try:
        return await delete_template_meta(session, proxy.user_id, body)
    except TemplateServiceError as exc:
        return _error_response(exc)


# ---------------------------------------------------------------------------
# Template details
# ---------------------------------------------------------------------------


@router.get("/details/{template_id}")
async def template_details_route(
    template_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        return await get_template_details(session, template_id)
    except TemplateServiceError as exc:
        return _error_response(exc)


# ---------------------------------------------------------------------------
# Ensure media (public URL)
# ---------------------------------------------------------------------------


@router.post("/ensure-media")
async def ensure_media_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    body = await _parse_json(request)
    template_id = body.get("templateId")
    if not template_id or not isinstance(template_id, str):
        return JSONResponse({"error": "templateId inválido."}, status_code=400)

    try:
        return await ensure_media(session, proxy.user_id, template_id)
    except TemplateServiceError as exc:
        return _error_response(exc)


# ---------------------------------------------------------------------------
# Edit template on Meta
# ---------------------------------------------------------------------------


@router.put("/edit/{meta_template_id}")
async def edit_template_route(
    meta_template_id: str,
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    body = await _parse_json(request)
    try:
        return await edit_template(session, proxy.user_id, meta_template_id, body)
    except TemplateServiceError as exc:
        return _error_response(exc)


# ---------------------------------------------------------------------------
# Inbox-scoped templates
# ---------------------------------------------------------------------------


@router.get("/{inbox_id}")
async def list_inbox_templates_route(
    inbox_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        return await list_inbox_templates(session, inbox_id)
    except TemplateServiceError as exc:
        return _error_response(exc)


@router.post("/{inbox_id}")
async def upsert_inbox_template_route(
    inbox_id: str,
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    body = await _parse_json(request)
    try:
        result = await upsert_inbox_template(session, proxy.user_id, inbox_id, body)
        return JSONResponse(result, status_code=201)
    except TemplateServiceError as exc:
        return _error_response(exc)


@router.delete("/{inbox_id}/{template_id}")
async def delete_inbox_template_route(
    inbox_id: str,
    template_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        return await delete_inbox_template(session, template_id)
    except TemplateServiceError as exc:
        return _error_response(exc)


# ---------------------------------------------------------------------------
# Template status sync (Meta API)
# ---------------------------------------------------------------------------


@router.get("/{inbox_id}/{template_id}/status")
async def template_status_route(
    inbox_id: str,
    template_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        return await check_template_status(session, proxy.user_id, template_id)
    except TemplateServiceError as exc:
        return _error_response(exc)
