"""TaskIQ workers for Socialwise budget monitoring."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from domains.socialwise.db.models.cost_budget import CostBudget
from domains.socialwise.db.models.cost_event import CostEvent, EventStatus
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.cost.audit import CostAuditLogger
from domains.socialwise.services.cost.budget_controls import (
    apply_budget_controls,
    remove_budget_controls,
    send_budget_alert,
)
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


def _period_start(period: str, now: datetime) -> datetime:
    if period == "monthly":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        start = now - timedelta(days=now.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def _calculate_current_spending(session, budget: CostBudget) -> Decimal:
    start_date = _period_start(budget.period, datetime.now(timezone.utc))
    filters = [
        CostEvent.ts >= start_date,
        CostEvent.status == EventStatus.PRICED.value,
        CostEvent.cost.is_not(None),
    ]
    if budget.inbox_id:
        filters.append(CostEvent.inbox_id == budget.inbox_id)
    if budget.user_id:
        filters.append(CostEvent.user_id == budget.user_id)

    stmt = select(func.coalesce(func.sum(CostEvent.cost), 0)).where(*filters)
    result = await session.execute(stmt)
    total = result.scalar_one()
    return Decimal(str(total or 0))


async def _check_budget_status(session, budget: CostBudget) -> dict[str, object]:
    audit_logger = CostAuditLogger(session)
    current_spending = await _calculate_current_spending(session, budget)
    percentage = current_spending / Decimal(str(budget.limit_usd)) if budget.limit_usd else Decimal("0")

    status = "OK"
    alert_sent = False
    controls_applied = False

    if percentage >= Decimal("1.0"):
        status = "EXCEEDED"
    elif percentage >= Decimal(str(budget.alert_at)):
        status = "WARNING"

    if status == "EXCEEDED":
        await apply_budget_controls(budget, percentage)
        controls_applied = True
        alert_sent = await send_budget_alert(budget, current_spending, percentage, "EXCEEDED")
        await audit_logger.log_budget_exceeded(
            budget_id=budget.id,
            name=budget.name,
            limit_usd=float(budget.limit_usd),
            current_spent=float(current_spending),
            percentage=float(percentage),
            inbox_id=budget.inbox_id,
            user_id=budget.user_id,
        )
    elif status == "WARNING":
        alert_sent = await send_budget_alert(budget, current_spending, percentage, "WARNING")
        await remove_budget_controls(budget)
    else:
        await remove_budget_controls(budget)

    return {
        "budgetId": budget.id,
        "status": status,
        "currentSpending": float(current_spending),
        "percentage": float(percentage),
        "alertSent": alert_sent,
        "controlsApplied": controls_applied,
    }


@broker.task(
    retry_on_error=True,
    max_retries=3,
    schedule=[{"cron": "0 * * * *", "schedule_id": "socialwise:budget-monitor:hourly"}],
)
async def check_all_budgets_task() -> dict[str, object]:
    results = {
        "checked": 0,
        "alerts": 0,
        "blocked": 0,
        "errors": [],
    }

    async with session_ctx() as session:
        budgets = list(
            (
                await session.execute(
                    select(CostBudget)
                    .where(CostBudget.is_active.is_(True))
                    .order_by(CostBudget.created_at.desc())
                )
            )
            .scalars()
            .all()
        )

        for budget in budgets:
            try:
                result = await _check_budget_status(session, budget)
                results["checked"] += 1
                if result["alertSent"]:
                    results["alerts"] += 1
                if result["controlsApplied"]:
                    results["blocked"] += 1
            except Exception as exc:
                error_message = f"Erro ao verificar orçamento {budget.id}: {exc}"
                logger.error("socialwise_budget_check_failed", budget_id=budget.id, error=str(exc))
                results["errors"].append(error_message)

    return results


@broker.task(retry_on_error=True, max_retries=3)
async def check_specific_budget_task(budget_id: str) -> dict[str, object]:
    async with session_ctx() as session:
        stmt = select(CostBudget).where(CostBudget.id == budget_id, CostBudget.is_active.is_(True)).limit(1)
        budget = (await session.execute(stmt)).scalar_one_or_none()
        if budget is None:
            raise ValueError(f"Budget {budget_id} not found or inactive")
        return await _check_budget_status(session, budget)
