"""Webhook delivery runtime for Socialwise queue-management workers."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from time import perf_counter
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.webhook_delivery import WebhookDelivery

DEFAULT_WEBHOOK_TIMEOUT_SECONDS = 10.0


class WebhookDeliveryService:
    """Minimal Python port of the Socialwise webhook delivery worker."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def deliver(self, delivery_id: str) -> dict[str, Any]:
        stmt = (
            select(WebhookDelivery)
            .where(WebhookDelivery.id == delivery_id)
            .options(selectinload(WebhookDelivery.webhook))
            .limit(1)
        )
        delivery = (await self.session.execute(stmt)).scalar_one_or_none()
        if delivery is None or delivery.webhook is None:
            raise ValueError(f"Delivery or webhook not found: {delivery_id}")

        payload_text = json.dumps(delivery.payload)
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "User-Agent": "Socialwise-Webhook/1.0",
            "X-Webhook-Event": delivery.event_type,
            "X-Webhook-Delivery": delivery.id,
            "X-Webhook-Timestamp": delivery.created_at.isoformat(),
        }
        if delivery.webhook.headers:
            headers.update({str(key): str(value) for key, value in delivery.webhook.headers.items()})
        if delivery.webhook.secret:
            headers["X-Webhook-Signature"] = hmac.new(
                delivery.webhook.secret.encode(),
                payload_text.encode(),
                hashlib.sha256,
            ).hexdigest()

        started_at = perf_counter()
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_WEBHOOK_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    delivery.webhook.url,
                    headers=headers,
                    content=payload_text,
                )

            delivery.response_status = response.status_code
            delivery.response_body = response.text[:10000]
            delivery.delivered_at = datetime.now(timezone.utc)
            delivery.attempts += 1

            response_time_ms = int((perf_counter() - started_at) * 1000)
            return {
                "success": response.is_success,
                "statusCode": response.status_code,
                "responseTime": response_time_ms,
                "error": None if response.is_success else f"HTTP {response.status_code}: {response.reason_phrase}",
            }
        except Exception as exc:
            delivery.response_status = 0
            delivery.response_body = str(exc)[:10000]
            delivery.attempts += 1
            return {
                "success": False,
                "responseTime": int((perf_counter() - started_at) * 1000),
                "error": str(exc),
            }
