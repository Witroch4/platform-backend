"""TaskIQ worker for Socialwise Instagram webhook processing."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.instagram_webhook import handle_instagram_webhook
from platform_core.logging.config import get_logger
from platform_core.tasks.brokers.socialwise import broker_sw as broker

logger = get_logger(__name__)


@dataclass(slots=True)
class InstagramWebhookPayload:
    object: str
    entry: list[dict[str, Any]]

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "InstagramWebhookPayload":
        entry = payload.get("entry")
        if not isinstance(entry, list):
            raise ValueError("Instagram webhook payload requires 'entry' array")
        return cls(object=str(payload.get("object", "")), entry=list(entry))

    def to_payload(self) -> dict[str, Any]:
        return {"object": self.object, "entry": self.entry}


@broker.task(retry_on_error=True, max_retries=3)
async def process_instagram_webhook_task(event_data: dict[str, Any]) -> dict[str, int]:
    payload = InstagramWebhookPayload.from_payload(event_data)
    async with session_ctx() as session:
        result = await handle_instagram_webhook(session, payload.to_payload())
    logger.info("socialwise_instagram_webhook_processed", **result)
    return result
