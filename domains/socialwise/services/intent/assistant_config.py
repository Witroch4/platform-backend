"""Assistant configuration loading for the SocialWise intent pipeline."""

from __future__ import annotations

import time
from dataclasses import replace

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.ai_assistant import AiAssistant
from domains.socialwise.db.models.ai_assistant_inbox import AiAssistantInbox
from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.intent.types import AssistantConfig
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

_CACHE_TTL_S = 5 * 60
_assistant_cache: dict[str, tuple[float, AssistantConfig]] = {}


def detect_provider_from_model(model: str) -> str:
    lowered = (model or "").lower()
    if lowered.startswith("gemini"):
        return "GEMINI"
    if lowered.startswith("claude") or lowered.startswith("anthropic/"):
        return "CLAUDE"
    return "OPENAI"


def _cache_key(inbox_id: str, chatwit_account_id: str | None, assistant_id: str | None) -> str:
    return (
        f"inbox:{inbox_id}:account:{chatwit_account_id or 'default'}:"
        f"assistant:{assistant_id or 'auto'}"
    )


def _coalesce_override(inherit_from_agent: bool, inbox_value, assistant_value):
    if inherit_from_agent:
        return assistant_value
    return inbox_value if inbox_value is not None else assistant_value


def _to_config(assistant: AiAssistant, inbox: ChatwitInbox | None) -> AssistantConfig:
    inherit_from_agent = inbox.socialwise_inherit_from_agent if inbox else True
    if inherit_from_agent is None:
        inherit_from_agent = True

    return AssistantConfig(
        assistant_id=assistant.id,
        model=assistant.model,
        provider=assistant.provider or detect_provider_from_model(assistant.model),
        fallback_provider=assistant.fallback_provider,
        fallback_model=assistant.fallback_model,
        instructions=assistant.instructions or "",
        developer=assistant.instructions or "",
        embedipreview=assistant.embedipreview,
        reasoning_effort=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_reasoning_effort if inbox else None,
            assistant.reasoning_effort,
        ),
        verbosity=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_verbosity if inbox else None,
            assistant.verbosity,
        ),
        temperature=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_temperature if inbox else None,
            assistant.temperature,
        ),
        top_p=assistant.top_p,
        temp_schema=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_temp_schema if inbox else None,
            assistant.temp_schema,
        )
        or 0.1,
        temp_copy=assistant.temp_copy,
        max_output_tokens=assistant.max_output_tokens,
        warmup_deadline_ms=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_warmup_deadline_ms if inbox else None,
            assistant.warmup_deadline_ms,
        )
        or 15000,
        hard_deadline_ms=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_hard_deadline_ms if inbox else None,
            assistant.hard_deadline_ms,
        )
        or 15000,
        soft_deadline_ms=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_soft_deadline_ms if inbox else None,
            assistant.soft_deadline_ms,
        )
        or 18000,
        short_title_llm=bool(
            _coalesce_override(
                inherit_from_agent,
                inbox.socialwise_short_title_llm if inbox else None,
                assistant.short_title_llm,
            )
        ),
        tool_choice=_coalesce_override(
            inherit_from_agent,
            inbox.socialwise_tool_choice if inbox else None,
            assistant.tool_choice,
        ),
        propose_human_handoff=assistant.propose_human_handoff,
        disable_intent_suggestion=assistant.disable_intent_suggestion,
        inherit_from_agent=inherit_from_agent,
        session_ttl_seconds=assistant.session_ttl_seconds,
        session_ttl_dev_seconds=assistant.session_ttl_dev_seconds,
    )


async def _load_inbox(
    inbox_id: str,
    chatwit_account_id: str | None,
) -> ChatwitInbox | None:
    async with session_ctx() as session:
        stmt = (
            select(ChatwitInbox)
            .options(
                selectinload(ChatwitInbox.usuario_chatwit),
                selectinload(ChatwitInbox.ai_assistant_links).selectinload(AiAssistantInbox.assistant),
            )
            .where(ChatwitInbox.inbox_id == inbox_id)
        )
        if chatwit_account_id:
            stmt = stmt.join(ChatwitInbox.usuario_chatwit).where(
                UsuarioChatwit.chatwit_account_id == str(chatwit_account_id),
            )
        result = await session.execute(stmt)
        return result.scalars().first()


async def resolve_user_id_for_inbox(
    inbox_id: str,
    chatwit_account_id: str | None = None,
) -> str | None:
    inbox = await _load_inbox(inbox_id, chatwit_account_id)
    if not inbox or not inbox.usuario_chatwit:
        return None
    return inbox.usuario_chatwit.app_user_id


async def load_assistant_configuration(
    inbox_id: str,
    chatwit_account_id: str | None = None,
    assistant_id: str | None = None,
) -> AssistantConfig | None:
    cache_key = _cache_key(inbox_id, chatwit_account_id, assistant_id)
    cached = _assistant_cache.get(cache_key)
    now = time.monotonic()
    if cached and (now - cached[0]) < _CACHE_TTL_S:
        return replace(cached[1])

    inbox = await _load_inbox(inbox_id, chatwit_account_id)
    if not inbox:
        logger.warning("assistant_config_inbox_not_found", inbox_id=inbox_id)
        return None

    async with session_ctx() as session:
        assistant: AiAssistant | None = None

        if assistant_id:
            stmt = select(AiAssistant).where(
                AiAssistant.id == assistant_id,
                AiAssistant.is_active.is_(True),
            )
            assistant = (await session.execute(stmt)).scalars().first()
        else:
            active_links = [
                link
                for link in inbox.ai_assistant_links
                if link.is_active and link.assistant and link.assistant.is_active
            ]
            if active_links:
                active_links.sort(
                    key=lambda item: (
                        item.created_at.timestamp() if item.created_at else 0,
                        item.id,
                    ),
                    reverse=True,
                )
                assistant = active_links[0].assistant

            if assistant is None and inbox.usuario_chatwit and inbox.usuario_chatwit.app_user_id:
                stmt = (
                    select(AiAssistant)
                    .where(
                        AiAssistant.user_id == inbox.usuario_chatwit.app_user_id,
                        AiAssistant.is_active.is_(True),
                    )
                    .order_by(AiAssistant.updated_at.desc())
                )
                assistant = (await session.execute(stmt)).scalars().first()

    if assistant is None:
        logger.warning(
            "assistant_config_not_found",
            inbox_id=inbox_id,
            assistant_id=assistant_id,
        )
        return None

    config = _to_config(assistant, inbox)
    _assistant_cache[cache_key] = (now, config)

    logger.info(
        "assistant_config_loaded",
        inbox_id=inbox_id,
        assistant_id=config.assistant_id,
        model=config.model,
        inherit_from_agent=config.inherit_from_agent,
        warmup_deadline_ms=config.warmup_deadline_ms,
        hard_deadline_ms=config.hard_deadline_ms,
        soft_deadline_ms=config.soft_deadline_ms,
    )
    return replace(config)
