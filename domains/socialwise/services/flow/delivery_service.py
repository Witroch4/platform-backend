"""ChatwitDeliveryService — Async message delivery via Chatwit REST API.

Port of services/flow-engine/chatwit-delivery-service.ts (axios → httpx).

Responsible for sending messages (text, media, interactive, template)
through the Chatwit REST API when the synchronous bridge is no longer viable.

Uses ``api_access_token`` from the Agent Bot configured in Chatwit.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

RETRY_ATTEMPTS = 3
RETRY_BASE_MS = 500
REQUEST_TIMEOUT_S = 15.0

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class DeliveryResult:
    success: bool
    message_id: int | None = None
    error: str | None = None
    attempts: int = 0


@dataclass(slots=True)
class DeliveryContext:
    account_id: int
    conversation_id: int
    conversation_display_id: int | None = None
    inbox_id: int = 0
    contact_id: int = 0
    contact_name: str = ""
    contact_phone: str = ""
    channel_type: str = "whatsapp"
    source_message_id: str | None = None
    prisma_inbox_id: str | None = None
    chatwit_access_token: str = ""
    chatwit_base_url: str = ""
    is_playground: bool = False
    playground_execution_id: str | None = None


@dataclass(slots=True)
class DeliveryPayload:
    type: str  # text | media | interactive | reaction | template | chatwit_action
    content: str | None = None
    media_url: str | None = None
    filename: str | None = None
    interactive_payload: dict[str, Any] | None = None
    template_payload: dict[str, Any] | None = None
    private: bool = False
    emoji: str | None = None
    target_message_id: str | None = None
    action_type: str | None = None
    contact_fields: dict[str, Any] | None = None
    contact_id: int | None = None
    assignee_id: int | None = None
    labels: list[str] | None = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class ChatwitDeliveryService:
    def __init__(self, base_url: str, access_token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._access_token = access_token

    def _headers(self) -> dict[str, str]:
        return {
            "api_access_token": self._access_token,
            "Content-Type": "application/json",
            "User-Agent": "SocialWise-FlowEngine/1.0",
        }

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    async def deliver(self, ctx: DeliveryContext, payload: DeliveryPayload) -> DeliveryResult:
        """Generic delivery — routes to the correct method based on ``payload.type``."""
        if ctx.is_playground and ctx.playground_execution_id:
            return DeliveryResult(success=True, message_id=0, attempts=0)

        dispatch = {
            "text": lambda: self.deliver_text(ctx, payload.content or "", payload.private),
            "media": lambda: self.deliver_media(ctx, payload.media_url or "", payload.filename, payload.content),
            "interactive": lambda: self.deliver_interactive(ctx, payload.interactive_payload or {}),
            "reaction": lambda: self.deliver_text(ctx, payload.emoji or "👍", False),
            "template": lambda: self.deliver_template(ctx, payload.template_payload or {}),
            "chatwit_action": lambda: self.deliver_chatwit_action(ctx, payload),
        }

        handler = dispatch.get(payload.type)
        if not handler:
            logger.warning("chatwit_delivery_unknown_type", type=payload.type)
            return DeliveryResult(success=False, error=f"Unknown type: {payload.type}", attempts=0)

        return await handler()

    # -----------------------------------------------------------------------
    # Delivery methods
    # -----------------------------------------------------------------------

    async def deliver_text(self, ctx: DeliveryContext, content: str, is_private: bool = False) -> DeliveryResult:
        body = {"content": content, "message_type": "outgoing", "private": is_private}
        return await self._post_message(ctx, body)

    async def deliver_media(
        self, ctx: DeliveryContext, media_url: str, filename: str | None = None, caption: str | None = None,
    ) -> DeliveryResult:
        upload_url = f"{self._base_url}/api/v1/accounts/{ctx.account_id}/upload"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(upload_url, json={"external_url": media_url}, headers=self._headers())
                resp.raise_for_status()
                blob_id = resp.json().get("blob_id")
                if not blob_id:
                    return DeliveryResult(success=False, error="Upload failed: blob_id not returned", attempts=1)
        except Exception as exc:
            logger.error("chatwit_delivery_upload_error", media_url=media_url, error=str(exc))
            return DeliveryResult(success=False, error=f"Upload failed: {exc}", attempts=1)

        body = {"content": caption or "", "message_type": "outgoing", "attachments": [blob_id]}
        return await self._post_message(ctx, body)

    async def deliver_interactive(self, ctx: DeliveryContext, interactive_payload: dict[str, Any]) -> DeliveryResult:
        body_text = (interactive_payload.get("body") or {}).get("text", "")
        body = {
            "content": body_text,
            "content_type": "integrations",
            "content_attributes": {"interactive": interactive_payload},
            "message_type": "outgoing",
        }
        return await self._post_message(ctx, body)

    async def deliver_template(self, ctx: DeliveryContext, template_payload: dict[str, Any]) -> DeliveryResult:
        template_name = template_payload.get("name", "unknown")
        body = {
            "content": f"[Template: {template_name}]",
            "message_type": "outgoing",
            "template_params": template_payload,
        }
        return await self._post_message(ctx, body)

    async def deliver_chatwit_action(self, ctx: DeliveryContext, payload: DeliveryPayload) -> DeliveryResult:
        action_type = payload.action_type or "resolve_conversation"
        target_id = ctx.conversation_display_id or ctx.conversation_id

        dispatch: dict[str, Any] = {
            "resolve_conversation": lambda: self._post_chatwit_action(
                ctx, f"/api/v1/accounts/{ctx.account_id}/conversations/{target_id}/toggle_status",
                {"status": "resolved"}, "resolve_conversation",
            ),
            "assign_agent": lambda: (
                self._post_chatwit_action(
                    ctx, f"/api/v1/accounts/{ctx.account_id}/conversations/{target_id}/assignments",
                    {"assignee_id": payload.assignee_id}, "assign_agent",
                ) if payload.assignee_id else _fail("assigneeId não fornecido")
            ),
            "add_label": lambda: (
                self._post_chatwit_action(
                    ctx, f"/api/v1/accounts/{ctx.account_id}/conversations/{target_id}/labels",
                    {"labels": payload.labels}, "add_label",
                ) if payload.labels else _fail("labels não fornecidas")
            ),
            "remove_label": lambda: (
                self._remove_labels_batch(ctx, target_id, payload.labels)
                if payload.labels else _fail("labels não fornecidas")
            ),
            "update_contact": lambda: (
                self._post_chatwit_action(
                    ctx, f"/api/v1/accounts/{ctx.account_id}/contacts/{payload.contact_id}",
                    payload.contact_fields or {}, "update_contact", method="PUT",
                ) if payload.contact_id else _fail("contactId não fornecido")
            ),
        }

        handler = dispatch.get(action_type)
        if not handler:
            return DeliveryResult(success=False, error=f"Unknown action: {action_type}", attempts=0)
        return await handler()

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _post_message(self, ctx: DeliveryContext, body: dict[str, Any]) -> DeliveryResult:
        target_id = ctx.conversation_display_id or ctx.conversation_id
        url = f"{self._base_url}/api/v1/accounts/{ctx.account_id}/conversations/{target_id}/messages"

        last_error = ""
        for attempt in range(1, RETRY_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                    resp = await client.post(url, json=body, headers=self._headers())
                    resp.raise_for_status()
                    data = resp.json()
                    message_id = data.get("id") or (data.get("data") or {}).get("id")
                    return DeliveryResult(success=True, message_id=message_id, attempts=attempt)
            except httpx.HTTPStatusError as exc:
                last_error = str(exc)
                status = exc.response.status_code
                if 400 <= status < 500 and status != 429:
                    return DeliveryResult(success=False, error=last_error, attempts=attempt)
                if attempt < RETRY_ATTEMPTS:
                    await asyncio.sleep(RETRY_BASE_MS / 1000 * (2 ** (attempt - 1)))
            except Exception as exc:
                last_error = str(exc)
                if attempt < RETRY_ATTEMPTS:
                    await asyncio.sleep(RETRY_BASE_MS / 1000 * (2 ** (attempt - 1)))

        return DeliveryResult(success=False, error=last_error, attempts=RETRY_ATTEMPTS)

    async def _post_chatwit_action(
        self,
        ctx: DeliveryContext,
        path: str,
        body: dict[str, Any],
        action_name: str,
        method: str = "POST",
    ) -> DeliveryResult:
        url = f"{self._base_url}{path}"
        last_error = ""

        for attempt in range(1, RETRY_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                    if method == "DELETE":
                        resp = await client.request("DELETE", url, json=body, headers=self._headers())
                    elif method == "PUT":
                        resp = await client.put(url, json=body, headers=self._headers())
                    else:
                        resp = await client.post(url, json=body, headers=self._headers())
                    resp.raise_for_status()
                    return DeliveryResult(success=True, attempts=attempt)
            except httpx.HTTPStatusError as exc:
                last_error = str(exc)
                status = exc.response.status_code
                if 400 <= status < 500 and status != 429:
                    return DeliveryResult(success=False, error=last_error, attempts=attempt)
                if attempt < RETRY_ATTEMPTS:
                    await asyncio.sleep(RETRY_BASE_MS / 1000 * (2 ** (attempt - 1)))
            except Exception as exc:
                last_error = str(exc)
                if attempt < RETRY_ATTEMPTS:
                    await asyncio.sleep(RETRY_BASE_MS / 1000 * (2 ** (attempt - 1)))

        return DeliveryResult(success=False, error=last_error, attempts=RETRY_ATTEMPTS)

    async def _remove_labels_batch(
        self, ctx: DeliveryContext, conversation_id: int | str, labels: list[str],
    ) -> DeliveryResult:
        total_attempts = 0
        errors: list[str] = []
        for label in labels:
            result = await self._post_chatwit_action(
                ctx,
                f"/api/v1/accounts/{ctx.account_id}/conversations/{conversation_id}/labels",
                {"labels": [label]}, "remove_label", method="DELETE",
            )
            total_attempts += result.attempts
            if not result.success:
                errors.append(f"{label}: {result.error}")

        if errors:
            return DeliveryResult(
                success=len(errors) < len(labels),
                error="; ".join(errors),
                attempts=total_attempts,
            )
        return DeliveryResult(success=True, attempts=total_attempts)


def _fail(msg: str) -> DeliveryResult:
    return DeliveryResult(success=False, error=msg, attempts=0)


def create_delivery_service(ctx: DeliveryContext) -> ChatwitDeliveryService:
    """Factory from a DeliveryContext."""
    return ChatwitDeliveryService(ctx.chatwit_base_url, ctx.chatwit_access_token)
