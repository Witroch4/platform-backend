"""Chatwit System Config — bot token + base URL from SystemConfig table.

Port of lib/chatwit/system-config.ts.

Sources (priority):
  1. SystemConfig (DB) — updated by Chatwit init or webhook
  2. ENV — CHATWIT_AGENT_BOT_TOKEN, CHATWIT_BASE_URL (fallback)

In-memory cache (5 min) to avoid hitting DB on every campaign.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import select

from domains.socialwise.db.models.system_config import SystemConfig
from domains.socialwise.db.session_compat import session_ctx
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

CACHE_TTL_S = 5 * 60  # 5 minutes


@dataclass(slots=True)
class ChatwitSystemConfigResult:
    bot_token: str
    base_url: str


_cached: ChatwitSystemConfigResult | None = None
_cached_at: float = 0.0


def invalidate_chatwit_system_config_cache() -> None:
    global _cached, _cached_at
    _cached = None
    _cached_at = 0.0


async def get_chatwit_system_config() -> ChatwitSystemConfigResult:
    """Return bot token and base URL for Chatwit."""
    global _cached, _cached_at

    if _cached and (time.monotonic() - _cached_at) < CACHE_TTL_S:
        return _cached

    try:
        async with session_ctx() as session:
            stmt = select(SystemConfig).where(
                SystemConfig.key.in_(["chatwit.agentBotToken", "chatwit.baseUrl"]),
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()

        token_row = next((r for r in rows if r.key == "chatwit.agentBotToken"), None)
        url_row = next((r for r in rows if r.key == "chatwit.baseUrl"), None)

        bot_token = ""
        if token_row and isinstance(token_row.value, dict):
            bot_token = token_row.value.get("token", "")
        if not bot_token:
            bot_token = getattr(settings, "chatwit_agent_bot_token", "") or ""

        base_url = ""
        if url_row and isinstance(url_row.value, dict):
            base_url = url_row.value.get("url", "")
        if not base_url:
            base_url = getattr(settings, "chatwit_base_url", "") or ""

        _cached = ChatwitSystemConfigResult(bot_token=bot_token, base_url=base_url)
        _cached_at = time.monotonic()
        return _cached

    except Exception as exc:
        logger.warning("chatwit_system_config_read_error", error=str(exc))
        return ChatwitSystemConfigResult(
            bot_token=getattr(settings, "chatwit_agent_bot_token", "") or "",
            base_url=getattr(settings, "chatwit_base_url", "") or "",
        )


async def save_chatwit_system_config(*, bot_token: str, base_url: str) -> None:
    """Persist Chatwit agent bot token and base URL in SystemConfig."""
    invalidate_chatwit_system_config_cache()
    async with session_ctx() as session:
        existing_stmt = select(SystemConfig).where(
            SystemConfig.key.in_(["chatwit.agentBotToken", "chatwit.baseUrl"]),
        )
        rows = (await session.execute(existing_stmt)).scalars().all()
        token_row = next((row for row in rows if row.key == "chatwit.agentBotToken"), None)
        url_row = next((row for row in rows if row.key == "chatwit.baseUrl"), None)

        if token_row:
            token_row.value = {"token": bot_token}
        else:
            session.add(
                SystemConfig(
                    key="chatwit.agentBotToken",
                    value={"token": bot_token},
                    category="chatwit",
                    description="Agent Bot token cached from Chatwit init/webhook",
                )
            )

        if url_row:
            url_row.value = {"url": base_url}
        else:
            session.add(
                SystemConfig(
                    key="chatwit.baseUrl",
                    value={"url": base_url},
                    category="chatwit",
                    description="Chatwit base URL cached from init/webhook",
                )
            )
        await session.commit()
