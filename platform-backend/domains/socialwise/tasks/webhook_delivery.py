"""TaskIQ worker for Socialwise webhook deliveries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.webhook_delivery import WebhookDeliveryService
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@dataclass(slots=True)
class WebhookDeliveryPayload:
    delivery_id: str
    attempt: int = 1
    webhook_id: str | None = None

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "WebhookDeliveryPayload":
        return cls(
            delivery_id=str(payload["deliveryId"]),
            attempt=int(payload.get("attempt", 1)),
            webhook_id=str(payload["webhookId"]) if payload.get("webhookId") is not None else None,
        )


@broker.task(retry_on_error=True, max_retries=3)
async def process_webhook_delivery_task(job_data: dict[str, Any]) -> dict[str, Any]:
    payload = WebhookDeliveryPayload.from_payload(job_data)
    async with session_ctx() as session:
        service = WebhookDeliveryService(session)
        result = await service.deliver(payload.delivery_id)

    if result["success"]:
        logger.info(
            "socialwise_webhook_delivery_succeeded",
            delivery_id=payload.delivery_id,
            status_code=result.get("statusCode"),
            attempt=payload.attempt,
        )
        return result

    logger.warning(
        "socialwise_webhook_delivery_failed",
        delivery_id=payload.delivery_id,
        attempt=payload.attempt,
        error=result.get("error"),
    )
    raise RuntimeError(result.get("error") or "Webhook delivery failed")
