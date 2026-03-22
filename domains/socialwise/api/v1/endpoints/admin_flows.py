"""FastAPI admin routes for the Flow Builder `Flows` group."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.flow.admin_service import (
    FlowAdminServiceError,
    create_flow,
    delete_flow,
    export_flow,
    get_flow_detail,
    import_flow,
    list_flows,
    update_flow_canvas,
    update_flow_metadata,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/mtf-diamante/flows",
    tags=["socialwise-admin-flows"],
)


class CreateFlowRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    inbox_id: str = Field(alias="inboxId", min_length=1)
    name: str = Field(min_length=1, max_length=100)
    is_campaign: bool = Field(default=False, alias="isCampaign")


class FlowViewportRequest(BaseModel):
    x: float
    y: float
    zoom: float


class FlowPositionRequest(BaseModel):
    x: float
    y: float


class FlowNodeRequest(BaseModel):
    id: str = Field(min_length=1)
    type: str
    position: FlowPositionRequest
    data: dict[str, Any] = Field(default_factory=dict)
    width: float | None = None
    height: float | None = None
    selected: bool | None = None
    dragging: bool | None = None


class FlowEdgeRequest(BaseModel):
    id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    source_handle: str | None = Field(default=None, alias="sourceHandle")
    target_handle: str | None = Field(default=None, alias="targetHandle")
    data: dict[str, Any] | None = None
    type: str | None = None
    animated: bool | None = None
    selected: bool | None = None


class FlowCanvasRequest(BaseModel):
    nodes: list[FlowNodeRequest]
    edges: list[FlowEdgeRequest]
    viewport: FlowViewportRequest


class UpdateFlowCanvasRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    canvas: FlowCanvasRequest


class UpdateFlowMetadataRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = Field(default=None, alias="isActive")


class ImportFlowRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    inbox_id: str = Field(alias="inboxId", min_length=1)
    flow_data: dict[str, Any] = Field(alias="flowData")
    new_name: str | None = Field(default=None, alias="newName", max_length=100)


async def _parse_request_model(
    request: Request,
    model_type: type[BaseModel],
    invalid_message: str,
) -> tuple[BaseModel | None, JSONResponse | None]:
    try:
        payload = await request.json()
    except Exception:
        return None, JSONResponse(
            {"success": False, "error": invalid_message},
            status_code=400,
        )

    try:
        return model_type.model_validate(payload), None
    except ValidationError as exc:
        return None, JSONResponse(
            {
                "success": False,
                "error": invalid_message,
                "details": exc.errors(),
            },
            status_code=400,
        )


def _service_error_response(exc: FlowAdminServiceError) -> JSONResponse:
    payload = {"success": False, "error": exc.message}
    if exc.payload:
        payload.update(exc.payload)
    return JSONResponse(payload, status_code=exc.status_code)


@router.get("")
async def list_flows_route(
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    inbox_id: str | None = Query(default=None, alias="inboxId"),
    is_campaign: bool = Query(default=False, alias="isCampaign"),
):
    if not inbox_id:
        return JSONResponse(
            {"success": False, "error": "inboxId é obrigatório"},
            status_code=400,
        )

    try:
        data = await list_flows(session, proxy.user_id, inbox_id, is_campaign)
        return {"success": True, "data": data}
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.post("")
async def create_flow_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(request, CreateFlowRequest, "Dados inválidos")
    if error_response is not None:
        return error_response

    payload = parsed.model_dump(by_alias=False)
    try:
        data = await create_flow(
            session,
            proxy.user_id,
            payload["inbox_id"],
            payload["name"],
            payload["is_campaign"],
        )
        return {"success": True, "data": data, "message": "Flow criado com sucesso"}
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.post("/import")
async def import_flow_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(request, ImportFlowRequest, "Dados inválidos")
    if error_response is not None:
        return error_response

    payload = parsed.model_dump(by_alias=False)
    try:
        data = await import_flow(
            session,
            proxy.user_id,
            payload["inbox_id"],
            payload["flow_data"],
            payload["new_name"],
        )
        response_payload = {"success": True, "data": {k: v for k, v in data.items() if k not in {"warnings", "message"}}}
        response_payload["warnings"] = data["warnings"]
        response_payload["message"] = data["message"]
        return response_payload
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.get("/{flow_id}")
async def get_flow_route(
    flow_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        data = await get_flow_detail(session, proxy.user_id, flow_id)
        return {"success": True, "data": data}
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.patch("/{flow_id}")
async def patch_flow_route(
    flow_id: str,
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(
        request,
        UpdateFlowMetadataRequest,
        "Dados inválidos",
    )
    if error_response is not None:
        return error_response

    payload = parsed.model_dump(by_alias=False)
    try:
        data = await update_flow_metadata(
            session,
            proxy.user_id,
            flow_id,
            payload["name"],
            payload["is_active"],
        )
        return {"success": True, "data": data, "message": "Flow atualizado com sucesso"}
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.put("/{flow_id}")
async def put_flow_route(
    flow_id: str,
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(
        request,
        UpdateFlowCanvasRequest,
        "Canvas inválido",
    )
    if error_response is not None:
        return error_response

    canvas = parsed.model_dump(by_alias=True)["canvas"]
    try:
        data = await update_flow_canvas(session, proxy.user_id, flow_id, canvas)
        return {"success": True, "data": data, "message": "Canvas atualizado com sucesso"}
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.delete("/{flow_id}")
async def delete_flow_route(
    flow_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        await delete_flow(session, proxy.user_id, flow_id)
        return {"success": True, "message": "Flow removido com sucesso"}
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)


@router.get("/{flow_id}/export")
async def export_flow_route(
    flow_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        content, filename = await export_flow(session, proxy.user_id, flow_id)
        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except FlowAdminServiceError as exc:
        return _service_error_response(exc)
