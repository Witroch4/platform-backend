"""Business logic for the Cost Monitoring admin group (B.7.7).

Port of:
- app/api/admin/cost-monitoring/overview/route.ts
- app/api/admin/cost-monitoring/metrics/route.ts (simplified — in-memory monitor not ported)
- app/api/admin/cost-monitoring/breakdown/route.ts
- app/api/admin/cost-monitoring/events/route.ts
- app/api/admin/cost-monitoring/alerts/route.ts
- app/api/admin/cost-monitoring/audit/route.ts
- app/api/admin/cost-monitoring/budgets/route.ts
- app/api/admin/cost-monitoring/budgets/[id]/route.ts
- app/api/admin/cost-monitoring/fx-rates/route.ts

NOTE: /metrics and /alerts routes used an in-memory CostMonitor singleton tracking BullMQ
worker state. The Python port serves DB-derived equivalents.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import asc, cast, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.audit_log import AuditLog
from domains.socialwise.db.models.cost_budget import CostBudget
from domains.socialwise.db.models.cost_event import CostEvent, EventStatus
from domains.socialwise.db.models.fx_rate import FxRate
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


class CostServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# FX rate helper
# ---------------------------------------------------------------------------

async def _get_latest_rate(session: AsyncSession, base: str = "USD", quote: str = "BRL") -> float:
    """Return the most recent stored FX rate, or 1.0 if none found."""
    result = await session.execute(
        select(FxRate.rate)
        .where(FxRate.base == base, FxRate.quote == quote)
        .order_by(FxRate.date.desc())
        .limit(1)
    )
    rate = result.scalar_one_or_none()
    return float(rate) if rate else 1.0


def _period_start(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        dow = now.weekday()  # 0=Mon
        return (now - timedelta(days=dow)).replace(hour=0, minute=0, second=0, microsecond=0)
    # monthly
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

async def get_overview(session: AsyncSession) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    async def agg(start: datetime, end: datetime | None = None) -> tuple[float, int]:
        stmt = select(func.sum(CostEvent.cost), func.count(CostEvent.id)).where(
            CostEvent.ts >= start, CostEvent.status == EventStatus.PRICED.value
        )
        if end:
            stmt = stmt.where(CostEvent.ts < end)
        row = (await session.execute(stmt)).one()
        return float(row[0] or 0), row[1] or 0

    today_usd, today_count = await agg(today)
    yesterday_usd, _ = await agg(yesterday, today)
    month_usd, month_count = await agg(month_start)
    last_month_usd, _ = await agg(last_month_start, month_start)

    rate = await _get_latest_rate(session)

    def pct_change(current: float, previous: float) -> float:
        if previous > 0:
            return round((current - previous) / previous * 100, 2)
        return 100.0 if current > 0 else 0.0

    # Top 5 inboxes today
    inbox_result = await session.execute(
        select(CostEvent.inbox_id, func.sum(CostEvent.cost).label("total"))
        .where(CostEvent.ts >= today, CostEvent.status == EventStatus.PRICED.value, CostEvent.inbox_id.isnot(None))
        .group_by(CostEvent.inbox_id)
        .order_by(desc("total"))
        .limit(5)
    )
    top_inboxes = [
        {"inboxId": r[0], "usd": float(r[1] or 0), "brl": round(float(r[1] or 0) * rate, 2)}
        for r in inbox_result
    ]

    # Provider breakdown today
    prov_result = await session.execute(
        select(CostEvent.provider, func.sum(CostEvent.cost).label("total"))
        .where(CostEvent.ts >= today, CostEvent.status == EventStatus.PRICED.value)
        .group_by(CostEvent.provider)
        .order_by(desc("total"))
    )
    provider_breakdown = [
        {"provider": r[0], "usd": float(r[1] or 0), "brl": round(float(r[1] or 0) * rate, 2)}
        for r in prov_result
    ]

    # Recent events (last 10)
    recent_result = await session.execute(
        select(CostEvent)
        .where(CostEvent.status == EventStatus.PRICED.value)
        .order_by(CostEvent.ts.desc())
        .limit(10)
    )
    recent_events = [
        {
            "timestamp": e.ts.isoformat() if e.ts else None,
            "provider": e.provider,
            "product": e.product,
            "usd": float(e.cost or 0),
            "brl": round(float(e.cost or 0) * rate, 2),
            "inboxId": e.inbox_id,
            "intent": e.intent,
            "units": float(e.units),
            "unit": e.unit,
        }
        for e in recent_result.scalars()
    ]

    total_events = (await session.execute(select(func.count(CostEvent.id)).where(CostEvent.status == EventStatus.PRICED.value))).scalar_one()
    pending_events = (await session.execute(select(func.count(CostEvent.id)).where(CostEvent.status == EventStatus.PENDING_PRICING.value))).scalar_one()

    return {
        "summary": {
            "today": {
                "usd": round(today_usd, 6),
                "brl": round(today_usd * rate, 2),
                "events": today_count,
                "change": pct_change(today_usd, yesterday_usd),
                "exchangeRate": rate,
            },
            "month": {
                "usd": round(month_usd, 6),
                "brl": round(month_usd * rate, 2),
                "events": month_count,
                "change": pct_change(month_usd, last_month_usd),
                "exchangeRate": rate,
            },
        },
        "breakdown": {
            "byProvider": provider_breakdown,
            "topInboxes": top_inboxes,
        },
        "recentEvents": recent_events,
        "systemHealth": {
            "totalProcessedEvents": total_events,
            "pendingEvents": pending_events,
            "processingRate": round((total_events / max(total_events + pending_events, 1)) * 100, 2),
        },
        "lastUpdated": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Metrics (DB-derived; in-memory CostMonitor not ported)
# ---------------------------------------------------------------------------

async def get_metrics(session: AsyncSession, time_window_minutes: int = 60) -> dict[str, Any]:
    """Returns DB-derived cost metrics. In-memory window metrics are not ported."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=time_window_minutes)

    result = await session.execute(
        select(
            func.count(CostEvent.id),
            func.sum(CostEvent.cost),
            func.count(CostEvent.id).filter(CostEvent.status == EventStatus.ERROR.value),
        ).where(CostEvent.ts >= cutoff)
    )
    row = result.one()
    total_cnt = row[0] or 0
    total_cost = float(row[1] or 0)
    error_cnt = row[2] or 0

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "window_minutes": time_window_minutes,
        "summary": {
            "totalEvents": total_cnt,
            "totalCostUSD": round(total_cost, 6),
            "errorCount": error_cnt,
            "errorRate": round(error_cnt / max(total_cnt, 1) * 100, 2),
        },
        "note": "in-memory worker metrics not available in Python backend; showing DB aggregates only",
    }


# ---------------------------------------------------------------------------
# Breakdown
# ---------------------------------------------------------------------------

async def get_breakdown(
    session: AsyncSession,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
    provider: str | None = None,
    product: str | None = None,
    inbox_id: str | None = None,
    user_id: str | None = None,
    intent: str | None = None,
    group_by: str = "provider",
    period: str = "day",
) -> dict[str, Any]:
    conditions = [CostEvent.status == EventStatus.PRICED.value]
    if start_date:
        conditions.append(CostEvent.ts >= datetime.fromisoformat(start_date))
    if end_date:
        conditions.append(CostEvent.ts <= datetime.fromisoformat(end_date))
    if provider:
        conditions.append(CostEvent.provider == provider)
    if product:
        conditions.append(CostEvent.product == product)
    if inbox_id:
        conditions.append(CostEvent.inbox_id == inbox_id)
    if user_id:
        conditions.append(CostEvent.user_id == user_id)
    if intent:
        conditions.append(func.lower(CostEvent.intent).contains(intent.lower()))

    group_fields_map = {
        "provider": [CostEvent.provider],
        "product": [CostEvent.provider, CostEvent.product],
        "model": [CostEvent.provider, CostEvent.product],
        "inbox": [CostEvent.inbox_id],
        "user": [CostEvent.user_id],
        "intent": [CostEvent.intent],
    }

    if group_by == "period":
        # Group by truncated date using raw SQL
        trunc_map = {"hour": "hour", "day": "day", "week": "week", "month": "month"}
        trunc = trunc_map.get(period, "day")
        stmt = text(
            f"""
            SELECT date_trunc('{trunc}', ts) AS period,
                   SUM(cost) AS total_cost,
                   COUNT(*) AS event_count
            FROM "CostEvent"
            WHERE status = 'PRICED'
            GROUP BY 1 ORDER BY 1
            """
        )
        rows = (await session.execute(stmt)).fetchall()
        data = [{"period": str(r[0]), "usd": float(r[1] or 0), "eventCount": r[2]} for r in rows]
    else:
        group_cols = group_fields_map.get(group_by, [CostEvent.provider])
        stmt = (
            select(*group_cols, func.sum(CostEvent.cost).label("total"), func.count(CostEvent.id).label("cnt"))
            .where(*conditions)
            .group_by(*group_cols)
            .order_by(desc("total"))
        )
        rows = (await session.execute(stmt)).fetchall()
        data = []
        for row in rows:
            item: dict[str, Any] = {}
            if group_by in ("provider",):
                item["provider"] = row[0]
            elif group_by in ("product", "model"):
                item["provider"] = row[0]
                item["product"] = row[1]
            elif group_by == "inbox":
                item["inboxId"] = row[0]
            elif group_by == "user":
                item["userId"] = row[0]
            elif group_by == "intent":
                item["intent"] = row[0]
            item["usd"] = float(row[-2] or 0)
            item["eventCount"] = row[-1]
            data.append(item)

    return {"groupBy": group_by, "data": data}


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

async def list_events(
    session: AsyncSession,
    *,
    page: int = 1,
    limit: int = 50,
    start_date: str | None = None,
    end_date: str | None = None,
    provider: str | None = None,
    product: str | None = None,
    status: str | None = None,
    inbox_id: str | None = None,
    user_id: str | None = None,
    intent: str | None = None,
    session_id: str | None = None,
    trace_id: str | None = None,
    external_id: str | None = None,
    sort_by: str = "ts",
    sort_order: str = "desc",
) -> dict[str, Any]:
    limit = min(limit, 100)
    skip = (page - 1) * limit

    conditions: list = []
    if start_date:
        conditions.append(CostEvent.ts >= datetime.fromisoformat(start_date))
    if end_date:
        conditions.append(CostEvent.ts <= datetime.fromisoformat(end_date))
    if provider:
        conditions.append(CostEvent.provider == provider)
    if product:
        conditions.append(CostEvent.product == product)
    if status:
        conditions.append(CostEvent.status == status)
    if inbox_id:
        conditions.append(CostEvent.inbox_id == inbox_id)
    if user_id:
        conditions.append(CostEvent.user_id == user_id)
    if intent:
        conditions.append(func.lower(CostEvent.intent).contains(intent.lower()))
    if session_id:
        conditions.append(CostEvent.session_id == session_id)
    if trace_id:
        conditions.append(CostEvent.trace_id == trace_id)
    if external_id:
        conditions.append(CostEvent.external_id == external_id)

    # Sort
    col_map = {
        "ts": CostEvent.ts, "cost": CostEvent.cost, "provider": CostEvent.provider,
        "product": CostEvent.product, "units": CostEvent.units,
    }
    sort_col = col_map.get(sort_by, CostEvent.ts)
    order_fn = desc if sort_order == "desc" else asc

    total_result = await session.execute(
        select(func.count(CostEvent.id)).where(*conditions) if conditions else
        select(func.count(CostEvent.id))
    )
    total = total_result.scalar_one()

    stmt = select(CostEvent).order_by(order_fn(sort_col)).offset(skip).limit(limit)
    if conditions:
        stmt = stmt.where(*conditions)

    events = list((await session.execute(stmt)).scalars())

    return {
        "events": [
            {
                "id": e.id,
                "timestamp": e.ts.isoformat() if e.ts else None,
                "provider": e.provider,
                "product": e.product,
                "unit": e.unit,
                "units": float(e.units),
                "currency": e.currency,
                "unitPrice": float(e.unit_price) if e.unit_price else None,
                "cost": float(e.cost) if e.cost is not None else None,
                "status": e.status,
                "sessionId": e.session_id,
                "inboxId": e.inbox_id,
                "userId": e.user_id,
                "intent": e.intent,
                "traceId": e.trace_id,
                "externalId": e.external_id,
            }
            for e in events
        ],
        "pagination": {
            "page": page, "limit": limit, "total": total,
            "totalPages": max(1, -(-total // limit)),
        },
    }


# ---------------------------------------------------------------------------
# Alerts (DB-derived)
# ---------------------------------------------------------------------------

async def get_cost_alerts(
    session: AsyncSession,
    severity: str | None = None,
    alert_type: str | None = None,
) -> dict[str, Any]:
    """Generate cost alerts from DB state (budget violations + error spikes)."""
    alerts = []

    # Check budgets for violations
    budgets = list((await session.execute(select(CostBudget).where(CostBudget.is_active.is_(True)))).scalars())
    for budget in budgets:
        start = _period_start(budget.period)
        stmt = select(func.sum(CostEvent.cost)).where(
            CostEvent.ts >= start,
            CostEvent.status == EventStatus.PRICED.value,
        )
        if budget.inbox_id:
            stmt = stmt.where(CostEvent.inbox_id == budget.inbox_id)
        if budget.user_id:
            stmt = stmt.where(CostEvent.user_id == budget.user_id)

        spent = float((await session.execute(stmt)).scalar_one() or 0)
        limit_val = float(budget.limit_usd)
        pct = spent / limit_val if limit_val > 0 else 0

        if pct >= 1.0:
            al_severity = "CRITICAL"
            al_type = "BUDGET_EXCEEDED"
        elif pct >= float(budget.alert_at):
            al_severity = "HIGH"
            al_type = "BUDGET_WARNING"
        else:
            continue

        alerts.append({
            "id": f"budget-{budget.id}",
            "type": al_type,
            "severity": al_severity,
            "message": f"Budget '{budget.name}': {pct * 100:.1f}% used (${spent:.4f} / ${limit_val:.2f})",
            "budgetId": budget.id,
            "resolved": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # Check recent error rate (last 15 min)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    total_recent = (await session.execute(select(func.count(CostEvent.id)).where(CostEvent.ts >= cutoff))).scalar_one()
    error_recent = (await session.execute(select(func.count(CostEvent.id)).where(CostEvent.ts >= cutoff, CostEvent.status == EventStatus.ERROR.value))).scalar_one()

    if total_recent > 0 and (error_recent / total_recent) > 0.2:
        err_pct = error_recent / total_recent
        alerts.append({
            "id": "error-rate-spike",
            "type": "HIGH_ERROR_RATE",
            "severity": "HIGH" if err_pct > 0.5 else "MEDIUM",
            "message": f"Error rate {err_pct * 100:.1f}% in the last 15 minutes ({error_recent}/{total_recent} events)",
            "resolved": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # Apply filters
    if severity:
        alerts = [a for a in alerts if a["severity"] == severity]
    if alert_type:
        alerts = [a for a in alerts if a["type"] == alert_type]

    alerts.sort(key=lambda a: a["timestamp"], reverse=True)

    by_severity = {
        "critical": sum(1 for a in alerts if a["severity"] == "CRITICAL"),
        "high": sum(1 for a in alerts if a["severity"] == "HIGH"),
        "medium": sum(1 for a in alerts if a["severity"] == "MEDIUM"),
        "low": sum(1 for a in alerts if a["severity"] == "LOW"),
    }
    by_type: dict[str, int] = {}
    for a in alerts:
        by_type[a["type"]] = by_type.get(a["type"], 0) + 1

    return {
        "alerts": alerts,
        "summary": {
            "total": len(alerts),
            "active": len([a for a in alerts if not a["resolved"]]),
            "resolved": len([a for a in alerts if a["resolved"]]),
            "bySeverity": by_severity,
            "byType": by_type,
        },
    }


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

async def get_audit_logs(
    session: AsyncSession,
    *,
    event_type: str | None = None,
    user_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    severity: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    if limit > 1000:
        raise CostServiceError("Limite máximo de 1000 registros por consulta.")

    conditions = []
    if event_type:
        conditions.append(AuditLog.action == event_type)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if resource_id:
        conditions.append(AuditLog.resource_id == resource_id)
    if start_date:
        conditions.append(AuditLog.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        conditions.append(AuditLog.created_at <= datetime.fromisoformat(end_date))

    total = (await session.execute(
        select(func.count(AuditLog.id)).where(*conditions) if conditions else select(func.count(AuditLog.id))
    )).scalar_one()

    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    if conditions:
        stmt = stmt.where(*conditions)

    logs = list((await session.execute(stmt)).scalars())

    return {
        "logs": [
            {
                "id": l.id,
                "action": l.action,
                "resourceType": l.resource_type,
                "resourceId": l.resource_id,
                "userId": l.user_id,
                "details": l.details,
                "createdAt": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
        "pagination": {"total": total, "offset": offset, "limit": limit},
    }


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

async def _budget_with_spending(session: AsyncSession, budget: CostBudget) -> dict[str, Any]:
    start = _period_start(budget.period)
    stmt = select(func.sum(CostEvent.cost)).where(
        CostEvent.ts >= start,
        CostEvent.status == EventStatus.PRICED.value,
        CostEvent.cost.isnot(None),
    )
    if budget.inbox_id:
        stmt = stmt.where(CostEvent.inbox_id == budget.inbox_id)
    if budget.user_id:
        stmt = stmt.where(CostEvent.user_id == budget.user_id)

    spent = float((await session.execute(stmt)).scalar_one() or 0)
    limit_val = float(budget.limit_usd)
    pct = spent / limit_val if limit_val > 0 else 0

    return {
        "id": budget.id,
        "name": budget.name,
        "inboxId": budget.inbox_id,
        "userId": budget.user_id,
        "period": budget.period,
        "limitUSD": limit_val,
        "alertAt": float(budget.alert_at),
        "isActive": budget.is_active,
        "createdAt": budget.created_at.isoformat() if budget.created_at else None,
        "updatedAt": budget.updated_at.isoformat() if budget.updated_at else None,
        "currentSpending": round(spent, 6),
        "spendingPercentage": round(pct, 4),
        "status": "EXCEEDED" if pct >= 1.0 else "WARNING" if pct >= float(budget.alert_at) else "OK",
    }


async def list_budgets(
    session: AsyncSession,
    inbox_id: str | None = None,
    user_id: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    skip = (page - 1) * limit
    conditions = []
    if inbox_id:
        conditions.append(CostBudget.inbox_id == inbox_id)
    if user_id:
        conditions.append(CostBudget.user_id == user_id)
    if is_active is not None:
        conditions.append(CostBudget.is_active.is_(is_active))

    total = (await session.execute(
        select(func.count(CostBudget.id)).where(*conditions) if conditions else select(func.count(CostBudget.id))
    )).scalar_one()

    stmt = select(CostBudget).order_by(CostBudget.created_at.desc()).offset(skip).limit(limit)
    if conditions:
        stmt = stmt.where(*conditions)

    budgets = list((await session.execute(stmt)).scalars())
    budgets_with_spending = [await _budget_with_spending(session, b) for b in budgets]

    return {
        "budgets": budgets_with_spending,
        "pagination": {"page": page, "limit": limit, "total": total, "totalPages": max(1, -(-total // limit))},
    }


async def create_budget(session: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    if not data.get("inboxId") and not data.get("userId"):
        raise CostServiceError("Orçamento deve ser associado a um inbox ou usuário")

    # Check for existing active budget with same scope + period
    existing = await session.execute(
        select(CostBudget).where(
            CostBudget.inbox_id == data.get("inboxId"),
            CostBudget.user_id == data.get("userId"),
            CostBudget.period == data["period"],
            CostBudget.is_active.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        raise CostServiceError("Já existe um orçamento ativo para este escopo e período")

    budget = CostBudget(
        name=data["name"],
        inbox_id=data.get("inboxId"),
        user_id=data.get("userId"),
        period=data["period"],
        limit_usd=Decimal(str(data["limitUSD"])),
        alert_at=Decimal(str(data.get("alertAt", 0.8))),
        is_active=data.get("isActive", True),
    )
    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return await _budget_with_spending(session, budget)


async def get_budget(session: AsyncSession, budget_id: str) -> dict[str, Any] | None:
    budget = await session.get(CostBudget, budget_id)
    if not budget:
        return None
    return await _budget_with_spending(session, budget)


async def update_budget(session: AsyncSession, budget_id: str, data: dict[str, Any]) -> dict[str, Any]:
    budget = await session.get(CostBudget, budget_id)
    if not budget:
        raise CostServiceError("Orçamento não encontrado")

    # Period conflict check
    new_period = data.get("period")
    if new_period and new_period != budget.period:
        conflict = (await session.execute(
            select(CostBudget).where(
                CostBudget.id != budget_id,
                CostBudget.inbox_id == budget.inbox_id,
                CostBudget.user_id == budget.user_id,
                CostBudget.period == new_period,
                CostBudget.is_active.is_(True),
            )
        )).scalar_one_or_none()
        if conflict:
            raise CostServiceError("Já existe um orçamento ativo para este escopo e período")

    if "name" in data:
        budget.name = data["name"]
    if "period" in data:
        budget.period = data["period"]
    if "limitUSD" in data:
        budget.limit_usd = Decimal(str(data["limitUSD"]))
    if "alertAt" in data:
        budget.alert_at = Decimal(str(data["alertAt"]))
    if "isActive" in data:
        budget.is_active = data["isActive"]

    await session.commit()
    await session.refresh(budget)
    return await _budget_with_spending(session, budget)


async def delete_budget(session: AsyncSession, budget_id: str) -> None:
    budget = await session.get(CostBudget, budget_id)
    if not budget:
        raise CostServiceError("Orçamento não encontrado")
    await session.delete(budget)
    await session.commit()


# ---------------------------------------------------------------------------
# FX Rates
# ---------------------------------------------------------------------------

async def get_fx_rates(
    session: AsyncSession,
    action: str = "current",
    base: str = "USD",
    quote: str = "BRL",
    start_date: str | None = None,
    end_date: str | None = None,
    amount: float | None = None,
) -> dict[str, Any]:
    if action == "current":
        result = await session.execute(
            select(FxRate).where(FxRate.base == base, FxRate.quote == quote).order_by(FxRate.date.desc()).limit(1)
        )
        rate = result.scalar_one_or_none()
        if not rate:
            return {"rate": None, "message": "Nenhuma taxa disponível para esta combinação de moedas"}
        return {
            "date": rate.date.isoformat() if rate.date else None,
            "base": rate.base,
            "quote": rate.quote,
            "rate": float(rate.rate),
        }

    if action == "history":
        conditions = [FxRate.base == base, FxRate.quote == quote]
        if start_date:
            conditions.append(FxRate.date >= datetime.fromisoformat(start_date))
        if end_date:
            conditions.append(FxRate.date <= datetime.fromisoformat(end_date))
        rows = list((await session.execute(
            select(FxRate).where(*conditions).order_by(FxRate.date.desc()).limit(90)
        )).scalars())
        return {
            "history": [{"date": r.date.isoformat(), "rate": float(r.rate)} for r in rows],
            "base": base, "quote": quote,
        }

    if action == "convert":
        if amount is None:
            raise CostServiceError("amount é obrigatório para a ação convert")
        rate_val = await _get_latest_rate(session, base, quote)
        return {
            "from": base, "to": quote,
            "amount": amount,
            "converted": round(amount * rate_val, 4),
            "rate": rate_val,
        }

    raise CostServiceError("Ação não reconhecida. Use: current, history, convert")
