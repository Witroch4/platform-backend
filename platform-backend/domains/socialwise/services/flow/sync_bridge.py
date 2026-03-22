"""Synchronous bridge for the first flow response returned to Chatwit."""

from __future__ import annotations

from typing import Any


class SyncBridge:
    def __init__(self, force_async: bool = False) -> None:
        self._sync_payload: dict[str, Any] | None = None
        self._sync_consumed = force_async
        self._pending_reaction: dict[str, str] | None = None
        self._context_message_id: str | None = None
        self._harvest_texts: list[str] = []
        self._harvest_emoji: str | None = None
        self._harvest_target_message_id: str | None = None
        self._harvest_interactive: dict[str, Any] | None = None

    def can_sync(self) -> bool:
        return not self._sync_consumed and self._sync_payload is None

    def set_sync_payload(self, payload: dict[str, Any]) -> None:
        if self._sync_consumed or self._sync_payload is not None:
            return
        self._sync_payload = payload

    def has_sync_payload(self) -> bool:
        return self._sync_payload is not None

    def consume_sync_payload(self) -> dict[str, Any] | None:
        payload = self._sync_payload
        self._sync_payload = None
        if payload is not None:
            self._sync_consumed = True
        return payload

    def is_bridge_closed(self) -> bool:
        return self._sync_consumed

    def close_sync_window(self) -> None:
        self._sync_consumed = True

    def set_pending_reaction(self, emoji: str, target_message_id: str) -> None:
        self._pending_reaction = {"emoji": emoji, "target_message_id": target_message_id}

    def consume_pending_reaction(self) -> dict[str, str] | None:
        reaction = self._pending_reaction
        self._pending_reaction = None
        return reaction

    def has_pending_reaction(self) -> bool:
        return self._pending_reaction is not None

    def set_context_message_id(self, message_id: str) -> None:
        self._context_message_id = message_id

    def add_harvested_text(self, text: str) -> None:
        if text:
            self._harvest_texts.append(text)

    def set_harvested_emoji(self, emoji: str, target_message_id: str) -> None:
        self._harvest_emoji = emoji
        self._harvest_target_message_id = target_message_id

    def set_harvested_interactive(self, payload: dict[str, Any]) -> None:
        self._harvest_interactive = payload

    def has_harvested_content(self) -> bool:
        return bool(self._harvest_texts or self._harvest_emoji or self._harvest_interactive)

    def build_combined_payload(self, channel: str) -> dict[str, Any] | None:
        if not self.has_harvested_content() and not self._pending_reaction:
            return None

        emoji = self._harvest_emoji or (self._pending_reaction or {}).get("emoji")
        target_message_id = (
            self._harvest_target_message_id
            or (self._pending_reaction or {}).get("target_message_id")
            or self._context_message_id
        )
        combined_text = "\n\n".join(part for part in self._harvest_texts if part)
        if not emoji and not combined_text and not self._harvest_interactive:
            return None

        payload: dict[str, Any] = {"action_type": "button_reaction"}
        if emoji:
            payload["emoji"] = emoji
        if combined_text:
            payload["text"] = combined_text

        channel_key = "facebook" if channel == "facebook" else "instagram" if channel == "instagram" else "whatsapp"
        channel_payload: dict[str, Any] = {}
        if target_message_id:
            channel_payload["message_id"] = target_message_id
        if emoji:
            channel_payload["reaction_emoji"] = emoji
        if combined_text:
            channel_payload["response_text"] = combined_text
        if channel_payload:
            payload[channel_key] = channel_payload

        if self._harvest_interactive:
            payload["mapped"] = {
                channel_key: {
                    "type": "interactive",
                    "interactive": self._harvest_interactive,
                }
            }
        return payload
