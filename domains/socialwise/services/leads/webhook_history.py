"""Background persistence for webhook leads and conversation history."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.leads.lead_service import (
    FindOrCreateLeadOptions,
    lead_service,
)
from domains.socialwise.services.leads.message_service import (
    SaveMessageOptions,
    message_service,
)
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

SYSTEM_BOT_NAMES = (
    "socialwise bot",
    "socialwisebot",
    "chatwit bot",
    "chatwitbot",
    "bot socialwise",
    "bot chatwit",
    "sistema",
    "system",
    "agente bot",
    "agent bot",
)


@dataclass(slots=True)
class WebhookHistoryPayload:
    account_id: str
    inbox_id: str
    channel_type: str
    user_text: str
    response: dict[str, Any]
    trace_id: str | None = None
    source_message_id: str | None = None
    contact_id: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    classification_band: str | None = None
    classification_strategy: str | None = None


def extract_response_text(response: dict[str, Any]) -> str:
    if response.get("text"):
        return str(response["text"])

    whatsapp = response.get("whatsapp") or {}
    if isinstance(whatsapp, dict):
        interactive = whatsapp.get("interactive") or {}
        if isinstance(interactive, dict):
            body = interactive.get("body") or {}
            if isinstance(body, dict) and body.get("text"):
                return str(body["text"])
        text_block = whatsapp.get("text") or {}
        if isinstance(text_block, dict) and text_block.get("body"):
            return str(text_block["body"])

    for channel in ("instagram", "facebook"):
        block = response.get(channel) or {}
        if isinstance(block, dict):
            if block.get("text"):
                return str(block["text"])
            message = block.get("message") or {}
            if isinstance(message, dict) and message.get("text"):
                return str(message["text"])

    if response.get("action") == "handoff":
        return "handoff"
    return ""


def extract_button_titles(response: dict[str, Any]) -> list[str]:
    titles: list[str] = []

    whatsapp = response.get("whatsapp") or {}
    interactive = whatsapp.get("interactive") if isinstance(whatsapp, dict) else None
    action = interactive.get("action") if isinstance(interactive, dict) else None

    buttons = action.get("buttons") if isinstance(action, dict) else None
    if isinstance(buttons, list):
        for button in buttons:
            reply = button.get("reply") if isinstance(button, dict) else None
            title = reply.get("title") if isinstance(reply, dict) else None
            if isinstance(title, str) and title.strip():
                titles.append(title.strip())

    sections = action.get("sections") if isinstance(action, dict) else None
    if isinstance(sections, list):
        for section in sections:
            rows = section.get("rows") if isinstance(section, dict) else None
            if not isinstance(rows, list):
                continue
            for row in rows:
                title = row.get("title") if isinstance(row, dict) else None
                if isinstance(title, str) and title.strip():
                    titles.append(title.strip())

    for channel in ("instagram", "facebook"):
        block = response.get(channel) or {}
        quick_replies = block.get("quick_replies") if isinstance(block, dict) else None
        if not isinstance(quick_replies, list):
            continue
        for reply in quick_replies:
            title = reply.get("title") if isinstance(reply, dict) else None
            if isinstance(title, str) and title.strip():
                titles.append(title.strip())

    return titles


def is_system_bot(contact_name: str | None) -> bool:
    if not contact_name:
        return False
    normalized = contact_name.strip().lower()
    return any(normalized == bot_name or bot_name in normalized for bot_name in SYSTEM_BOT_NAMES)


async def persist_webhook_history(payload: WebhookHistoryPayload) -> None:
    if not payload.account_id:
        logger.warning("webhook_history_missing_account_id", trace_id=payload.trace_id)
        return

    if is_system_bot(payload.contact_name):
        logger.info(
            "webhook_history_skipping_system_bot",
            contact_name=payload.contact_name,
            trace_id=payload.trace_id,
        )
        return

    assistant_text = extract_response_text(payload.response)
    button_titles = extract_button_titles(payload.response)

    async with session_ctx() as session:
        try:
            lead_with_chat = await lead_service.find_or_create_lead(
                session,
                FindOrCreateLeadOptions(
                    chatwit_account_id=payload.account_id,
                    phone_number=payload.contact_phone,
                    chatwit_contact_id=payload.contact_id,
                    inbox_id=payload.inbox_id,
                    name=payload.contact_name,
                ),
            )

            await message_service.save_message(
                session,
                SaveMessageOptions(
                    chat_id=lead_with_chat.chat.id,
                    content=payload.user_text,
                    is_from_lead=True,
                    external_id=payload.source_message_id,
                    message_type="text",
                    metadata={
                        "channelType": payload.channel_type,
                        "inboxId": payload.inbox_id,
                        "traceId": payload.trace_id,
                        "band": payload.classification_band,
                    },
                ),
            )

            if assistant_text:
                metadata: dict[str, Any] = {
                    "traceId": payload.trace_id,
                    "band": payload.classification_band,
                    "strategy": payload.classification_strategy,
                }
                if button_titles:
                    metadata["buttons"] = button_titles

                await message_service.save_message(
                    session,
                    SaveMessageOptions(
                        chat_id=lead_with_chat.chat.id,
                        content=assistant_text,
                        is_from_lead=False,
                        external_id=f"assistant_{payload.trace_id}" if payload.trace_id else None,
                        message_type="assistant",
                        metadata=metadata,
                    ),
                )

            await lead_service.touch_lead(session, lead_with_chat.lead.id)
        except Exception as exc:
            await session.rollback()
            logger.error(
                "webhook_history_persist_failed",
                error=str(exc),
                trace_id=payload.trace_id,
                account_id=payload.account_id,
            )
