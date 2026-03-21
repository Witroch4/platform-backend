"""TaskIQ workers for Socialwise FX rate maintenance."""

import asyncio
from datetime import datetime, timedelta, timezone

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.cost.audit import CostAuditLogger
from domains.socialwise.services.cost.fx_rate import FxRateService
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@broker.task(
    retry_on_error=True,
    max_retries=3,
    schedule=[{"cron": "0 9 * * *", "schedule_id": "socialwise:fx-rate:daily"}],
)
async def update_daily_rate_task() -> dict[str, float | str | None]:
    async with session_ctx() as session:
        service = FxRateService(session)
        audit_logger = CostAuditLogger(session)

        previous = await service.get_latest_stored_rate()
        rate = await service.update_current_rate()
        await audit_logger.log_fx_rate_updated(
            base=FxRateService.BASE,
            quote=FxRateService.QUOTE,
            old_rate=float(previous.rate) if previous is not None else None,
            new_rate=float(rate),
            date=datetime.now(timezone.utc),
        )

        logger.info("socialwise_fx_rate_updated", rate=str(rate))
        return {
            "status": "updated",
            "rate": float(rate),
            "previousRate": float(previous.rate) if previous is not None else None,
        }


@broker.task(
    retry_on_error=True,
    max_retries=2,
    schedule=[{"cron": "0 2 * * 0", "schedule_id": "socialwise:fx-rate:cleanup"}],
)
async def cleanup_old_rates_task(days_to_keep: int = 365) -> dict[str, int]:
    async with session_ctx() as session:
        service = FxRateService(session)
        deleted_count = await service.cleanup_old_rates(days_to_keep=days_to_keep)
        logger.info("socialwise_fx_rate_cleanup_completed", deleted_count=deleted_count)
        return {"deleted": deleted_count, "daysToKeep": days_to_keep}


@broker.task(retry_on_error=True, max_retries=2)
async def backfill_rates_task(start_date: str, end_date: str) -> dict[str, int | float]:
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
    if end < start:
        raise ValueError("end_date must be greater than or equal to start_date")

    async with session_ctx() as session:
        service = FxRateService(session)
        current_rate = await service.fetch_current_rate()

        current = start
        processed_days = 0
        while current <= end:
            await service.store_rate(current_rate, current)
            processed_days += 1
            current = current + timedelta(days=1)
            if processed_days % 10 == 0:
                await asyncio.sleep(0.1)

        logger.info(
            "socialwise_fx_rate_backfill_completed",
            processed_days=processed_days,
            rate=str(current_rate),
        )
        return {"processedDays": processed_days, "rate": float(current_rate)}


@broker.task(retry_on_error=True, max_retries=2)
async def ensure_initial_fx_rate_task() -> dict[str, str | float]:
    async with session_ctx() as session:
        service = FxRateService(session)
        latest = await service.get_latest_stored_rate()
        if latest is None:
            rate = await service.update_current_rate()
            logger.info("socialwise_fx_rate_bootstrap_completed", rate=str(rate))
            return {"status": "initialized", "rate": float(rate)}

        return {"status": "already-present", "rate": float(latest.rate)}
