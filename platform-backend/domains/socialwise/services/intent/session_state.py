"""Redis-backed session state for router context and anti-loop support."""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass

from redis.asyncio import Redis

from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

DEFAULT_HISTORY_TTL_SECONDS = 60 * 60 * 24
DEFAULT_INTERACTIVE_CONTEXT_TTL_SECONDS = 60 * 60
MAX_HISTORY_MESSAGES = 20

_history_fallback: dict[str, list["ConversationMessage"]] = {}
_interactive_fallback: dict[str, "InteractiveMessageContext"] = {}


@dataclass(slots=True)
class SessionTtlConfig:
    session_ttl_seconds: int | None = None
    session_ttl_dev_seconds: int | None = None


@dataclass(slots=True)
class ConversationMessage:
    role: str
    content: str
    timestamp: int


@dataclass(slots=True)
class InteractiveButtonContext:
    title: str
    payload: str


@dataclass(slots=True)
class InteractiveMessageContext:
    body_text: str
    intent_slug: str | None = None
    timestamp: int = 0
    buttons: list[InteractiveButtonContext] | None = None


def _redis() -> Redis:
    return Redis.from_url(str(settings.redis_url), decode_responses=True)


def _history_key(session_id: str) -> str:
    return f"sessionHistory:{session_id}"


def _interactive_key(session_id: str) -> str:
    return f"session:{session_id}:interactiveContext"


async def get_session_history(
    session_id: str,
    *,
    max_messages: int = MAX_HISTORY_MESSAGES,
) -> list[ConversationMessage]:
    try:
        redis = _redis()
        try:
            raw = await redis.get(_history_key(session_id))
        finally:
            await redis.aclose()
        if raw:
            parsed = json.loads(raw)
            return [
                ConversationMessage(
                    role=str(item.get("role", "user")),
                    content=str(item.get("content", "")),
                    timestamp=int(item.get("timestamp", 0)),
                )
                for item in parsed[-max_messages:]
            ]
    except Exception as exc:
        logger.warning("intent_session_history_read_error", session_id=session_id, error=str(exc))

    return _history_fallback.get(_history_key(session_id), [])[-max_messages:]


async def append_to_history(
    session_id: str,
    message: ConversationMessage,
    *,
    ttl_config: SessionTtlConfig | None = None,
) -> None:
    history = await get_session_history(session_id, max_messages=MAX_HISTORY_MESSAGES * 2)
    history.append(message)
    history = history[-MAX_HISTORY_MESSAGES:]
    ttl = ttl_config.session_ttl_seconds if ttl_config and ttl_config.session_ttl_seconds else DEFAULT_HISTORY_TTL_SECONDS

    try:
        redis = _redis()
        try:
            await redis.setex(
                _history_key(session_id),
                ttl,
                json.dumps([asdict(item) for item in history]),
            )
        finally:
            await redis.aclose()
    except Exception as exc:
        logger.warning("intent_session_history_write_error", session_id=session_id, error=str(exc))

    _history_fallback[_history_key(session_id)] = history


async def store_interactive_message_context(
    session_id: str,
    context: InteractiveMessageContext,
    *,
    ttl_config: SessionTtlConfig | None = None,
) -> None:
    payload = InteractiveMessageContext(
        body_text=context.body_text,
        intent_slug=context.intent_slug,
        timestamp=context.timestamp or int(time.time() * 1000),
        buttons=context.buttons or [],
    )
    ttl = ttl_config.session_ttl_seconds if ttl_config and ttl_config.session_ttl_seconds else DEFAULT_INTERACTIVE_CONTEXT_TTL_SECONDS

    try:
        redis = _redis()
        try:
            await redis.setex(_interactive_key(session_id), ttl, json.dumps(asdict(payload)))
        finally:
            await redis.aclose()
    except Exception as exc:
        logger.warning("intent_interactive_context_write_error", session_id=session_id, error=str(exc))

    _interactive_fallback[_interactive_key(session_id)] = payload


async def get_interactive_message_context(session_id: str) -> InteractiveMessageContext | None:
    try:
        redis = _redis()
        try:
            raw = await redis.get(_interactive_key(session_id))
        finally:
            await redis.aclose()
        if raw:
            parsed = json.loads(raw)
            return InteractiveMessageContext(
                body_text=str(parsed.get("body_text", "")),
                intent_slug=parsed.get("intent_slug"),
                timestamp=int(parsed.get("timestamp", 0)),
                buttons=[
                    InteractiveButtonContext(
                        title=str(button.get("title", "")),
                        payload=str(button.get("payload", "")),
                    )
                    for button in parsed.get("buttons") or []
                ],
            )
    except Exception as exc:
        logger.warning("intent_interactive_context_read_error", session_id=session_id, error=str(exc))

    return _interactive_fallback.get(_interactive_key(session_id))


async def clear_session_history(session_id: str) -> None:
    try:
        redis = _redis()
        try:
            await redis.delete(_history_key(session_id))
        finally:
            await redis.aclose()
    except Exception as exc:
        logger.warning("intent_session_history_clear_error", session_id=session_id, error=str(exc))

    _history_fallback.pop(_history_key(session_id), None)


async def clear_interactive_message_context(session_id: str) -> None:
    try:
        redis = _redis()
        try:
            await redis.delete(_interactive_key(session_id))
        finally:
            await redis.aclose()
    except Exception as exc:
        logger.warning("intent_interactive_context_clear_error", session_id=session_id, error=str(exc))

    _interactive_fallback.pop(_interactive_key(session_id), None)
