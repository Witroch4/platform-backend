"""Resolve selected intents into Flow execution or mapped template responses."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.flow import Flow
from domains.socialwise.db.models.interactive_content import (
    ActionCtaUrl,
    ActionReplyButton,
    Body,
    Footer,
    Header,
    InteractiveContent,
)
from domains.socialwise.db.models.mapeamento_intencao import MapeamentoIntencao
from domains.socialwise.db.models.template import Template
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.flow.delivery_service import DeliveryContext
from domains.socialwise.services.flow.mtf_loader import load_mtf_variables_for_inbox
from domains.socialwise.services.flow.variable_resolver import VariableResolver
from domains.socialwise.services.intent.payload_builder import normalize_channel_type


@dataclass(slots=True)
class ResolvedIntentMapping:
    flow_id: str | None = None
    response: dict[str, Any] | None = None
    intent_slug: str | None = None


def _slugify(value: str) -> str:
    lowered = (value or "").strip().lower()
    normalized = re.sub(r"[^\w\s-]", "", lowered, flags=re.UNICODE)
    return re.sub(r"[\s_]+", "-", normalized).strip("-")


def _normalize_intent_raw(raw: str) -> tuple[str, str]:
    intent = (raw or "").strip()
    if intent.startswith("intent:"):
        intent = intent[len("intent:") :].strip()
    if intent.startswith("@"):
        intent = intent[1:].strip()
    plain = " ".join(intent.split())
    return plain, _slugify(plain)


def _extract_buttons(interactive: dict[str, Any]) -> list[dict[str, str]]:
    action = interactive.get("action") or {}
    buttons = action.get("buttons") or []
    parsed: list[dict[str, str]] = []
    for button in buttons:
        if button.get("type") == "reply":
            reply = button.get("reply") or {}
            parsed.append(
                {
                    "type": "reply",
                    "title": str(reply.get("title", "")),
                    "payload": str(reply.get("id", "")),
                }
            )
    if interactive.get("type") == "cta_url":
        params = ((interactive.get("action") or {}).get("parameters") or {})
        parsed.append(
            {
                "type": "url",
                "title": str(params.get("display_text", "")),
                "payload": str(params.get("url", "")),
            }
        )
    return [button for button in parsed if button["title"] and button["payload"]]


def _build_whatsapp_interactive(
    resolver: VariableResolver,
    template: Template,
) -> dict[str, Any] | None:
    content = template.interactive_content
    if not content or not content.body:
        return None

    body_text = resolver.resolve(content.body.text)
    footer_text = resolver.resolve(content.footer.text) if content.footer else ""
    header = None
    if content.header:
        header_content = resolver.resolve(content.header.content)
        header_type = (content.header.type or "").lower()
        if header_type == "image":
            header = {"type": "image", "image": {"link": header_content}}
        elif header_type == "video":
            header = {"type": "video", "video": {"link": header_content}}
        elif header_type == "document":
            header = {"type": "document", "document": {"link": header_content}}
        elif header_content:
            header = {"type": "text", "text": header_content}

    raw_buttons = list(content.action_reply_button.buttons) if content.action_reply_button else []
    reply_buttons: list[dict[str, Any]] = []
    url_buttons: list[dict[str, str]] = []
    for button in raw_buttons:
        title = resolver.resolve(str(button.get("title") or button.get("text") or ""))
        payload = str(button.get("payload") or button.get("id") or title)
        url = resolver.resolve(str(button.get("url") or ""))
        button_type = str(button.get("type") or "").lower()
        if url or button_type == "url":
            url_buttons.append({"title": title, "url": url})
        elif title:
            reply_buttons.append(
                {
                    "type": "reply",
                    "reply": {
                        "id": payload,
                        "title": title[:20],
                    },
                }
            )

    if content.action_cta_url and content.action_cta_url.url:
        url_buttons.insert(
            0,
            {
                "title": resolver.resolve(content.action_cta_url.display_text),
                "url": resolver.resolve(content.action_cta_url.url),
            },
        )

    interactive: dict[str, Any]
    if url_buttons and not reply_buttons:
        first = url_buttons[0]
        interactive = {
            "type": "cta_url",
            "body": {"text": body_text},
            "action": {
                "name": "cta_url",
                "parameters": {
                    "display_text": first["title"][:20],
                    "url": first["url"],
                },
            },
        }
    else:
        interactive = {
            "type": "button",
            "body": {"text": body_text},
            "action": {"buttons": reply_buttons[:3]},
        }

    if header:
        interactive["header"] = header
    if footer_text:
        interactive["footer"] = {"text": footer_text}
    return interactive


def _convert_to_meta_template(
    interactive: dict[str, Any],
    *,
    channel_type: str,
) -> dict[str, Any]:
    channel = normalize_channel_type(channel_type)
    if channel == "whatsapp":
        return {"whatsapp": {"type": "interactive", "interactive": interactive}}

    body_text = str((interactive.get("body") or {}).get("text") or "")
    footer_text = str((interactive.get("footer") or {}).get("text") or "")
    full_text = "\n\n".join(part for part in [body_text, footer_text] if part)
    header = interactive.get("header") or {}
    image_url = (
        ((header.get("image") or {}).get("link"))
        or ((header.get("video") or {}).get("link"))
        or ((header.get("document") or {}).get("link"))
    )
    buttons = _extract_buttons(interactive)
    channel_key = "facebook" if channel == "facebook" else "instagram"

    if image_url and len(buttons) > 2:
        card: dict[str, Any] = {
            "title": body_text[:80],
            "buttons": [],
        }
        if footer_text:
            card["subtitle"] = footer_text[:80]
        card["image_url"] = image_url
        for button in buttons[:3]:
            if button["type"] == "url":
                card["buttons"].append(
                    {
                        "type": "web_url",
                        "title": button["title"][:20],
                        "url": button["payload"],
                    }
                )
            else:
                card["buttons"].append(
                    {
                        "type": "postback",
                        "title": button["title"][:20],
                        "payload": button["payload"],
                    }
                )
        return {
            channel_key: {
                "message_format": "GENERIC_TEMPLATE",
                "template_type": "generic",
                "elements": [card],
            }
        }

    if buttons and len(buttons) <= 3:
        converted_buttons = []
        for button in buttons[:3]:
            if button["type"] == "url":
                converted_buttons.append(
                    {
                        "type": "web_url",
                        "title": button["title"][:20],
                        "url": button["payload"],
                    }
                )
            else:
                converted_buttons.append(
                    {
                        "type": "postback",
                        "title": button["title"][:20],
                        "payload": button["payload"],
                    }
                )
        return {
            channel_key: {
                "message_format": "BUTTON_TEMPLATE",
                "template_type": "button",
                "text": full_text[:640],
                "buttons": converted_buttons,
            }
        }

    return {
        channel_key: {
            "message_format": "QUICK_REPLIES",
            "text": full_text[:2000],
            "quick_replies": [
                {
                    "content_type": "text",
                    "title": button["title"][:20],
                    "payload": button["payload"],
                }
                for button in buttons[:11]
                if button["type"] != "url"
            ],
        }
    }


async def resolve_intent_mapping(
    intent_raw: str,
    *,
    prisma_inbox_id: str,
    delivery_context: DeliveryContext,
) -> ResolvedIntentMapping | None:
    plain, slug = _normalize_intent_raw(intent_raw)
    if not plain or not prisma_inbox_id:
        return None

    async with session_ctx() as session:
        stmt = (
            select(MapeamentoIntencao)
            .where(MapeamentoIntencao.inbox_id == prisma_inbox_id)
            .options(
                selectinload(MapeamentoIntencao.flow),
                selectinload(MapeamentoIntencao.template)
                .selectinload(Template.interactive_content)
                .selectinload(InteractiveContent.body),
                selectinload(MapeamentoIntencao.template)
                .selectinload(Template.interactive_content)
                .selectinload(InteractiveContent.header),
                selectinload(MapeamentoIntencao.template)
                .selectinload(Template.interactive_content)
                .selectinload(InteractiveContent.footer),
                selectinload(MapeamentoIntencao.template)
                .selectinload(Template.interactive_content)
                .selectinload(InteractiveContent.action_reply_button),
                selectinload(MapeamentoIntencao.template)
                .selectinload(Template.interactive_content)
                .selectinload(InteractiveContent.action_cta_url),
            )
        )
        rows = (await session.execute(stmt)).scalars().all()

    mapping = next(
        (
            row
            for row in rows
            if row.intent_name == plain or row.intent_name == intent_raw or _slugify(row.intent_name) == slug
        ),
        None,
    )
    if not mapping:
        return None

    if mapping.flow_id and mapping.flow and mapping.flow.is_active:
        return ResolvedIntentMapping(flow_id=mapping.flow_id, intent_slug=slug)

    template = mapping.template
    if not template:
        return None

    session_vars: dict[str, Any] = {"nome_lead": delivery_context.contact_name or ""}
    if delivery_context.prisma_inbox_id:
        session_vars.update(await load_mtf_variables_for_inbox(delivery_context.prisma_inbox_id))
    if mapping.custom_variables:
        session_vars.update(mapping.custom_variables)
    resolver = VariableResolver(delivery_context, session_vars)

    if template.type == "AUTOMATION_REPLY" and template.simple_reply_text:
        return ResolvedIntentMapping(
            response={"text": resolver.resolve(template.simple_reply_text)},
            intent_slug=slug,
        )

    if template.type == "INTERACTIVE_MESSAGE":
        interactive = _build_whatsapp_interactive(resolver, template)
        if interactive:
            return ResolvedIntentMapping(
                response=_convert_to_meta_template(interactive, channel_type=delivery_context.channel_type),
                intent_slug=slug,
            )

    if template.type == "WHATSAPP_OFFICIAL":
        title = resolver.resolve(template.name)
        return ResolvedIntentMapping(
            response={
                "text": f"📋 {title}\n\nEm breve enviaremos mais detalhes sobre sua solicitação."
            },
            intent_slug=slug,
        )

    return None
