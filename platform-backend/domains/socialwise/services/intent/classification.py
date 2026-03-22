"""Embedding-first intent classification for SocialWise Flow."""

from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass
from time import perf_counter

from redis.asyncio import Redis
from sqlalchemy import text

from domains.socialwise.db.session_compat import session_ctx
from domains.socialwise.services.intent.cache import SocialwiseIntentCache
from domains.socialwise.services.intent.types import (
    AssistantConfig,
    CacheKeyConfig,
    ClassificationMetrics,
    ClassificationResult,
    IntentCandidate,
)
from platform_core.ai.litellm_config import call_embedding, resolve_litellm_model
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

LEGAL_KEYWORDS = [
    "mandado de segurança",
    "habeas corpus",
    "habeas data",
    "recurso",
    "multa de trânsito",
    "detran",
    "indenização",
    "ação judicial",
    "processo",
    "petição",
    "liminar",
    "direito",
    "advogado",
    "justiça",
    "tribunal",
    "juiz",
    "lei",
    "constituição",
    "estatuto",
]


@dataclass(slots=True)
class IntentRow:
    id: str
    name: str
    slug: str
    description: str | None
    similarity_threshold: float | None
    embedding: list[float] | None


@dataclass(slots=True)
class IntentVectorPack:
    centroid: list[float]
    aliases: list[list[float]]
    alias_texts: list[str]
    source: str


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    filtered = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in without_marks.lower())
    return " ".join(filtered.split())


def _l2normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(item * item for item in vector)) or 1.0
    return [item / norm for item in vector]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    length = min(len(a), len(b))
    dot = sum((a[idx] or 0.0) * (b[idx] or 0.0) for idx in range(length))
    norm_a = math.sqrt(sum((a[idx] or 0.0) ** 2 for idx in range(length)))
    norm_b = math.sqrt(sum((b[idx] or 0.0) ** 2 for idx in range(length)))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _parse_vector(raw_value: str | None) -> list[float] | None:
    if not raw_value:
        return None
    cleaned = raw_value.strip().removeprefix("[").removesuffix("]")
    if not cleaned:
        return None
    try:
        return [float(chunk.strip()) for chunk in cleaned.split(",") if chunk.strip()]
    except ValueError:
        return None


def _has_legal_keywords(text_value: str) -> bool:
    lowered = (text_value or "").lower()
    return any(keyword in lowered for keyword in LEGAL_KEYWORDS)


def _perform_keyword_matching(user_text: str, intents: list[IntentRow]) -> list[IntentCandidate]:
    lowered = (user_text or "").lower()
    matches: list[IntentCandidate] = []
    for intent in intents:
        score = 0.0
        name = (intent.name or "").lower()
        description = (intent.description or "").lower()
        keywords = [token for token in f"{name} {description}".split() if len(token) > 2]
        for keyword in keywords:
            if keyword in lowered:
                score += 0.1
        if name and name in lowered:
            score += 0.3
        if score > 0:
            matches.append(
                IntentCandidate(
                    slug=intent.slug,
                    name=intent.name,
                    desc=intent.description or "",
                    score=min(score, 0.6),
                    threshold=intent.similarity_threshold or 0.8,
                )
            )
    matches.sort(key=lambda item: item.score or 0, reverse=True)
    return matches[:3]


async def _load_active_intents(user_id: str) -> list[IntentRow]:
    async with session_ctx() as session:
        result = await session.execute(
            text(
                """
                SELECT
                    id,
                    name,
                    slug,
                    description,
                    "similarityThreshold" AS similarity_threshold,
                    embedding::TEXT AS embedding
                FROM "Intent"
                WHERE "createdById" = :user_id
                  AND "isActive" = true
                """
            ),
            {"user_id": user_id},
        )
        rows = result.mappings().all()

    return [
        IntentRow(
            id=str(row["id"]),
            name=str(row["name"]),
            slug=str(row["slug"]),
            description=row["description"],
            similarity_threshold=float(row["similarity_threshold"] or 0.8),
            embedding=_parse_vector(row["embedding"]),
        )
        for row in rows
    ]


async def _load_vector_pack(redis_client: Redis, intent: IntentRow) -> IntentVectorPack | None:
    try:
        raw_hash = await redis_client.hgetall(f"ai:intent:{intent.id}:emb")
        if raw_hash and raw_hash.get("centroid"):
            centroid = raw_hash.get("centroid")
            aliases = raw_hash.get("aliases")
            alias_texts = raw_hash.get("aliases_text")
            parsed_centroid = _parse_vector(centroid)
            parsed_aliases = []
            if aliases:
                import json

                parsed_aliases_raw = json.loads(aliases)
                if isinstance(parsed_aliases_raw, list):
                    parsed_aliases = [
                        _l2normalize([float(value) for value in vector])
                        for vector in parsed_aliases_raw
                        if isinstance(vector, list)
                    ]
            parsed_alias_texts: list[str] = []
            if alias_texts:
                import json

                loaded_alias_texts = json.loads(alias_texts)
                if isinstance(loaded_alias_texts, list):
                    parsed_alias_texts = [str(item) for item in loaded_alias_texts]
            if parsed_centroid:
                return IntentVectorPack(
                    centroid=_l2normalize(parsed_centroid),
                    aliases=parsed_aliases,
                    alias_texts=parsed_alias_texts,
                    source="redis",
                )
    except Exception as exc:
        logger.warning("intent_vector_pack_redis_error", intent_id=intent.id, error=str(exc))

    if intent.embedding:
        return IntentVectorPack(
            centroid=_l2normalize(intent.embedding),
            aliases=[],
            alias_texts=[],
            source="db",
        )
    return None


async def _generate_query_embedding(
    user_text: str,
    cache_config: CacheKeyConfig | None,
    cache: SocialwiseIntentCache | None,
) -> list[float] | None:
    if cache and cache_config:
        cached = await cache.get_embedding(cache_config, user_text)
        if cached:
            return cached

    model = resolve_litellm_model("openai", settings.openai_embedding_model)
    try:
        response = await call_embedding(
            model,
            user_text,
            timeout=10,
            retries=2,
            base_delay_ms=500,
            max_delay_ms=2000,
        )
    except Exception as exc:
        logger.warning("intent_query_embedding_error", error=str(exc))
        return None

    vector = response.vectors[0] if response.vectors else None
    if not vector:
        return None
    normalized = _l2normalize(vector)
    if cache and cache_config:
        await cache.set_embedding(cache_config, user_text, normalized)
    return normalized


async def classify_intent(
    user_text: str,
    user_id: str,
    agent: AssistantConfig,
    *,
    embedipreview: bool = True,
    channel_type: str = "whatsapp",
    inbox_id: str = "",
    trace_id: str | None = None,
    cache_config: CacheKeyConfig | None = None,
    cache: SocialwiseIntentCache | None = None,
) -> ClassificationResult:
    start = perf_counter()
    cache_client = cache or SocialwiseIntentCache()

    if cache_config:
        cached = await cache_client.get_classification_result(cache_config, user_text)
        if cached:
            return cached

    if not embedipreview:
        result = ClassificationResult(
            band="ROUTER",
            score=1.0,
            candidates=[],
            strategy="router_llm_bypass",
            metrics=ClassificationMetrics(route_total_ms=0),
        )
        if cache_config:
            await cache_client.set_classification_result(cache_config, user_text, result)
        return result

    intents = await _load_active_intents(user_id)
    if not intents:
        result = ClassificationResult(
            band="ROUTER",
            score=0.0,
            candidates=[],
            strategy="router_llm",
            metrics=ClassificationMetrics(route_total_ms=int((perf_counter() - start) * 1000)),
        )
        if cache_config:
            await cache_client.set_classification_result(cache_config, user_text, result)
        return result

    redis_client = Redis.from_url(str(settings.redis_url), decode_responses=True)
    packs: dict[str, IntentVectorPack] = {}
    normalized_text = _normalize_text(user_text)
    best_alias_hit: tuple[IntentRow, str] | None = None

    for intent in intents:
        pack = await _load_vector_pack(redis_client, intent)
        if not pack:
            continue
        packs[intent.id] = pack
        for alias in pack.alias_texts:
            normalized_alias = _normalize_text(alias)
            if normalized_alias and normalized_alias in normalized_text:
                if best_alias_hit is None or len(normalized_alias) > len(_normalize_text(best_alias_hit[1])):
                    best_alias_hit = (intent, alias)

    if best_alias_hit:
        hit_intent, alias = best_alias_hit
        result = ClassificationResult(
            band="HARD",
            score=0.95,
            candidates=[
                IntentCandidate(
                    slug=hit_intent.slug,
                    name=hit_intent.name,
                    desc=hit_intent.description or "",
                    score=0.95,
                    threshold=hit_intent.similarity_threshold or 0.8,
                    aliases=packs.get(hit_intent.id, IntentVectorPack([], [], [], "db")).alias_texts,
                    alias_matched=alias,
                )
            ],
            strategy="direct_map",
            metrics=ClassificationMetrics(
                route_total_ms=int((perf_counter() - start) * 1000),
                embedding_ms=0,
            ),
        )
        if cache_config:
            await cache_client.set_classification_result(cache_config, user_text, result)
        return result

    embedding_started = perf_counter()
    query_vector = await _generate_query_embedding(user_text, cache_config, cache_client if cache_config else None)
    embedding_ms = int((perf_counter() - embedding_started) * 1000)
    degraded = query_vector is None

    candidates: list[IntentCandidate] = []
    if query_vector is None:
        candidates = _perform_keyword_matching(user_text, intents)
    else:
        for intent in intents:
            pack = packs.get(intent.id)
            if not pack:
                pack = await _load_vector_pack(redis_client, intent)
                if not pack:
                    continue
                packs[intent.id] = pack

            centroid_score = _cosine_similarity(query_vector, pack.centroid)
            alias_scores = [_cosine_similarity(query_vector, alias_vector) for alias_vector in pack.aliases]
            best_alias_score = max(alias_scores) if alias_scores else float("-inf")
            score = max(centroid_score, best_alias_score)
            alias_index = alias_scores.index(best_alias_score) if alias_scores else -1
            alias_matched = pack.alias_texts[alias_index] if alias_index >= 0 and alias_index < len(pack.alias_texts) else None
            candidates.append(
                IntentCandidate(
                    slug=intent.slug,
                    name=intent.name,
                    desc=intent.description or "",
                    score=score if math.isfinite(score) else 0.0,
                    threshold=intent.similarity_threshold or 0.8,
                    aliases=pack.alias_texts,
                    alias_matched=alias_matched,
                )
            )
        candidates.sort(key=lambda item: item.score or 0, reverse=True)
        candidates = candidates[:5]

    score = (candidates[0].score or 0.0) if candidates else 0.0
    hard_threshold = 0.5 if degraded else 0.8
    soft_threshold = 0.3 if degraded else 0.65

    if not candidates:
        band = "ROUTER"
        strategy = "router_llm"
    elif score >= hard_threshold:
        band = "HARD"
        strategy = "direct_map_degraded" if degraded else "direct_map"
        candidates = candidates[:1]
    elif score >= soft_threshold or (_has_legal_keywords(user_text) and score >= 0.4):
        band = "SOFT"
        strategy = "warmup_buttons_degraded" if degraded else "warmup_buttons"
        candidates = candidates[:3]
    else:
        band = "ROUTER"
        strategy = "router_llm"
        candidates = candidates[:3]

    result = ClassificationResult(
        band=band,
        score=score,
        candidates=candidates,
        strategy=strategy,
        metrics=ClassificationMetrics(
            route_total_ms=int((perf_counter() - start) * 1000),
            embedding_ms=embedding_ms,
        ),
    )
    logger.info(
        "intent_classification_complete",
        user_id=user_id,
        inbox_id=inbox_id,
        channel_type=channel_type,
        trace_id=trace_id,
        band=result.band,
        strategy=result.strategy,
        score=score,
        degraded=degraded,
        candidates=[candidate.slug for candidate in result.candidates],
    )
    if cache_config:
        await cache_client.set_classification_result(cache_config, user_text, result)
    return result
