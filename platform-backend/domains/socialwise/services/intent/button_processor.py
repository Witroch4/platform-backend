"""Button detection helpers for the SocialWise webhook pipeline."""

from __future__ import annotations

from domains.socialwise.services.intent.types import ButtonDetectionResult


def detect_button_click(payload: dict | None, channel_type: str) -> ButtonDetectionResult:
    payload = payload or {}
    context = payload.get("context") or {}
    message = context.get("message") or {}
    content_attributes = message.get("content_attributes") or {}
    lowered = (channel_type or "").lower()

    if "whatsapp" in lowered:
        button_reply = content_attributes.get("button_reply") or {}
        interaction_type = (
            content_attributes.get("interaction_type")
            or context.get("interaction_type")
        )
        if button_reply.get("id") and interaction_type == "button_reply":
            return ButtonDetectionResult(
                is_button_click=True,
                button_id=str(button_reply.get("id")),
                button_title=button_reply.get("title") or payload.get("message"),
                detection_source="whatsapp_button_reply",
            )

    if "instagram" in lowered or "facebook" in lowered or "messenger" in lowered:
        interaction_type = context.get("interaction_type")
        if interaction_type == "postback":
            button_id = (
                content_attributes.get("postback_payload")
                or context.get("postback_payload")
            )
            if button_id:
                return ButtonDetectionResult(
                    is_button_click=True,
                    button_id=str(button_id),
                    button_title=payload.get("message"),
                    detection_source="meta_postback",
                )
        if interaction_type == "quick_reply":
            button_id = (
                content_attributes.get("quick_reply_payload")
                or context.get("quick_reply_payload")
            )
            if button_id:
                return ButtonDetectionResult(
                    is_button_click=True,
                    button_id=str(button_id),
                    button_title=payload.get("message"),
                    detection_source="meta_quick_reply",
                )

    fallback_id = (
        context.get("button_id")
        or context.get("postback_payload")
        or context.get("quick_reply_payload")
        or ((content_attributes.get("interactive_payload") or {}).get("button_reply") or {}).get("id")
    )
    if fallback_id:
        return ButtonDetectionResult(
            is_button_click=True,
            button_id=str(fallback_id),
            button_title=context.get("button_title") or payload.get("message"),
            detection_source="fallback_detection",
        )

    return ButtonDetectionResult(is_button_click=False)


def is_flow_button(button_id: str | None) -> bool:
    return bool(button_id and str(button_id).startswith("flow_"))


def is_handoff_button(button_id: str | None) -> bool:
    return str(button_id or "").strip().lower() == "@falar_atendente"


def button_to_user_text(button_id: str | None, fallback_text: str | None = None) -> str | None:
    if fallback_text and str(fallback_text).strip():
        return str(fallback_text).strip()

    raw = str(button_id or "").strip()
    if not raw:
        return None
    if raw.lower().startswith("intent:"):
        return raw.split(":", 1)[1].strip()
    if raw.startswith("@"):
        return raw[1:].strip()
    return raw
