"""FastAPI admin routes for the Cost Monitoring group (B.7.7).

Port of:
- app/api/admin/cost-monitoring/overview/route.ts
- app/api/admin/cost-monitoring/metrics/route.ts
- app/api/admin/cost-monitoring/breakdown/route.ts
- app/api/admin/cost-monitoring/events/route.ts
- app/api/admin/cost-monitoring/alerts/route.ts
- app/api/admin/cost-monitoring/audit/route.ts
- app/api/admin/cost-monitoring/budgets/route.ts
- app/api/admin/cost-monitoring/budgets/[id]/route.ts
- app/api/admin/cost-monitoring/fx-rates/route.ts
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.cost.admin_cost_service import (
    CostServiceError,
    create_budget,
    delete_budget,
    get_audit_logs,
    get_budget,
    get_cost_alerts,
    get_fx_rates,
    get_metrics,
    get_overview,
    get_breakdown,
    list_budgets,
    list_events,
    update_budget,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/cost-monitoring",
    tags=["socialwise-admin-cost"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateBudgetRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    inboxId: str | None = None
    userId: str | None = None
    period: str  # daily | weekly | monthly
    limitUSD: float
    alertAt: float = 0.8
    isActive: bool = True


class UpdateBudgetRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    period: str | None = None
    limitUSD: float | None = None
    alertAt: float | None = None
    isActive: bool | None = None


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

@router.get("/overview")
async def api_cost_overview(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    return await get_overview(session)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@router.get("/metrics")
async def api_cost_metrics(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    timeWindow: int = Query(default=60, ge=1, le=1440),
) -> Any:
    return await get_metrics(session, time_window_minutes=timeWindow)


# ---------------------------------------------------------------------------
# Breakdown
# ---------------------------------------------------------------------------

@router.get("/breakdown")
async def api_cost_breakdown(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    product: str | None = Query(default=None),
    inboxId: str | None = Query(default=None),
    userId: str | None = Query(default=None),
    intent: str | None = Query(default=None),
    groupBy: str = Query(default="provider"),
    period: str = Query(default="day"),
) -> Any:
    return await get_breakdown(
        session,
        start_date=startDate, end_date=endDate,
        provider=provider, product=product,
        inbox_id=inboxId, user_id=userId, intent=intent,
        group_by=groupBy, period=period,
    )


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

@router.get("/events")
async def api_cost_events(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    product: str | None = Query(default=None),
    status: str | None = Query(default=None),
    inboxId: str | None = Query(default=None),
    userId: str | None = Query(default=None),
    intent: str | None = Query(default=None),
    sessionId: str | None = Query(default=None),
    traceId: str | None = Query(default=None),
    externalId: str | None = Query(default=None),
    sortBy: str = Query(default="ts"),
    sortOrder: str = Query(default="desc"),
) -> Any:
    return await list_events(
        session,
        page=page, limit=limit,
        start_date=startDate, end_date=endDate,
        provider=provider, product=product,
        status=status, inbox_id=inboxId, user_id=userId,
        intent=intent, session_id=sessionId,
        trace_id=traceId, external_id=externalId,
        sort_by=sortBy, sort_order=sortOrder,
    )


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@router.get("/alerts")
async def api_cost_alerts(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    severity: str | None = Query(default=None),
    type: str | None = Query(default=None, alias="type"),
) -> Any:
    return await get_cost_alerts(session, severity=severity, alert_type=type)


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

@router.get("/audit")
async def api_cost_audit(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    eventType: str | None = Query(default=None),
    userId: str | None = Query(default=None),
    resourceType: str | None = Query(default=None),
    resourceId: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> Any:
    try:
        return await get_audit_logs(
            session,
            event_type=eventType, user_id=userId,
            resource_type=resourceType, resource_id=resourceId,
            severity=severity, start_date=startDate, end_date=endDate,
            limit=limit, offset=offset,
        )
    except CostServiceError as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

@router.get("/budgets")
async def api_list_budgets(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    inboxId: str | None = Query(default=None),
    userId: str | None = Query(default=None),
    isActive: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> Any:
    return await list_budgets(session, inbox_id=inboxId, user_id=userId, is_active=isActive, page=page, limit=limit)


@router.post("/budgets", status_code=201)
async def api_create_budget(
    request: CreateBudgetRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    try:
        return await create_budget(session, request.model_dump())
    except CostServiceError as e:
        code = 409 if "Já existe" in str(e) else 400
        return JSONResponse({"error": str(e)}, status_code=code)


@router.get("/budgets/{budget_id}")
async def api_get_budget(
    budget_id: str,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    result = await get_budget(session, budget_id)
    if result is None:
        return JSONResponse({"error": "Orçamento não encontrado"}, status_code=404)
    return result


@router.put("/budgets/{budget_id}")
async def api_update_budget(
    budget_id: str,
    request: UpdateBudgetRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    try:
        return await update_budget(session, budget_id, request.model_dump(exclude_none=True))
    except CostServiceError as e:
        code = 409 if "Já existe" in str(e) else 404
        return JSONResponse({"error": str(e)}, status_code=code)


@router.delete("/budgets/{budget_id}")
async def api_delete_budget(
    budget_id: str,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
) -> Any:
    try:
        await delete_budget(session, budget_id)
        return {"message": "Orçamento removido com sucesso"}
    except CostServiceError as e:
        return JSONResponse({"error": str(e)}, status_code=404)


# ---------------------------------------------------------------------------
# FX Rates
# ---------------------------------------------------------------------------

@router.get("/fx-rates")
async def api_fx_rates(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    action: str = Query(default="current"),
    base: str = Query(default="USD"),
    quote: str = Query(default="BRL"),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    amount: float | None = Query(default=None),
) -> Any:
    try:
        return await get_fx_rates(
            session, action=action, base=base, quote=quote,
            start_date=startDate, end_date=endDate, amount=amount,
        )
    except CostServiceError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
