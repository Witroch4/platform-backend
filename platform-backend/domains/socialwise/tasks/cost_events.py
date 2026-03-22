"""TaskIQ workers for Socialwise cost event processing."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from time import perf_counter
from typing import Any, Mapping

from redis.asyncio import Redis

from domains.socialwise.db.models.cost_event import CostEvent, EventStatus
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.cost.audit import CostAuditLogger
from domains.socialwise.services.cost.idempotency import IdempotencyService
from domains.socialwise.services.cost.pricing import PricingService, calculate_cost
from platform_core.config import settings
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@dataclass(slots=True)
class CostEventPayload:
    ts: datetime
    provider: str
    product: str
    unit: str
    units: Decimal
    raw: dict[str, Any]
    region: str | None = None
    external_id: str | None = None
    trace_id: str | None = None
    session_id: str | None = None
    inbox_id: str | None = None
    user_id: str | None = None
    intent: str | None = None

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "CostEventPayload":
        timestamp = payload.get("ts") or payload.get("timestamp")
        if isinstance(timestamp, datetime):
            parsed_ts = timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)
        elif isinstance(timestamp, str):
            parsed_ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        else:
            parsed_ts = datetime.now(timezone.utc)

        units_value = payload.get("units")
        if units_value is None:
            raise ValueError("Cost event payload requires 'units'")

        provider = payload.get("provider")
        product = payload.get("product")
        unit = payload.get("unit")
        if not provider or not product or not unit:
            raise ValueError("Cost event payload requires provider, product and unit")

        raw_value = payload.get("raw")
        raw = raw_value if isinstance(raw_value, dict) else {}

        return cls(
            ts=parsed_ts,
            provider=str(provider),
            product=str(product),
            unit=str(unit),
            units=Decimal(str(units_value)),
            raw=raw,
            region=payload.get("region"),
            external_id=payload.get("external_id") or payload.get("externalId"),
            trace_id=payload.get("trace_id") or payload.get("traceId"),
            session_id=payload.get("session_id") or payload.get("sessionId"),
            inbox_id=payload.get("inbox_id") or payload.get("inboxId"),
            user_id=payload.get("user_id") or payload.get("userId"),
            intent=payload.get("intent"),
        )

    def to_idempotency_dict(self) -> dict[str, Any]:
        return {
            "ts": self.ts,
            "provider": self.provider,
            "product": self.product,
            "unit": self.unit,
            "units": self.units,
            "external_id": self.external_id,
            "session_id": self.session_id,
            "inbox_id": self.inbox_id,
            "user_id": self.user_id,
        }


def _redis() -> Redis:
    return Redis.from_url(str(settings.redis_url), decode_responses=True)


async def _process_single_cost_event(payload: CostEventPayload) -> dict[str, Any]:
    started_at = perf_counter()
    redis = _redis()

    async with session_ctx() as session:
        pricing_service = PricingService(session)
        idempotency_service = IdempotencyService(session, redis)
        audit_logger = CostAuditLogger(session)

        idempotency_result = await idempotency_service.check_idempotency(payload.to_idempotency_dict())
        if idempotency_result.is_duplicate:
            await idempotency_service.increment_duplicates_blocked()
            logger.info(
                "socialwise_cost_event_duplicate_ignored",
                provider=payload.provider,
                product=payload.product,
                external_id=payload.external_id,
                trace_id=payload.trace_id,
                existing_event_id=idempotency_result.existing_event_id,
            )
            return {
                "status": "duplicate",
                "existingEventId": idempotency_result.existing_event_id,
                "reason": idempotency_result.reason,
            }

        resolved_price = await pricing_service.resolve_unit_price(
            provider=payload.provider,
            product=payload.product,
            unit=payload.unit,
            when=payload.ts,
            region=payload.region,
        )

        currency = resolved_price.currency if resolved_price is not None else "USD"
        unit_price = resolved_price.price_per_unit if resolved_price is not None else None
        total_cost = (
            calculate_cost(payload.units, resolved_price.price_per_unit, payload.unit)
            if resolved_price is not None
            else None
        )
        status = EventStatus.PRICED.value if resolved_price is not None else EventStatus.PENDING_PRICING.value

        event = CostEvent(
            ts=payload.ts,
            provider=payload.provider,
            product=payload.product,
            unit=payload.unit,
            units=payload.units,
            currency=currency,
            unit_price=unit_price,
            cost=total_cost,
            status=status,
            external_id=payload.external_id,
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            inbox_id=payload.inbox_id,
            user_id=payload.user_id,
            intent=payload.intent,
            raw=payload.raw,
        )
        session.add(event)
        await session.flush()

        await idempotency_service.register_processed_event(payload.to_idempotency_dict(), event.id)

        today_key = datetime.now(timezone.utc).date().isoformat()
        await redis.incr(f"cost:jobs:daily:{today_key}")

        processing_time_ms = int((perf_counter() - started_at) * 1000)
        if status == EventStatus.PRICED.value and total_cost is not None and unit_price is not None:
            await audit_logger.log_cost_event_priced(
                event_id=event.id,
                unit_price=float(unit_price),
                total_cost=float(total_cost),
                currency=currency,
                processing_time_ms=processing_time_ms,
            )
        else:
            await audit_logger.log_cost_event_created(
                event_id=event.id,
                provider=payload.provider,
                product=payload.product,
                units=float(payload.units),
                session_id=payload.session_id,
                inbox_id=payload.inbox_id,
                user_id=payload.user_id,
                correlation_id=payload.trace_id,
            )

        logger.info(
            "socialwise_cost_event_processed",
            event_id=event.id,
            provider=payload.provider,
            product=payload.product,
            unit=payload.unit,
            units=str(payload.units),
            cost=str(total_cost) if total_cost is not None else None,
            currency=currency,
            status=status,
            trace_id=payload.trace_id,
            processing_time_ms=processing_time_ms,
        )

        return {
            "status": status,
            "eventId": event.id,
            "cost": float(total_cost) if total_cost is not None else None,
            "currency": currency,
        }


@broker.task(retry_on_error=True, max_retries=3)
async def process_cost_event_task(event_data: dict[str, Any]) -> dict[str, Any]:
    payload = CostEventPayload.from_payload(event_data)
    return await _process_single_cost_event(payload)


@broker.task(retry_on_error=True, max_retries=3)
async def process_cost_event_batch_task(events: list[dict[str, Any]], trace_id: str | None = None) -> dict[str, Any]:
    processed = 0
    duplicates = 0
    pending_pricing = 0

    for raw_event in events:
        if trace_id and "traceId" not in raw_event and "trace_id" not in raw_event:
            raw_event = {**raw_event, "traceId": trace_id}

        result = await _process_single_cost_event(CostEventPayload.from_payload(raw_event))
        if result["status"] == "duplicate":
            duplicates += 1
        else:
            processed += 1
            if result["status"] == EventStatus.PENDING_PRICING.value:
                pending_pricing += 1

    return {
        "processed": processed,
        "duplicates": duplicates,
        "pendingPricing": pending_pricing,
        "total": len(events),
        "traceId": trace_id,
    }


@broker.task(retry_on_error=True, max_retries=2)
async def reprocess_pending_cost_events_task(limit: int = 100) -> dict[str, int]:
    async with session_ctx() as session:
        pricing_service = PricingService(session)
        result = await pricing_service.process_pending_pricing_events(limit)
        logger.info("socialwise_cost_pending_reprocessed", **result)
        return result


@broker.task(retry_on_error=True, max_retries=1)
async def cleanup_cost_idempotency_cache_task() -> dict[str, str]:
    async with session_ctx() as session:
        service = IdempotencyService(session, _redis())
        result = await service.cleanup_expired_cache()
        logger.info("socialwise_cost_idempotency_cleanup", **result)
        return result
