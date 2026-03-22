"""Redis cache for SocialWise intent classification."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import asdict

from redis.asyncio import Redis

from domains.socialwise.services.intent.types import (
    CacheKeyConfig,
    ClassificationMetrics,
    ClassificationResult,
    IntentCandidate,
    RouterButton,
    WarmupButtonsResult,
)
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

_TTL_CLASSIFY_S = 10 * 60
_TTL_WARMUP_S = 12 * 60
_TTL_SHORT_TITLE_S = 30 * 24 * 60 * 60
_TTL_EMBEDDING_S = 24 * 60 * 60


def _get_secret() -> str:
    return settings.nextauth_secret or settings.secret_key or "dev-socialwise-cache-secret"


def _normalize_text(text: str) -> str:
    return " ".join((text or "").lower().strip().split())


def _hash_text(text: str) -> str:
    digest = hmac.new(_get_secret().encode("utf-8"), _normalize_text(text).encode("utf-8"), hashlib.sha256)
    return digest.hexdigest()[:16]


def _namespace(config: CacheKeyConfig) -> str:
    return ":".join(
        [
            "sw",
            settings.environment,
            f"acc{config.account_id}",
            f"inb{config.inbox_id}",
            f"agt{config.agent_id}",
            f"ms:{config.model}",
            f"pv{config.prompt_version}",
            f"chan:{config.channel_type}",
            f"ep:{'true' if config.embedipreview else 'false'}",
        ]
    )


def _classification_from_json(data: dict) -> ClassificationResult:
    candidates = [
        IntentCandidate(
            slug=item["slug"],
            name=item.get("name") or item["slug"],
            desc=item.get("desc") or "",
            score=item.get("score"),
            threshold=item.get("threshold"),
            aliases=list(item.get("aliases") or []),
            alias_matched=item.get("alias_matched"),
        )
        for item in data.get("candidates") or []
    ]
    metrics_raw = data.get("metrics") or {}
    metrics = ClassificationMetrics(
        route_total_ms=int(metrics_raw.get("route_total_ms") or 0),
        embedding_ms=metrics_raw.get("embedding_ms"),
        llm_warmup_ms=metrics_raw.get("llm_warmup_ms"),
    )
    return ClassificationResult(
        band=data["band"],
        score=float(data.get("score") or 0),
        candidates=candidates,
        strategy=data["strategy"],
        metrics=metrics,
    )


def _warmup_from_json(data: dict) -> WarmupButtonsResult:
    return WarmupButtonsResult(
        response_text=str(data.get("response_text") or ""),
        buttons=[
            RouterButton(title=str(item.get("title") or ""), payload=str(item.get("payload") or ""))
            for item in data.get("buttons") or []
        ],
    )


class SocialwiseIntentCache:
    """Thin Redis cache wrapper for classification and warmup generation."""

    def __init__(self, redis_client: Redis | None = None) -> None:
        self.redis = redis_client or Redis.from_url(str(settings.redis_url), decode_responses=True)

    async def get_classification_result(
        self,
        config: CacheKeyConfig,
        user_text: str,
    ) -> ClassificationResult | None:
        key = f"{_namespace(config)}:classify:{_hash_text(user_text)}"
        try:
            raw = await self.redis.get(key)
            if not raw:
                return None
            return _classification_from_json(json.loads(raw))
        except Exception as exc:
            logger.warning("intent_cache_classification_get_error", error=str(exc), key=key)
            return None

    async def set_classification_result(
        self,
        config: CacheKeyConfig,
        user_text: str,
        result: ClassificationResult,
    ) -> None:
        key = f"{_namespace(config)}:classify:{_hash_text(user_text)}"
        try:
            await self.redis.setex(key, _TTL_CLASSIFY_S, json.dumps(asdict(result)))
        except Exception as exc:
            logger.warning("intent_cache_classification_set_error", error=str(exc), key=key)

    async def get_warmup_result(
        self,
        config: CacheKeyConfig,
        user_text: str,
        candidates: list[IntentCandidate],
    ) -> WarmupButtonsResult | None:
        slugs = "|".join(sorted(candidate.slug for candidate in candidates))
        key = f"{_namespace(config)}:warmup:{_hash_text(f'{user_text}|{slugs}')}"
        try:
            raw = await self.redis.get(key)
            if not raw:
                return None
            return _warmup_from_json(json.loads(raw))
        except Exception as exc:
            logger.warning("intent_cache_warmup_get_error", error=str(exc), key=key)
            return None

    async def set_warmup_result(
        self,
        config: CacheKeyConfig,
        user_text: str,
        candidates: list[IntentCandidate],
        result: WarmupButtonsResult,
    ) -> None:
        slugs = "|".join(sorted(candidate.slug for candidate in candidates))
        key = f"{_namespace(config)}:warmup:{_hash_text(f'{user_text}|{slugs}')}"
        try:
            await self.redis.setex(key, _TTL_WARMUP_S, json.dumps(asdict(result)))
        except Exception as exc:
            logger.warning("intent_cache_warmup_set_error", error=str(exc), key=key)

    async def get_short_title(self, config: CacheKeyConfig, intent_slug: str) -> str | None:
        key = f"{_namespace(config)}:stitle:{intent_slug.lower()}"
        try:
            return await self.redis.get(key)
        except Exception as exc:
            logger.warning("intent_cache_short_title_get_error", error=str(exc), key=key)
            return None

    async def set_short_title(self, config: CacheKeyConfig, intent_slug: str, title: str) -> None:
        key = f"{_namespace(config)}:stitle:{intent_slug.lower()}"
        try:
            await self.redis.setex(key, _TTL_SHORT_TITLE_S, title)
        except Exception as exc:
            logger.warning("intent_cache_short_title_set_error", error=str(exc), key=key)

    async def get_embedding(self, config: CacheKeyConfig, text: str) -> list[float] | None:
        key = f"{_namespace(config)}:emb:{_hash_text(text)}"
        try:
            raw = await self.redis.get(key)
            if not raw:
                return None
            data = json.loads(raw)
            if isinstance(data, list):
                return [float(value) for value in data]
            return None
        except Exception as exc:
            logger.warning("intent_cache_embedding_get_error", error=str(exc), key=key)
            return None

    async def set_embedding(self, config: CacheKeyConfig, text: str, vector: list[float]) -> None:
        key = f"{_namespace(config)}:emb:{_hash_text(text)}"
        try:
            await self.redis.setex(key, _TTL_EMBEDDING_S, json.dumps(vector))
        except Exception as exc:
            logger.warning("intent_cache_embedding_set_error", error=str(exc), key=key)
