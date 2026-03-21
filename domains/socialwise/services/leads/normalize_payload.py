"""Normalize Chatwit lead sync payloads from multiple event types.

Port of: lib/leads-chatwit/normalize-chatwit-lead-sync-payload.ts
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

from domains.socialwise.services.leads.sanitize_payload import (
    SanitizedArquivo,
    _build_chatwit_conversation_url,
    sanitize_chatwit_payload,
)
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

ChatwitLeadSyncMode = Literal["specific", "legacy_contact", "legacy_message"]
SkipReason = Literal["message_without_attachments", "outgoing_message", "private_message"]


@dataclass(slots=True)
class WebhookPayloadDict:
    """Dict-compatible webhook payload used across the leads pipeline."""

    usuario: dict[str, Any]
    origem_lead: dict[str, Any]


@dataclass(slots=True)
class NormalizedLeadSyncResult:
    mode: ChatwitLeadSyncMode
    event: str
    payload: WebhookPayloadDict | None = None
    skip_reason: SkipReason | None = None


_GENERIC_MESSAGE_EVENTS = frozenset({"message_created", "message_updated"})
_LEAD_CONTACT_EVENTS = frozenset({"contact_created", "contact_updated"})
_SPECIFIC_LEAD_SYNC_INTEGRATIONS = frozenset({"socialwise_lead_sync", "chatwit_lead_sync"})


def _unwrap_payload(raw_payload: Any) -> dict[str, Any]:
    item = raw_payload[0] if isinstance(raw_payload, list) else raw_payload
    if not item or not isinstance(item, dict):
        raise ValueError("Payload vazio ou inválido")
    return item.get("body", item) if isinstance(item.get("body"), dict) else item


def _normalize_channel(channel: str | None) -> str:
    if not channel:
        return "whatsapp"
    return str(channel).replace("Channel::", "").lower()


def _build_lead_url(body: dict[str, Any]) -> str:
    lead_url = body.get("leadUrl")
    if isinstance(lead_url, str) and lead_url.strip():
        return lead_url

    base_url = os.environ.get("CHATWIT_BASE_URL", "https://chatwit.witdev.com.br")
    account = body.get("account") or {}
    conversation = body.get("conversation") or {}
    return _build_chatwit_conversation_url(
        base_url,
        account.get("id"),
        conversation.get("display_id") or conversation.get("id"),
    )


def _normalize_attachment(raw: dict[str, Any]) -> SanitizedArquivo | None:
    raw_id = raw.get("chatwitFileId") or raw.get("id")
    chatwit_file_id = int(raw_id) if raw_id is not None else 0

    data_url = (
        raw.get("data_url")
        or raw.get("dataUrl")
        or raw.get("url")
        or ""
    )
    if not str(data_url).strip():
        return None
    if not isinstance(chatwit_file_id, int) or chatwit_file_id <= 0:
        return None

    return SanitizedArquivo(
        file_type=str(raw.get("file_type") or raw.get("fileType") or "file"),
        data_url=str(data_url),
        chatwit_file_id=chatwit_file_id,
    )


def _normalize_attachments(raw_attachments: Any) -> list[dict[str, Any]]:
    """Normalize and deduplicate attachments, returning dicts for the payload."""
    attachments = raw_attachments if isinstance(raw_attachments, list) else []
    dedup: dict[int, dict[str, Any]] = {}

    for att in attachments:
        if not isinstance(att, dict):
            continue
        normalized = _normalize_attachment(att)
        if normalized and normalized.chatwit_file_id not in dedup:
            dedup[normalized.chatwit_file_id] = {
                "file_type": normalized.file_type,
                "data_url": normalized.data_url,
                "chatwitFileId": normalized.chatwit_file_id,
            }

    return list(dedup.values())


def _has_relevant_attachments(body: dict[str, Any]) -> bool:
    attachments = body.get("attachments")
    if isinstance(attachments, list) and len(attachments) > 0:
        return True

    messages = (body.get("conversation") or {}).get("messages")
    if isinstance(messages, list):
        return any(
            isinstance(m.get("attachments"), list) and len(m["attachments"]) > 0
            for m in messages
            if isinstance(m, dict)
        )
    return False


def _is_specific_lead_sync(body: dict[str, Any]) -> bool:
    metadata = body.get("metadata") or {}
    integration = str(
        body.get("integration")
        or metadata.get("integration")
        or metadata.get("purpose")
        or ""
    ).strip()
    return (
        integration in _SPECIFIC_LEAD_SYNC_INTEGRATIONS
        or metadata.get("purpose") == "lead_sync"
    )


def _map_body_to_payload(body: dict[str, Any]) -> WebhookPayloadDict:
    contact = body.get("contact") or body.get("sender") or body.get("origemLead") or body
    account = body.get("account") or (body.get("usuario") or {}).get("account") or {}
    inbox = body.get("inbox") or (body.get("usuario") or {}).get("inbox") or {}
    source_id = (
        contact.get("id")
        or body.get("id")
        or body.get("contact_id")
        or body.get("source_id")
        or (body.get("origemLead") or {}).get("source_id")
    )

    if not account.get("id") or not source_id:
        raise ValueError("Payload de lead sync sem account.id ou contact/source_id")

    return WebhookPayloadDict(
        usuario={
            "account": {"id": str(account["id"]), "name": str(account.get("name", "Conta Chatwit"))},
            "inbox": {"id": str(inbox.get("id", "lead_sync")), "name": str(inbox.get("name", "Lead Sync"))},
            "channel": _normalize_channel(
                body.get("channel_type") or body.get("channel") or (body.get("usuario") or {}).get("channel")
            ),
            "CHATWIT_ACCESS_TOKEN": str(
                body.get("ACCESS_TOKEN")
                or body.get("access_token")
                or body.get("chatwitAccessToken")
                or (body.get("usuario") or {}).get("CHATWIT_ACCESS_TOKEN")
                or ""
            ),
        },
        origem_lead={
            "source_id": str(source_id),
            "name": str(
                contact.get("name")
                or body.get("contact_name")
                or (body.get("origemLead") or {}).get("name")
                or "Lead sem nome"
            ),
            "phone_number": str(
                contact.get("phone_number")
                or body.get("contact_phone")
                or (body.get("origemLead") or {}).get("phone_number")
                or ""
            ),
            "thumbnail": str(
                contact.get("thumbnail")
                or contact.get("avatar")
                or body.get("thumbnail")
                or body.get("avatar")
                or (body.get("origemLead") or {}).get("thumbnail")
                or ""
            ),
            "leadUrl": _build_lead_url(body),
            "arquivos": _normalize_attachments(
                body.get("attachments") or body.get("files") or (body.get("origemLead") or {}).get("arquivos")
            ),
        },
    )


def _sanitized_to_payload_dict(raw_payload: Any) -> WebhookPayloadDict:
    """Convert sanitized payload to the dict-based format used by process_sync."""
    s = sanitize_chatwit_payload(raw_payload)
    return WebhookPayloadDict(
        usuario={
            "account": {"id": s.usuario.account_id, "name": s.usuario.account_name},
            "inbox": {"id": s.usuario.inbox_id, "name": s.usuario.inbox_name},
            "channel": s.usuario.channel,
            "CHATWIT_ACCESS_TOKEN": s.usuario.chatwit_access_token,
        },
        origem_lead={
            "source_id": s.origem_lead.source_id,
            "name": s.origem_lead.name,
            "phone_number": s.origem_lead.phone_number,
            "thumbnail": s.origem_lead.thumbnail,
            "leadUrl": s.origem_lead.lead_url,
            "arquivos": [
                {
                    "file_type": a.file_type,
                    "data_url": a.data_url,
                    "chatwitFileId": a.chatwit_file_id,
                }
                for a in s.origem_lead.arquivos
            ],
        },
    )


def normalize_chatwit_lead_sync_payload(raw_payload: Any) -> NormalizedLeadSyncResult:
    """Detect event type and normalize the webhook payload.

    Returns:
        NormalizedLeadSyncResult with the detected mode and optional payload/skip_reason.
    """
    body = _unwrap_payload(raw_payload)
    event = str(body.get("event", "message_created"))

    root_msg_type = str(
        body.get("message_type")
        or (body.get("message") or {}).get("message_type")
        or ""
    ).lower()

    if root_msg_type == "outgoing":
        return NormalizedLeadSyncResult(mode="legacy_message", event=event, skip_reason="outgoing_message")

    if body.get("private") is True:
        return NormalizedLeadSyncResult(mode="legacy_message", event=event, skip_reason="private_message")

    if _is_specific_lead_sync(body):
        return NormalizedLeadSyncResult(mode="specific", event=event, payload=_map_body_to_payload(body))

    if event in _LEAD_CONTACT_EVENTS:
        return NormalizedLeadSyncResult(mode="legacy_contact", event=event, payload=_map_body_to_payload(body))

    if event in _GENERIC_MESSAGE_EVENTS and not _has_relevant_attachments(body):
        return NormalizedLeadSyncResult(
            mode="legacy_message", event=event, skip_reason="message_without_attachments"
        )

    return NormalizedLeadSyncResult(
        mode="legacy_message",
        event=event,
        payload=_sanitized_to_payload_dict(raw_payload),
    )
