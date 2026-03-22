"""Operation control — cancel/progress via Redis for OAB eval operations.

Port of: lib/oab-eval/operation-control.ts + operation-types.ts

Provides:
- State persistence in Redis (24h TTL)
- Cancel request/check via Redis keys
- SSE notification via Redis pub/sub
- Async cancel monitor (polling-based)
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Literal

from redis.asyncio import Redis as AsyncRedis

from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# ── Types ─────────────────────────────────────────────────────────────────

LeadOperationStage = Literal["transcription", "mirror", "analysis"]

LeadOperationStatus = Literal[
    "idle",
    "queued",
    "processing",
    "completed",
    "failed",
    "cancel_requested",
    "canceled",
    "disconnected",
    "inconsistent",
]

TERMINAL_STATUSES: frozenset[LeadOperationStatus] = frozenset(
    {"completed", "failed", "canceled", "inconsistent"}
)

# ── Constants ─────────────────────────────────────────────────────────────

OPERATION_STATE_TTL = 24 * 60 * 60  # 24h
OPERATION_CANCEL_TTL = 6 * 60 * 60  # 6h


# ── Key builders ──────────────────────────────────────────────────────────


def build_job_id(stage: LeadOperationStage, lead_id: str) -> str:
    return f"oab:{stage}:{lead_id}"


def _state_key(job_id: str) -> str:
    return f"oab:operation:state:{job_id}"


def _cancel_key(job_id: str) -> str:
    return f"oab:operation:cancel:{job_id}"


# ── Redis helper ──────────────────────────────────────────────────────────


async def _get_redis() -> AsyncRedis:
    return AsyncRedis.from_url(str(settings.redis_url), decode_responses=True)


# ── State management ─────────────────────────────────────────────────────


async def set_operation_state(
    *,
    lead_id: str,
    job_id: str,
    stage: LeadOperationStage,
    status: LeadOperationStatus,
    progress: Any = None,
    message: str | None = None,
    error: str | None = None,
    meta: dict[str, Any] | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Persist operation state in Redis with 24h TTL."""
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    payload = {
        "leadId": lead_id,
        "jobId": job_id,
        "stage": stage,
        "status": status,
        "progress": progress,
        "message": message,
        "error": error,
        "meta": meta,
        "updatedAt": ts,
        "timestamp": ts,
    }
    redis = await _get_redis()
    try:
        await redis.set(_state_key(job_id), json.dumps(payload), ex=OPERATION_STATE_TTL)
    finally:
        await redis.aclose()
    return payload


async def get_operation_state(job_id: str) -> dict[str, Any] | None:
    """Read operation state from Redis."""
    redis = await _get_redis()
    try:
        raw = await redis.get(_state_key(job_id))
    finally:
        await redis.aclose()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        parsed["source"] = "redis"
        return parsed
    except (json.JSONDecodeError, TypeError):
        return None


async def clear_operation_state(job_id: str) -> None:
    redis = await _get_redis()
    try:
        await redis.delete(_state_key(job_id))
    finally:
        await redis.aclose()


# ── Cancel management ────────────────────────────────────────────────────


async def request_cancel(
    *,
    lead_id: str,
    stage: LeadOperationStage,
    job_id: str | None = None,
    message: str | None = None,
) -> str:
    """Request cancellation of an operation."""
    jid = job_id or build_job_id(stage, lead_id)
    ts = datetime.now(timezone.utc).isoformat()
    payload = {
        "leadId": lead_id,
        "jobId": jid,
        "stage": stage,
        "status": "cancel_requested",
        "message": message or "Cancelamento solicitado pelo usuário.",
        "timestamp": ts,
    }
    redis = await _get_redis()
    try:
        await redis.set(_cancel_key(jid), json.dumps(payload), ex=OPERATION_CANCEL_TTL)
    finally:
        await redis.aclose()

    await set_operation_state(
        lead_id=lead_id,
        job_id=jid,
        stage=stage,
        status="cancel_requested",
        message=payload["message"],
        timestamp=ts,
    )
    return jid


async def clear_cancel(job_id: str) -> None:
    redis = await _get_redis()
    try:
        await redis.delete(_cancel_key(job_id))
    finally:
        await redis.aclose()


async def is_cancel_requested(job_id: str) -> bool:
    redis = await _get_redis()
    try:
        return await redis.exists(_cancel_key(job_id)) == 1
    finally:
        await redis.aclose()


# ── SSE notification ──────────────────────────────────────────────────────


async def emit_operation_event(
    *,
    lead_id: str,
    job_id: str,
    stage: LeadOperationStage,
    status: LeadOperationStatus,
    progress: Any = None,
    message: str | None = None,
    error: str | None = None,
    meta: dict[str, Any] | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Persist state AND publish SSE event via Redis pub/sub."""
    ts = timestamp or datetime.now(timezone.utc).isoformat()

    await set_operation_state(
        lead_id=lead_id,
        job_id=job_id,
        stage=stage,
        status=status,
        progress=progress,
        message=message,
        error=error,
        meta=meta,
        timestamp=ts,
    )

    event = {
        "type": "leadOperation",
        "leadId": lead_id,
        "jobId": job_id,
        "stage": stage,
        "status": status,
        "progress": progress,
        "message": message,
        "error": error,
        "meta": meta,
        "timestamp": ts,
    }

    # Publish to SSE channel (Next.js SSE manager subscribes)
    try:
        redis = await _get_redis()
        try:
            channel = f"sse:lead:{lead_id}"
            await redis.publish(channel, json.dumps(event))
        finally:
            await redis.aclose()
    except Exception:
        logger.exception("sse_publish_failed", lead_id=lead_id, stage=stage)

    return event


# ── Cancel error ──────────────────────────────────────────────────────────


class LeadOperationCanceledError(Exception):
    """Raised when an operation is canceled by the user."""

    code = "LEAD_OPERATION_CANCELED"

    def __init__(
        self,
        lead_id: str,
        stage: LeadOperationStage,
        job_id: str,
        message: str = "Operação cancelada pelo usuário.",
    ):
        super().__init__(message)
        self.lead_id = lead_id
        self.stage = stage
        self.job_id = job_id


# ── Cancel monitor (polling-based) ───────────────────────────────────────


class CancelMonitor:
    """Polls Redis for cancel requests and sets an asyncio Event when found.

    Usage::

        monitor = CancelMonitor(lead_id="x", stage="transcription", job_id="oab:transcription:x")
        monitor.start()
        try:
            # do work, periodically check monitor.is_cancelled
            if monitor.is_cancelled:
                raise LeadOperationCanceledError(...)
        finally:
            await monitor.stop()
    """

    def __init__(
        self,
        lead_id: str,
        stage: LeadOperationStage,
        job_id: str,
        poll_interval_s: float = 1.0,
    ):
        self.lead_id = lead_id
        self.stage = stage
        self.job_id = job_id
        self.poll_interval_s = max(0.25, poll_interval_s)
        self._cancelled = asyncio.Event()
        self._task: asyncio.Task | None = None

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled.is_set()

    def check_cancelled(self) -> None:
        """Raise ``LeadOperationCanceledError`` if cancel was requested."""
        if self._cancelled.is_set():
            raise LeadOperationCanceledError(self.lead_id, self.stage, self.job_id)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _poll_loop(self) -> None:
        while True:
            try:
                if await is_cancel_requested(self.job_id):
                    self._cancelled.set()
                    return
            except Exception:
                logger.warning("cancel_poll_failed", job_id=self.job_id)
            await asyncio.sleep(self.poll_interval_s)
