"""Idempotency helpers for Socialwise cost events."""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any, Mapping

from redis.asyncio import Redis
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.db.models.cost_event import CostEvent
from platform_core.config import settings


@dataclass(slots=True, frozen=True)
class IdempotencyResult:
    is_duplicate: bool
    existing_event_id: str | None = None
    reason: str | None = None


class IdempotencyService:
    """Multi-strategy duplicate protection for cost events."""

    CACHE_TTL_SECONDS = 24 * 60 * 60
    TEMPORAL_WINDOW = timedelta(minutes=5)

    def __init__(self, session: AsyncSession, redis_client: Redis | None = None):
        self.session = session
        self.redis = redis_client or Redis.from_url(str(settings.redis_url), decode_responses=True)

    @staticmethod
    def _cache_key(cache_type: str, value: str) -> str:
        return f"cost:idempotency:{cache_type}:{value}"

    def _generate_fingerprint(self, event_data: Mapping[str, Any]) -> str:
        payload = {
            "provider": event_data["provider"],
            "product": event_data["product"],
            "unit": event_data["unit"],
            "units": str(event_data["units"]),
            "inbox_id": event_data.get("inbox_id"),
            "user_id": event_data.get("user_id"),
            "session_id": event_data.get("session_id"),
            "rounded_timestamp": int(event_data["ts"].timestamp() // 60 * 60),
        }
        encoded = json.dumps(payload, sort_keys=True, default=str)
        return sha256(encoded.encode("utf-8")).hexdigest()

    async def check_idempotency(self, event_data: Mapping[str, Any]) -> IdempotencyResult:
        external_id = event_data.get("external_id")
        if external_id:
            by_external_id = await self._check_by_external_id(
                external_id=external_id,
                provider=event_data["provider"],
                product=event_data["product"],
            )
            if by_external_id.is_duplicate:
                return by_external_id

        fingerprint = self._generate_fingerprint(event_data)
        by_fingerprint = await self._check_by_fingerprint(fingerprint)
        if by_fingerprint.is_duplicate:
            return by_fingerprint

        return await self._check_temporal_duplicates(event_data)

    async def _check_by_external_id(self, external_id: str, provider: str, product: str) -> IdempotencyResult:
        cache_key = self._cache_key("external", f"{provider}:{product}:{external_id}")
        cached = await self.redis.get(cache_key)
        if cached:
            return IdempotencyResult(True, cached, "external_id")

        stmt = (
            select(CostEvent.id)
            .where(
                CostEvent.external_id == external_id,
                CostEvent.provider == provider,
                CostEvent.product == product,
            )
            .limit(1)
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing:
            await self.redis.setex(cache_key, self.CACHE_TTL_SECONDS, existing)
            return IdempotencyResult(True, existing, "external_id")
        return IdempotencyResult(False)

    async def _check_by_fingerprint(self, fingerprint: str) -> IdempotencyResult:
        cache_key = self._cache_key("fingerprint", fingerprint)
        cached = await self.redis.get(cache_key)
        if cached:
            return IdempotencyResult(True, cached, "fingerprint")
        return IdempotencyResult(False)

    async def _check_temporal_duplicates(self, event_data: Mapping[str, Any]) -> IdempotencyResult:
        event_time = event_data["ts"]
        if event_time.tzinfo is None:
            event_time = event_time.replace(tzinfo=timezone.utc)

        window_start = event_time - self.TEMPORAL_WINDOW
        window_end = event_time + self.TEMPORAL_WINDOW

        filters = [
            CostEvent.provider == event_data["provider"],
            CostEvent.product == event_data["product"],
            CostEvent.unit == event_data["unit"],
            CostEvent.units == event_data["units"],
            CostEvent.ts >= window_start,
            CostEvent.ts <= window_end,
        ]
        if event_data.get("inbox_id"):
            filters.append(CostEvent.inbox_id == event_data["inbox_id"])
        if event_data.get("user_id"):
            filters.append(CostEvent.user_id == event_data["user_id"])
        if event_data.get("session_id"):
            filters.append(CostEvent.session_id == event_data["session_id"])

        stmt = select(CostEvent.id).where(and_(*filters)).limit(1)
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing:
            return IdempotencyResult(True, existing, "temporal_duplicate")
        return IdempotencyResult(False)

    async def register_processed_event(self, event_data: Mapping[str, Any], event_id: str) -> None:
        operations: list[tuple[str, str]] = []

        external_id = event_data.get("external_id")
        if external_id:
            operations.append(
                (
                    self._cache_key(
                        "external",
                        f"{event_data['provider']}:{event_data['product']}:{external_id}",
                    ),
                    event_id,
                )
            )

        fingerprint = self._generate_fingerprint(event_data)
        operations.append((self._cache_key("fingerprint", fingerprint), event_id))

        for key, value in operations:
            await self.redis.setex(key, self.CACHE_TTL_SECONDS, value)

    async def increment_duplicates_blocked(self) -> None:
        await self.redis.incr("cost:idempotency:duplicates_blocked")

    async def cleanup_expired_cache(self) -> dict[str, str]:
        """Redis TTL already cleans these keys for us."""

        return {"strategy": "redis_ttl", "status": "noop"}
