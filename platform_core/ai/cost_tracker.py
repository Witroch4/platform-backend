"""Cost tracker — records LLM token usage to CostEvent table.

Port of: lib/cost/cost-worker.ts (event emission part)

When an OAB agent completes a page/step, it calls ``track_cost()`` which
persists a CostEvent row via the Socialwise DB session.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from platform_core.logging.config import get_logger

logger = get_logger(__name__)


async def track_cost(
    session,
    *,
    lead_id: str,
    stage: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_ms: int,
    was_fallback: bool = False,
    trace_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """Persist a CostEvent row for an LLM call.

    Returns the event ID or None on failure.
    """
    try:
        from domains.socialwise.db.models.cost_event import CostEvent

        import cuid2

        event_id = cuid2.cuid_wrapper()
        now = datetime.now(timezone.utc)
        event = CostEvent(
            id=event_id,
            type=f"oab_{stage}",
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            duration_ms=duration_ms,
            status="PROCESSED",
            metadata_json={
                "leadId": lead_id,
                "stage": stage,
                "wasFallback": was_fallback,
                "traceId": trace_id,
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
            stage=stage,
            provider=provider,
            model=model,
            tokens=input_tokens + output_tokens,
        )
        return event_id
    except Exception:
        logger.exception("cost_event_tracking_failed", stage=stage, lead_id=lead_id)
        return None


async def track_cost_batch(
    session,
    events: list[dict[str, Any]],
) -> list[str]:
    """Persist multiple CostEvents in a single flush (batch).

    Each dict in ``events`` should have: lead_id, stage, provider, model,
    input_tokens, output_tokens, duration_ms, was_fallback, trace_id.
    """
    ids: list[str] = []
    for ev in events:
        eid = await track_cost(session, **ev)
        if eid:
            ids.append(eid)
    return ids
