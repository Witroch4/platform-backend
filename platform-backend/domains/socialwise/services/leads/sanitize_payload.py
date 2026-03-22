"""Sanitize and normalize raw Chatwit webhook payloads.

Port of: lib/leads-chatwit/sanitize-chatwit-payload.ts
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from platform_core.logging.config import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class SanitizedArquivo:
    file_type: str
    data_url: str
    chatwit_file_id: int


@dataclass(slots=True)
class SanitizedOrigemLead:
    source_id: str
    name: str
    phone_number: str
    thumbnail: str
    lead_url: str
    arquivos: list[SanitizedArquivo] = field(default_factory=list)


@dataclass(slots=True)
class SanitizedUsuario:
    account_id: str
    account_name: str
    inbox_id: str
    inbox_name: str
    channel: str
    chatwit_access_token: str


@dataclass(slots=True)
class SanitizedChatwitPayload:
    usuario: SanitizedUsuario
    origem_lead: SanitizedOrigemLead


def _build_chatwit_conversation_url(
    base_url: str | None,
    account_id: str | int | None,
    conversation_display_id: str | int | None,
) -> str:
    """Build a Chatwit conversation URL."""
    if not base_url or account_id is None or conversation_display_id is None:
        return ""
    normalized = base_url.rstrip("/")
    return f"{normalized}/app/accounts/{account_id}/conversations/{conversation_display_id}"


def _extract_and_deduplicate_arquivos(
    conversation: dict[str, Any] | None,
    root_attachments: list[dict[str, Any]] | None = None,
) -> list[SanitizedArquivo]:
    """Extract files from message history + root attachments with dedup."""
    arquivos_map: dict[int, SanitizedArquivo] = {}

    messages = (conversation or {}).get("messages", [])
    for msg in messages:
        for att in msg.get("attachments", []):
            att_id = att.get("id")
            if att_id and att_id not in arquivos_map:
                arquivos_map[att_id] = SanitizedArquivo(
                    file_type=att.get("file_type", "file"),
                    data_url=att.get("data_url", ""),
                    chatwit_file_id=att_id,
                )

    for att in root_attachments or []:
        att_id = att.get("id")
        if att_id and att_id not in arquivos_map:
            arquivos_map[att_id] = SanitizedArquivo(
                file_type=att.get("file_type", "file"),
                data_url=att.get("data_url", ""),
                chatwit_file_id=att_id,
            )

    logger.debug(
        "extract_arquivos",
        messages_count=len(messages),
        root_count=len(root_attachments or []),
        unique_count=len(arquivos_map),
    )
    return list(arquivos_map.values())


def sanitize_chatwit_payload(raw_payload: Any) -> SanitizedChatwitPayload:
    """Sanitize raw Chatwit webhook payload.

    Args:
        raw_payload: Array or object from Chatwit webhook.

    Returns:
        Sanitized and normalized payload.

    Raises:
        ValueError: If critical data is missing.
    """
    item = raw_payload[0] if isinstance(raw_payload, list) else raw_payload
    if not item:
        raise ValueError("Payload vazio ou inválido")

    body = item.get("body", item) if isinstance(item, dict) else item

    account = body.get("account") or {}
    inbox = body.get("inbox") or {}
    conversation = body.get("conversation") or {}

    if not account.get("id") or not account.get("name"):
        raise ValueError("Dados da account ausentes")
    if not inbox.get("id") or not inbox.get("name"):
        raise ValueError("Dados do inbox ausentes")
    if not conversation.get("id"):
        raise ValueError("ID da conversa ausente")
    if not body.get("ACCESS_TOKEN"):
        raise ValueError("ACCESS_TOKEN ausente")

    sender = body.get("sender") or (conversation.get("meta") or {}).get("sender") or {}
    contact_id = body.get("contact_id") or sender.get("id")
    if not contact_id:
        raise ValueError("ID do contato ausente")

    base_url = os.environ.get("CHATWIT_BASE_URL", "https://chatwit.witdev.com.br")
    lead_url = _build_chatwit_conversation_url(
        base_url,
        account["id"],
        conversation.get("display_id") or conversation.get("id"),
    )

    root_attachments = body.get("attachments") or []
    arquivos = _extract_and_deduplicate_arquivos(conversation, root_attachments)

    channel_type = body.get("channel_type", "")
    channel = str(channel_type).replace("Channel::", "").lower() if channel_type else "whatsapp"

    sanitized = SanitizedChatwitPayload(
        usuario=SanitizedUsuario(
            account_id=str(account["id"]),
            account_name=account["name"],
            inbox_id=str(inbox["id"]),
            inbox_name=inbox["name"],
            channel=channel,
            chatwit_access_token=body["ACCESS_TOKEN"],
        ),
        origem_lead=SanitizedOrigemLead(
            source_id=str(contact_id),
            name=sender.get("name", "Lead sem nome"),
            phone_number=sender.get("phone_number", ""),
            thumbnail=sender.get("thumbnail", ""),
            lead_url=lead_url,
            arquivos=arquivos,
        ),
    )

    logger.debug(
        "payload_sanitized",
        account_id=sanitized.usuario.account_id,
        inbox_id=sanitized.usuario.inbox_id,
        contact_id=sanitized.origem_lead.source_id,
        arquivos_count=len(arquivos),
    )
    return sanitized
