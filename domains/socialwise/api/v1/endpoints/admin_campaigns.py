"""FastAPI admin routes for the Flow Builder `Campaigns` group.

Port of:
- app/api/admin/mtf-diamante/campaigns/route.ts
- app/api/admin/mtf-diamante/campaigns/[campaignId]/route.ts
- app/api/admin/mtf-diamante/campaigns/[campaignId]/contacts/route.ts
- app/api/admin/mtf-diamante/campaigns/[campaignId]/progress/route.ts
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.flow.admin_campaigns_service import (
    CampaignServiceError,
    add_contacts_to_campaign,
    cancel_campaign,
    create_campaign,
    delete_campaign,
    get_campaign_detail,
    get_campaign_progress,
    list_campaign_contacts,
    list_campaigns,
    pause_campaign,
    remove_contacts_from_campaign,
    resume_campaign,
    start_campaign,
    update_campaign,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/mtf-diamante/campaigns",
    tags=["socialwise-admin-campaigns"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CreateCampaignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=100)
    flow_id: str = Field(alias="flowId", min_length=1)
    inbox_id: str = Field(alias="inboxId", min_length=1)
    rate_limit: int = Field(default=30, alias="rateLimit", ge=1, le=100)
    variables: dict[str, Any] | None = None


class UpdateCampaignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=100)
    rate_limit: int | None = Field(default=None, alias="rateLimit", ge=1, le=100)
    variables: dict[str, Any] | None = None


class CampaignActionRequest(BaseModel):
    action: str = Field(pattern="^(start|pause|resume|cancel)$")


class ContactItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    contact_id: str = Field(alias="contactId", min_length=1)
    contact_phone: str = Field(alias="contactPhone", min_length=1)
    contact_name: str = Field(default="", alias="contactName")
    variables: dict[str, Any] | None = None


class AddContactsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    contacts: list[ContactItem] | None = None
    select_all: bool = Field(default=False, alias="selectAll")


class RemoveContactsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    contact_ids: list[str] = Field(alias="contactIds", min_length=1)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _service_error_response(exc: CampaignServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.message},
    )


# ---------------------------------------------------------------------------
# Routes: /campaigns
# ---------------------------------------------------------------------------


@router.get("")
async def list_campaigns_route(
    inbox_id: Annotated[str, Query(alias="inboxId")],
    status: Annotated[str | None, Query()] = None,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """List campaigns for an inbox."""
    try:
        data = await list_campaigns(session, inbox_id, status_filter=status)
        return JSONResponse(content={"success": True, "data": data})
    except CampaignServiceError as exc:
        return _service_error_response(exc)


@router.post("")
async def create_campaign_route(
    body: CreateCampaignRequest,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Create a new campaign in DRAFT status."""
    try:
        data = await create_campaign(
            session,
            name=body.name,
            flow_id=body.flow_id,
            inbox_id=body.inbox_id,
            rate_limit=body.rate_limit,
            variables=body.variables,
        )
        return JSONResponse(
            status_code=201,
            content={"success": True, "data": data, "message": "Campanha criada com sucesso"},
        )
    except CampaignServiceError as exc:
        return _service_error_response(exc)


# ---------------------------------------------------------------------------
# Routes: /campaigns/{campaign_id}
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}")
async def get_campaign_route(
    campaign_id: str,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Get full campaign details."""
    try:
        data = await get_campaign_detail(session, campaign_id)
        return JSONResponse(content={"success": True, "data": data})
    except CampaignServiceError as exc:
        return _service_error_response(exc)


@router.patch("/{campaign_id}")
async def update_campaign_route(
    campaign_id: str,
    body: UpdateCampaignRequest,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Update a DRAFT campaign."""
    try:
        data = await update_campaign(
            session,
            campaign_id,
            name=body.name,
            rate_limit=body.rate_limit,
            variables=body.variables,
        )
        return JSONResponse(content={"success": True, "data": data})
    except CampaignServiceError as exc:
        return _service_error_response(exc)


@router.delete("/{campaign_id}")
async def delete_campaign_route(
    campaign_id: str,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Delete a DRAFT or CANCELLED campaign."""
    try:
        await delete_campaign(session, campaign_id)
        return JSONResponse(content={"success": True, "message": "Campanha excluída"})
    except CampaignServiceError as exc:
        return _service_error_response(exc)


@router.post("/{campaign_id}")
async def campaign_action_route(
    campaign_id: str,
    body: CampaignActionRequest,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Execute campaign actions: start, pause, resume, cancel."""
    try:
        if body.action == "start":
            result = await start_campaign(session, campaign_id)
            return JSONResponse(
                content={
                    "success": True,
                    "data": result,
                    "message": f"Campanha iniciada com {result['totalContacts']} contatos em {result['batchesCreated']} lotes",
                },
            )
        elif body.action == "pause":
            ok = await pause_campaign(session, campaign_id)
            if not ok:
                return JSONResponse(status_code=400, content={"success": False, "error": "Não foi possível pausar a campanha"})
            return JSONResponse(content={"success": True, "message": "Campanha pausada"})
        elif body.action == "resume":
            ok = await resume_campaign(session, campaign_id)
            if not ok:
                return JSONResponse(status_code=400, content={"success": False, "error": "Não foi possível retomar a campanha"})
            return JSONResponse(content={"success": True, "message": "Campanha retomada"})
        elif body.action == "cancel":
            ok = await cancel_campaign(session, campaign_id)
            if not ok:
                return JSONResponse(status_code=400, content={"success": False, "error": "Não foi possível cancelar a campanha"})
            return JSONResponse(content={"success": True, "message": "Campanha cancelada"})
        else:
            return JSONResponse(status_code=400, content={"success": False, "error": "Ação inválida"})
    except CampaignServiceError as exc:
        return _service_error_response(exc)


# ---------------------------------------------------------------------------
# Routes: /campaigns/{campaign_id}/contacts
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/contacts")
async def list_contacts_route(
    campaign_id: str,
    status: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """List contacts of a campaign with pagination."""
    result = await list_campaign_contacts(
        session, campaign_id, status_filter=status, page=page, limit=limit,
    )
    return JSONResponse(content={"success": True, **result})


@router.post("/{campaign_id}/contacts")
async def add_contacts_route(
    campaign_id: str,
    body: AddContactsRequest,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Add contacts to a DRAFT campaign."""
    try:
        contacts_data = None
        if body.contacts:
            contacts_data = [
                {
                    "contactId": c.contact_id,
                    "contactPhone": c.contact_phone,
                    "contactName": c.contact_name,
                    "variables": c.variables or {},
                }
                for c in body.contacts
            ]

        result = await add_contacts_to_campaign(
            session,
            campaign_id,
            contacts=contacts_data,
            select_all=body.select_all,
        )
        added = result["added"]
        msg = f"{added} contato(s) adicionado(s)" if added > 0 else "Todos os contatos já estão na campanha"
        return JSONResponse(content={"success": True, "data": result, "message": msg})
    except CampaignServiceError as exc:
        return _service_error_response(exc)


@router.delete("/{campaign_id}/contacts")
async def remove_contacts_route(
    campaign_id: str,
    body: RemoveContactsRequest,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Remove contacts from a DRAFT campaign."""
    try:
        result = await remove_contacts_from_campaign(session, campaign_id, body.contact_ids)
        return JSONResponse(
            content={"success": True, "data": result, "message": f"{result['removed']} contato(s) removido(s)"},
        )
    except CampaignServiceError as exc:
        return _service_error_response(exc)


# ---------------------------------------------------------------------------
# Routes: /campaigns/{campaign_id}/progress
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/progress")
async def campaign_progress_route(
    campaign_id: str,
    ctx: AdminProxyContext = Depends(get_admin_proxy_context),
    session: AsyncSession = Depends(get_socialwise_session),
) -> JSONResponse:
    """Get real-time campaign progress."""
    progress = await get_campaign_progress(session, campaign_id)
    if not progress:
        return JSONResponse(status_code=404, content={"success": False, "error": "Campanha não encontrada"})

    return JSONResponse(
        content={"success": True, "data": progress},
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )
