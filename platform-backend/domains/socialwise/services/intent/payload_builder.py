"""Channel payload builders for SocialWise intent responses."""

from __future__ import annotations

from typing import Any

from domains.socialwise.services.intent.types import ChannelType, RouterButton

CHANNEL_LIMITS: dict[ChannelType, dict[str, int]] = {
    "whatsapp": {
        "body": 1024,
        "button_title": 20,
        "payload": 256,
        "max_buttons": 3,
    },
    "instagram": {
        "body": 1000,
        "button_title": 20,
        "payload": 1000,
        "max_buttons": 13,
    },
    "facebook": {
        "body": 1000,
        "button_title": 20,
        "payload": 1000,
        "max_buttons": 13,
    },
}


def normalize_channel_type(channel_type: str) -> ChannelType:
    lowered = (channel_type or "").lower()
    if "instagram" in lowered:
        return "instagram"
    if "facebook" in lowered or "messenger" in lowered:
        return "facebook"
    return "whatsapp"


def _clamp(text: str, limit: int) -> str:
    clean = " ".join((text or "").split())
    return clean[:limit].strip() or clean[:limit]


def _clamp_buttons(channel: ChannelType, buttons: list[RouterButton]) -> list[RouterButton]:
    limits = CHANNEL_LIMITS[channel]
    result: list[RouterButton] = []
    for button in buttons[: limits["max_buttons"]]:
        title = _clamp(button.title, limits["button_title"])
        payload = _clamp(button.payload, limits["payload"])
        if not title or not payload:
            continue
        result.append(RouterButton(title=title, payload=payload))
    return result


def build_channel_response(
    channel_type: str,
    text: str,
    buttons: list[RouterButton] | None = None,
) -> dict[str, Any]:
    channel = normalize_channel_type(channel_type)
    body = _clamp(text, CHANNEL_LIMITS[channel]["body"])
    final_buttons = _clamp_buttons(channel, buttons or [])

    if not final_buttons:
        return {"text": body}

    if channel == "whatsapp":
        return {
            "whatsapp": {
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": body},
                    "action": {
                        "buttons": [
                            {
                                "type": "reply",
                                "reply": {"id": button.payload, "title": button.title},
                            }
                            for button in final_buttons
                        ],
                    },
                },
            },
        }

    payload = {
        "text": body,
        "quick_replies": [
            {
                "content_type": "text",
                "title": button.title,
                "payload": button.payload,
            }
            for button in final_buttons
        ],
    }
    return {channel: payload}


def build_default_legal_topics(channel_type: str) -> dict[str, Any]:
    return build_channel_response(
        channel_type,
        "Posso ajudar com qual área do direito?",
        [
            RouterButton(title="Direito Civil", payload="@direito_civil"),
            RouterButton(title="Direito Trabalhista", payload="@direito_trabalhista"),
            RouterButton(title="Outros assuntos", payload="@outros_assuntos"),
        ],
    )


def build_fallback_response(channel_type: str) -> dict[str, Any]:
    return build_channel_response(
        channel_type,
        "Sistema indisponível no momento. Tente novamente ou escolha uma opção:",
        [
            RouterButton(title="Falar com atendente", payload="@falar_atendente"),
            RouterButton(title="Recomeçar", payload="@recomecar"),
            RouterButton(title="Sair", payload="@sair"),
        ],
    )
