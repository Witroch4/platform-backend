"""FastAPI admin routes for Flow Analytics (B.7.6)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.flow.admin_analytics_service import (
    FlowAnalyticsServiceError,
    build_filters,
    get_alerts,
    get_analytics_index,
    get_funnel,
    get_heatmap,
    get_kpis,
    get_node_details,
    get_session_detail,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/mtf-diamante/flow-analytics",
    tags=["socialwise-admin-flow-analytics"],
)


def _service_error_response(exc: FlowAnalyticsServiceError) -> JSONResponse:
    payload = {"success": False, "error": exc.message}
    if exc.payload:
        payload.update(exc.payload)
    return JSONResponse(payload, status_code=exc.status_code)


@router.get("")
async def analytics_index_route(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
):
    return {
        "success": True,
        "data": await get_analytics_index(),
    }


@router.get("/kpis")
async def analytics_kpis_route(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    inboxId: str | None = Query(default=None),
    flowId: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    dateStart: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    dateEnd: str | None = Query(default=None),
    status: str | None = Query(default=None),
    campaign: str | None = Query(default=None),
    channelType: str | None = Query(default=None),
    userTag: str | None = Query(default=None),
):
    try:
        filters = build_filters(
            inbox_id=inboxId,
            flow_id=flowId,
            start_date=startDate,
            date_start=dateStart,
            end_date=endDate,
            date_end=dateEnd,
            status_values=status,
            campaign=campaign,
            channel_type=channelType,
            user_tag=userTag,
        )
        data = await get_kpis(session, ctx.user_id, filters)
        return {"success": True, "data": data}
    except FlowAnalyticsServiceError as exc:
        return _service_error_response(exc)


@router.get("/heatmap")
async def analytics_heatmap_route(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    flowId: str | None = Query(default=None),
    inboxId: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    dateStart: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    dateEnd: str | None = Query(default=None),
):
    try:
        filters = build_filters(
            inbox_id=inboxId,
            flow_id=flowId,
            start_date=startDate,
            date_start=dateStart,
            end_date=endDate,
            date_end=dateEnd,
        )
        data = await get_heatmap(session, ctx.user_id, filters)
        return {"success": True, "data": data}
    except FlowAnalyticsServiceError as exc:
        return _service_error_response(exc)


@router.get("/funnel")
async def analytics_funnel_route(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    flowId: str | None = Query(default=None),
    inboxId: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    dateStart: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    dateEnd: str | None = Query(default=None),
):
    try:
        filters = build_filters(
            inbox_id=inboxId,
            flow_id=flowId,
            start_date=startDate,
            date_start=dateStart,
            end_date=endDate,
            date_end=dateEnd,
        )
        data = await get_funnel(session, ctx.user_id, filters)
        return {"success": True, "data": data}
    except FlowAnalyticsServiceError as exc:
        return _service_error_response(exc)


@router.get("/node-details")
async def analytics_node_details_route(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    flowId: str | None = Query(default=None),
    nodeId: str | None = Query(default=None),
    inboxId: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    dateStart: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    dateEnd: str | None = Query(default=None),
):
    try:
        filters = build_filters(
            inbox_id=inboxId,
            flow_id=flowId,
            start_date=startDate,
            date_start=dateStart,
            end_date=endDate,
            date_end=dateEnd,
        )
        data = await get_node_details(session, ctx.user_id, filters, nodeId or "")
        return {"success": True, "data": data}
    except FlowAnalyticsServiceError as exc:
        return _service_error_response(exc)


@router.get("/alerts")
async def analytics_alerts_route(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    inboxId: str | None = Query(default=None),
    flowId: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    dateStart: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    dateEnd: str | None = Query(default=None),
):
    try:
        filters = build_filters(
            inbox_id=inboxId,
            flow_id=flowId,
            start_date=startDate,
            date_start=dateStart,
            end_date=endDate,
            date_end=dateEnd,
        )
        data = await get_alerts(session, ctx.user_id, filters)
        return {"success": True, "data": data}
    except FlowAnalyticsServiceError as exc:
        return _service_error_response(exc)


@router.get("/sessions/{session_id}")
async def analytics_session_detail_route(
    session_id: str,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        data = await get_session_detail(session, ctx.user_id, session_id)
        return {"success": True, "data": data}
    except FlowAnalyticsServiceError as exc:
        return _service_error_response(exc)
