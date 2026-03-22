"""Cost tracker — records LLM token usage to ai_cost_events table.

Refactored to use platform_core.db.models.AiCostEvent (shared across domains)
instead of importing from domains.socialwise (cross-import violation).

When an agent completes a step, call ``track_cost()`` to persist a row.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from platform_core.logging.config import get_logger

logger = get_logger(__name__)


async def track_cost(
    session,
    *,
    domain: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_ms: int = 0,
    use_case: str | None = None,
    user_id: str | None = None,
    tenant_id: str | None = None,
    was_fallback: bool = False,
    trace_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """Persist an AiCostEvent row for an LLM call.

    Args:
        session: SQLAlchemy AsyncSession (any database).
        domain: Source domain ("socialwise", "jusmonitoria").
        provider: LLM provider name.
        model: Model identifier.
        input_tokens: Prompt tokens.
        output_tokens: Completion tokens.
        duration_ms: Call duration in milliseconds.
        use_case: Context label (e.g. "oab_transcription", "triage").
        user_id: Optional user identifier.
        tenant_id: Optional tenant identifier.
        was_fallback: Whether a fallback provider was used.
        trace_id: Optional trace/correlation ID.
        metadata: Extra metadata dict.

    Returns:
        The event UUID or None on failure.
    """
    try:
        from platform_core.db.models.ai_cost_event import AiCostEvent

        event_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        event = AiCostEvent(
            id=event_id,
            domain=domain,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            use_case=use_case,
            user_id=user_id,
            tenant_id=tenant_id,
            metadata_={
                "wasFallback": was_fallback,
                "traceId": trace_id,
                "durationMs": duration_ms,
                **(metadata or {}),
            },
            created_at=now,
            updated_at=now,
        )
        session.add(event)
        await session.flush()
        logger.info(
            "cost_event_tracked",
            event_id=event_id,
            domain=domain,
            provider=provider,
            model=model,
            tokens=input_tokens + output_tokens,
        )
        return event_id
    except Exception:
        logger.exception("cost_event_tracking_failed", domain=domain, use_case=use_case)
        return None


async def track_cost_batch(
    session,
    events: list[dict[str, Any]],
) -> list[str]:
    """Persist multiple AiCostEvents in a single flush.

    Each dict in ``events`` should contain the keyword arguments for
    ``track_cost()`` (domain, provider, model, input_tokens, output_tokens, etc.).
    """
    ids: list[str] = []
    for ev in events:
        eid = await track_cost(session, **ev)
        if eid:
            ids.append(eid)
    return ids
