"""LiteLLM configuration with dynamic routing and fallback."""

import asyncio
from dataclasses import dataclass
from typing import Any

import litellm
from litellm import acompletion
from litellm.exceptions import (
    APIConnectionError,
    APIError,
    RateLimitError,
    Timeout,
)

from platform_core.config import settings
from domains.jusmonitoria.db.models.ai_provider import AIProvider


@dataclass
class LLMResponse:
    """Carries LLM text response together with usage metadata."""

    content: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    provider: str = "unknown"
    model: str = "unknown"


# Configure LiteLLM
litellm.drop_params = True  # Drop unsupported params instead of erroring
litellm.verbose = settings.debug


class CircuitBreaker:
    """Circuit breaker pattern for provider failures."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures: dict[str, int] = {}
        self.last_failure_time: dict[str, float] = {}
        self.is_open: dict[str, bool] = {}

    def record_failure(self, provider_key: str) -> None:
        """Record a failure for a provider."""
        self.failures[provider_key] = self.failures.get(provider_key, 0) + 1
        self.last_failure_time[provider_key] = asyncio.get_event_loop().time()

        if self.failures[provider_key] >= self.failure_threshold:
            self.is_open[provider_key] = True

    def record_success(self, provider_key: str) -> None:
        """Record a success for a provider."""
        self.failures[provider_key] = 0
        self.is_open[provider_key] = False

    def can_attempt(self, provider_key: str) -> bool:
        """Check if we can attempt to use this provider."""
        if not self.is_open.get(provider_key, False):
            return True

        # Check if recovery timeout has passed
        last_failure = self.last_failure_time.get(provider_key, 0)
        current_time = asyncio.get_event_loop().time()

        if current_time - last_failure > self.recovery_timeout:
            # Try to recover
            self.failures[provider_key] = 0
            self.is_open[provider_key] = False
            return True

        return False


class RateLimiter:
    """Token bucket rate limiter per provider."""

    def __init__(self):
        self.buckets: dict[str, dict[str, Any]] = {}

    async def acquire(
        self,
        provider_key: str,
        rate_limit_per_minute: int = 60,
    ) -> bool:
        """Acquire a token from the rate limit bucket."""
        current_time = asyncio.get_event_loop().time()

        if provider_key not in self.buckets:
            self.buckets[provider_key] = {
                "tokens": rate_limit_per_minute,
                "last_update": current_time,
                "rate": rate_limit_per_minute,
            }

        bucket = self.buckets[provider_key]

        # Refill tokens based on time passed
        time_passed = current_time - bucket["last_update"]
        tokens_to_add = time_passed * (bucket["rate"] / 60.0)
        bucket["tokens"] = min(bucket["rate"], bucket["tokens"] + tokens_to_add)
        bucket["last_update"] = current_time

        # Try to consume a token
        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return True

        return False


class LiteLLMConfig:
    """
    LiteLLM configuration with dynamic routing and fallback.

    Supports fallback chain: OpenAI -> Gemini (Google) -> Anthropic
    Implements rate limiting, retry logic, and circuit breaker pattern.
    """

    def __init__(self):
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
        )
        self.rate_limiter = RateLimiter()

        # Configure default fallback providers (uso geral)
        self.default_providers = [
            {
                "provider": "groq",
                "model": settings.groq_model,  # llama-3.3-70b-versatile (override via env if gpt-oss-120b is enabled)
                "api_key": settings.groq_api_key,
                "temperature": settings.groq_temperature,
                "max_tokens": settings.groq_max_tokens,
            },
            {
                "provider": "openai",
                "model": settings.openai_model,         # gpt-4.1
                "api_key": settings.openai_api_key,
            },
            {
                "provider": "google",
                "model": settings.google_model,         # gemini-flash-latest
                "api_key": settings.google_api_key,
            },
            {
                "provider": "anthropic",
                "model": settings.anthropic_model,      # claude-sonnet-4-6
                "api_key": settings.anthropic_api_key,
            },
        ]

        # Providers para análise de documentos/petições (modelos mais capazes)
        self.document_providers = [
            {
                "provider": "groq",
                "model": settings.groq_document_model,
                "api_key": settings.groq_api_key,
                "temperature": settings.groq_temperature,
                "max_tokens": settings.groq_max_tokens,
            },
            {
                "provider": "google",
                "model": settings.google_document_model,    # gemini-3-flash-preview
                "api_key": settings.google_api_key,
            },
            {
                "provider": "openai",
                "model": settings.openai_document_model,    # gpt-4.1
                "api_key": settings.openai_api_key,
            },
            {
                "provider": "anthropic",
                "model": settings.anthropic_model,          # claude-sonnet-4-6
                "api_key": settings.anthropic_api_key,
            },
        ]

        # Providers para rotinas diárias (DataJud poller / briefing matinal — modelos rápidos)
        self.daily_providers = [
            {
                "provider": "groq",
                "model": settings.groq_daily_model,
                "api_key": settings.groq_api_key,
                "temperature": settings.groq_temperature,
                "max_tokens": settings.groq_max_tokens,
            },
            {
                "provider": "google",
                "model": settings.google_daily_model,       # gemini-flash-latest
                "api_key": settings.google_api_key,
            },
            {
                "provider": "openai",
                "model": settings.openai_daily_model,       # gpt-4.1-mini
                "api_key": settings.openai_api_key,
            },
            {
                "provider": "anthropic",
                "model": settings.anthropic_haiku_model,    # claude-haiku-4-5-20251001
                "api_key": settings.anthropic_api_key,
            },
        ]

    def _get_provider_key(self, provider: str, model: str) -> str:
        """Generate unique key for provider/model combination."""
        return f"{provider}/{model}"

    def _decrypt_api_key(self, encrypted_key: str) -> str:
        """Decrypt API key stored with Fernet encryption."""
        from domains.jusmonitoria.crypto import decrypt
        try:
            return decrypt(encrypted_key)
        except Exception:
            # Fallback: key may still be plaintext (pre-migration)
            return encrypted_key

    def _is_usable_provider(self, config: dict[str, Any]) -> bool:
        """Skip providers that do not have a configured API key."""
        return bool(config.get("api_key"))

    def _sort_provider_configs(self, provider_configs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Prefer Groq first while preserving explicit priority ordering per provider."""
        return sorted(
            provider_configs,
            key=lambda config: (
                0 if config.get("provider") == "groq" else 1,
                -config.get("priority", 0),
            ),
        )

    async def call_with_fallback(
        self,
        messages: list[dict[str, str]],
        providers: list[AIProvider] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        use_case: str = "default",  # "default" | "document" | "daily"
        **kwargs: Any,
    ) -> LLMResponse:
        """
        Call LLM with automatic fallback between providers.

        Args:
            messages: List of message dicts with 'role' and 'content'
            providers: List of AIProvider instances (from database)
            temperature: Override temperature
            max_tokens: Override max tokens
            use_case: Selects provider chain — "default" (geral), "document" (petições/documentos),
                      "daily" (rotinas DataJud / briefing matinal)
            **kwargs: Additional parameters for LiteLLM

        Returns:
            LLMResponse with content and token usage metadata

        Raises:
            Exception: If all providers fail
        """
        # Use database providers if provided, otherwise pick chain by use_case
        provider_configs = []

        if providers:
            for provider in providers:
                if not provider.is_active:
                    continue

                provider_configs.append({
                    "provider": provider.provider,
                    "model": provider.model,
                    "api_key": self._decrypt_api_key(provider.api_key_encrypted),
                    "temperature": temperature or float(provider.temperature),
                    "max_tokens": max_tokens or provider.max_tokens,
                    "priority": provider.priority,
                })

            provider_configs = self._sort_provider_configs(provider_configs)
        else:
            chain_map = {
                "document": self.document_providers,
                "daily": self.daily_providers,
            }
            provider_configs = [
                config for config in chain_map.get(use_case, self.default_providers)
                if self._is_usable_provider(config)
            ]

        last_error: Exception | None = None

        for config in provider_configs:
            provider_key = self._get_provider_key(
                config["provider"],
                config["model"],
            )

            # Check circuit breaker
            if not self.circuit_breaker.can_attempt(provider_key):
                continue

            # Check rate limit
            rate_limit_ok = await self.rate_limiter.acquire(
                provider_key,
                rate_limit_per_minute=settings.rate_limit_ai_per_minute,
            )

            if not rate_limit_ok:
                # Wait a bit and try next provider
                await asyncio.sleep(0.1)
                continue

            # Attempt to call provider
            try:
                response = await self._call_provider(
                    messages=messages,
                    config=config,
                    **kwargs,
                )

                # Success! Record it and return
                self.circuit_breaker.record_success(provider_key)
                return response

            except (RateLimitError, Timeout, APIConnectionError, APIError) as e:
                # Record failure and try next provider
                self.circuit_breaker.record_failure(provider_key)
                last_error = e
                continue

        # All providers failed
        raise Exception(
            f"All AI providers failed. Last error: {last_error}"
        )

    async def _call_provider(
        self,
        messages: list[dict[str, str]],
        config: dict[str, Any],
        **kwargs: Any,
    ) -> LLMResponse:
        """
        Call a specific provider with retry logic.

        Implements exponential backoff: 1s, 2s, 4s
        """
        model_name = f"{config['provider']}/{config['model']}"

        for attempt in range(settings.litellm_retry_attempts):
            try:
                response = await acompletion(
                    model=model_name,
                    messages=messages,
                    api_key=config["api_key"],
                    temperature=config.get("temperature", settings.openai_temperature),
                    max_tokens=config.get("max_tokens", settings.openai_max_tokens),
                    timeout=settings.litellm_timeout_seconds,
                    **kwargs,
                )

                usage = getattr(response, "usage", None)
                return LLMResponse(
                    content=response.choices[0].message.content,
                    input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                    output_tokens=getattr(usage, "completion_tokens", 0) or 0,
                    total_tokens=getattr(usage, "total_tokens", 0) or 0,
                    provider=config["provider"],
                    model=config["model"],
                )

            except (RateLimitError, Timeout, APIConnectionError):
                if attempt < settings.litellm_retry_attempts - 1:
                    # Exponential backoff
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue
                raise

    async def generate_embedding(
        self,
        text: str,
        provider: AIProvider | None = None,
    ) -> list[float]:
        """
        Generate embedding vector for text.

        Uses OpenAI text-embedding-3-small by default.
        """
        if provider:
            model_name = f"{provider.provider}/{provider.model}"
            api_key = self._decrypt_api_key(provider.api_key_encrypted)
        else:
            model_name = f"openai/{settings.openai_embedding_model}"
            api_key = settings.openai_api_key

        response = await litellm.aembedding(
            model=model_name,
            input=text,
            api_key=api_key,
        )

        return response.data[0]["embedding"]


# Global instance
litellm_config = LiteLLMConfig()
