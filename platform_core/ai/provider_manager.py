"""Dynamic AI provider selection with fallback chains and rate limiting.

Extracted from domains/jusmonitoria/ai/providers/litellm_config.py into shared
platform_core so both Socialwise and JusMonitorIA can use the same infra.

Provider chains (default/document/daily) are configured via environment variables
in platform_core.config.Settings. Domains may extend ProviderManager to add
DB-backed provider loading (e.g. multi-tenant AIProvider table).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from platform_core.ai.litellm_config import (
    CircuitBreaker,
    LLMResponse,
    call_completion,
    call_embedding,
    resolve_litellm_model,
)
from platform_core.config import settings
from platform_core.logging.config import get_logger

logger = get_logger(__name__)


# ── Provider chain entry ─────────────────────────────────────────────────


@dataclass
class ProviderEntry:
    """Single provider in a fallback chain."""

    provider: str
    model: str
    api_key: str = ""
    temperature: float | None = None
    max_tokens: int | None = None
    priority: int = 0

    @property
    def is_usable(self) -> bool:
        return bool(self.api_key)


# ── Rate limiter (token bucket per provider) ─────────────────────────────


class RateLimiter:
    """In-process token-bucket rate limiter per provider key."""

    def __init__(self) -> None:
        self._buckets: dict[str, dict[str, Any]] = {}

    async def acquire(
        self,
        provider_key: str,
        rate_limit_per_minute: int = 60,
    ) -> bool:
        current_time = asyncio.get_event_loop().time()

        if provider_key not in self._buckets:
            self._buckets[provider_key] = {
                "tokens": rate_limit_per_minute,
                "last_update": current_time,
                "rate": rate_limit_per_minute,
            }

        bucket = self._buckets[provider_key]
        time_passed = current_time - bucket["last_update"]
        tokens_to_add = time_passed * (bucket["rate"] / 60.0)
        bucket["tokens"] = min(bucket["rate"], bucket["tokens"] + tokens_to_add)
        bucket["last_update"] = current_time

        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return True
        return False


# ── Provider Manager ─────────────────────────────────────────────────────


class ProviderManager:
    """Select and call LLM providers with fallback, circuit breaker, and rate limiting.

    Builds three provider chains from ``platform_core.config.settings``:
    - **default** — general purpose (Groq → OpenAI → Google → Anthropic)
    - **document** — document/petition analysis (more capable models)
    - **daily** — scheduled routines (fast/cheap models)

    Domains can subclass and override ``_load_provider_chain`` to add DB-backed
    provider loading (e.g. per-tenant AIProvider table in JusMonitorIA).
    """

    def __init__(self) -> None:
        self._circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60)
        self._rate_limiter = RateLimiter()

        self._chains: dict[str, list[ProviderEntry]] = {
            "default": self._build_default_chain(),
            "document": self._build_document_chain(),
            "daily": self._build_daily_chain(),
        }

    # ── Chain builders (from env-based settings) ─────────────────────────

    def _build_default_chain(self) -> list[ProviderEntry]:
        return [
            ProviderEntry(provider="groq", model=settings.groq_model, api_key=settings.groq_api_key, temperature=settings.groq_temperature, max_tokens=settings.groq_max_tokens),
            ProviderEntry(provider="openai", model=settings.openai_model, api_key=settings.openai_api_key),
            ProviderEntry(provider="google", model=settings.google_model, api_key=settings.google_api_key),
            ProviderEntry(provider="anthropic", model=settings.anthropic_model, api_key=settings.anthropic_api_key),
        ]

    def _build_document_chain(self) -> list[ProviderEntry]:
        return [
            ProviderEntry(provider="groq", model=settings.groq_document_model, api_key=settings.groq_api_key, temperature=settings.groq_temperature, max_tokens=settings.groq_max_tokens),
            ProviderEntry(provider="google", model=settings.google_document_model, api_key=settings.google_api_key),
            ProviderEntry(provider="openai", model=settings.openai_document_model, api_key=settings.openai_api_key),
            ProviderEntry(provider="anthropic", model=settings.anthropic_model, api_key=settings.anthropic_api_key),
        ]

    def _build_daily_chain(self) -> list[ProviderEntry]:
        return [
            ProviderEntry(provider="groq", model=settings.groq_daily_model, api_key=settings.groq_api_key, temperature=settings.groq_temperature, max_tokens=settings.groq_max_tokens),
            ProviderEntry(provider="google", model=settings.google_daily_model, api_key=settings.google_api_key),
            ProviderEntry(provider="openai", model=settings.openai_daily_model, api_key=settings.openai_api_key),
            ProviderEntry(provider="anthropic", model=settings.anthropic_haiku_model, api_key=settings.anthropic_api_key),
        ]

    # ── Public API ───────────────────────────────────────────────────────

    def get_chain(self, use_case: str = "default") -> list[ProviderEntry]:
        """Return the provider chain for a given use case."""
        return self._chains.get(use_case, self._chains["default"])

    async def call_with_fallback(
        self,
        messages: list[dict[str, Any]],
        *,
        use_case: str = "default",
        temperature: float | None = None,
        max_tokens: int | None = None,
        providers: list[ProviderEntry] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Call LLM with automatic fallback between providers.

        Args:
            messages: Chat messages (role/content dicts).
            use_case: Chain selector — "default", "document", or "daily".
            temperature: Override temperature for this call.
            max_tokens: Override max tokens for this call.
            providers: Explicit provider list (overrides chain lookup).
            **kwargs: Extra params forwarded to litellm.

        Returns:
            LLMResponse with content and usage metadata.

        Raises:
            RuntimeError: If all providers fail.
        """
        chain = providers if providers is not None else [
            p for p in self.get_chain(use_case) if p.is_usable
        ]

        last_error: Exception | None = None

        for entry in chain:
            provider_key = f"{entry.provider}/{entry.model}"

            if not self._circuit_breaker.can_attempt(provider_key):
                continue

            rate_ok = await self._rate_limiter.acquire(
                provider_key,
                rate_limit_per_minute=settings.rate_limit_ai_per_minute,
            )
            if not rate_ok:
                await asyncio.sleep(0.1)
                continue

            try:
                model_str = resolve_litellm_model(entry.provider, entry.model)
                response = await call_completion(
                    model=model_str,
                    messages=messages,
                    api_key=entry.api_key or None,
                    temperature=temperature if temperature is not None else (entry.temperature or 0.0),
                    max_tokens=max_tokens or entry.max_tokens,
                    **kwargs,
                )
                self._circuit_breaker.record_success(provider_key)
                return response

            except Exception as e:
                self._circuit_breaker.record_failure(provider_key)
                last_error = e
                logger.warning(
                    "provider_fallback",
                    provider=entry.provider,
                    model=entry.model,
                    error=str(e)[:200],
                )
                continue

        raise RuntimeError(f"All AI providers failed. Last error: {last_error}")

    async def generate_embedding(
        self,
        text: str,
        *,
        model: str | None = None,
        api_key: str | None = None,
    ) -> list[list[float]]:
        """Generate embedding vectors.

        Uses OpenAI text-embedding model by default.
        """
        model_str = model or f"openai/{settings.openai_embedding_model}"
        key = api_key or settings.openai_api_key
        response = await call_embedding(model_str, text, api_key=key)
        return response.vectors


# Global singleton — domains may create their own instances or subclass.
provider_manager = ProviderManager()
